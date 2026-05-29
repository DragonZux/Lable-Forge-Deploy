import json
import os
import tempfile
import logging
import re
import shutil
from typing import Dict, Any

logger = logging.getLogger(__name__)

def slugify(text: str) -> str:
    """Helper to convert job titles into valid Kaggle slug names (alphanumeric and dashes)."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\-]', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def generate_kaggle_notebook_dict(params: Dict[str, Any]) -> Dict[str, Any]:
    """Generates the JSON dictionary of a Jupyter Notebook configured for headless training."""
    
    # 1. Config cell
    config_source = [
        "# =========================================================\n",
        "# LABEL FORGE AUTOMATED TRAINING CONFIGURATION\n",
        "# =========================================================\n",
        f"JOB_ID = {repr(params['JOB_ID'])}\n",
        f"DATASET_URL = {repr(params['DATASET_URL'])}\n",
        f"CALLBACK_URL = {repr(params['CALLBACK_URL'])}\n",
        f"ARCHITECTURE = {repr(params['ARCHITECTURE'])}\n",
        f"EPOCHS = {int(params['EPOCHS'])}\n",
        f"BATCH_SIZE = {int(params['BATCH_SIZE'])}\n",
        f"IMAGE_SIZE = {int(params['IMAGE_SIZE'])}\n",
        f"LEARNING_RATE = {float(params['LEARNING_RATE'])}\n",
        f"PATIENCE = {int(params['PATIENCE'])}\n",
        f"CONFIDENCE_THRESHOLD = {float(params['CONFIDENCE_THRESHOLD'])}\n",
    ]

    # 2. Setup cell
    setup_source = [
        "import subprocess\n",
        "import sys\n",
        "\n",
        "print(\"=== Starting Headless Training Setup ===\")\n",
        "\n",
        "# 1. Self-heal Tesla P100 PyTorch CUDA incompatibility if detected\n",
        "try:\n",
        "    gpu_info = subprocess.check_output([\"nvidia-smi\", \"--query-gpu=name\", \"--format=csv,noheader\"]).decode(\"utf-8\")\n",
        "    print(\"Detected GPU:\", gpu_info.strip())\n",
        "    if \"P100\" in gpu_info:\n",
        "        print(\"Tesla P100 detected! Kaggle PyTorch lacks sm_60 support. Reinstalling official PyTorch...\")\n",
        "        subprocess.check_call([sys.executable, \"-m\", \"pip\", \"install\", \"--force-reinstall\", \"torch\", \"torchvision\", \"torchaudio\", \"--index-url\", \"https://download.pytorch.org/whl/cu121\"])\n",
        "except Exception as e:\n",
        "    print(\"GPU compatibility check skipped:\", e)\n",
        "\n",
        "# 2. Fix Pillow compatibility (Pillow 12.0.0 removed internal _Ink symbol, breaking ultralytics)\n",
        "print(\"Fixing Pillow compatibility...\")\n",
        "try:\n",
        "    subprocess.check_call([sys.executable, \"-m\", \"pip\", \"uninstall\", \"-y\", \"Pillow\", \"PIL\"], stderr=subprocess.DEVNULL)\n",
        "except Exception:\n",
        "    pass\n",
        "subprocess.check_call([sys.executable, \"-m\", \"pip\", \"install\", \"Pillow<12.0.0\"])\n",
        "print(\"Pillow compatibility fix applied.\")\n",
        "\n",
        "# 3. Install ultralytics library\n",
        "print(\"Installing ultralytics library...\")\n",
        "try:\n",
        "    subprocess.check_call([sys.executable, \"-m\", \"pip\", \"install\", \"-U\", \"ultralytics\"])\n",
        "    print(\"ultralytics installed successfully.\")\n",
        "except Exception as e:\n",
        "    print(\"Failed to install ultralytics:\", e)\n",
        "    raise e\n"
    ]

    # 3. Execution cell
    execution_source = [
        "import os\n",
        "import requests\n",
        "import zipfile\n",
        "import io\n",
        "import shutil\n",
        "import textwrap\n",
        "\n",
        "print(\"=== Starting Headless Training Execution ===\")\n",
        "print(f\"Job ID: {JOB_ID}\")\n",
        "\n",
        "try:\n",
        "    # 1. Download dataset\n",
        "    print(\"\\n--- Step 1: Downloading Dataset ---\")\n",
        "    print(f\"Source: {DATASET_URL}\")\n",
        "    response = requests.get(DATASET_URL, timeout=120)\n",
        "    content_type = response.headers.get(\"content-type\", \"\")\n",
        "    print(f\"Download response: {response.status_code}, content-type: {content_type}, bytes: {len(response.content)}\")\n",
        "    if response.status_code != 200:\n",
        "        preview = response.text[:500] if response.text else \"\"\n",
        "        raise RuntimeError(f\"Failed to download dataset. Status code: {response.status_code}. Response preview: {preview}\")\n",
        "    if not zipfile.is_zipfile(io.BytesIO(response.content)):\n",
        "        preview = response.content[:500].decode(\"utf-8\", errors=\"replace\")\n",
        "        preview = \" \".join(preview.split())\n",
        "        raise RuntimeError(\n",
        "            \"Dataset download did not return a ZIP file. \"\n",
        "            f\"Content-Type: {content_type or 'missing'}. \"\n",
        "            f\"Response preview: {textwrap.shorten(preview, width=500, placeholder='...')}\"\n",
        "        )\n",
        "    \n",
        "    # 2. Extract dataset\n",
        "    print(\"\\n--- Step 2: Extracting Dataset ---\")\n",
        "    dataset_dir = \"/kaggle/working/dataset\"\n",
        "    os.makedirs(dataset_dir, exist_ok=True)\n",
        "    with zipfile.ZipFile(io.BytesIO(response.content)) as zip_ref:\n",
        "        zip_ref.extractall(dataset_dir)\n",
        "    print(\"Dataset successfully extracted to:\", dataset_dir)\n",
        "\n",
        "    # Validate data.yaml and detect classification\n",
        "    data_yaml = os.path.join(dataset_dir, \"data.yaml\")\n",
        "    is_classification = not os.path.exists(data_yaml)\n",
        "\n",
        "    if is_classification:\n",
        "        print(\"Classification dataset detected (no data.yaml found).\")\n",
        "        valid_dir = os.path.join(dataset_dir, \"valid\")\n",
        "        val_dir = os.path.join(dataset_dir, \"val\")\n",
        "        if os.path.isdir(valid_dir) and not os.path.exists(val_dir):\n",
        "            os.rename(valid_dir, val_dir)\n",
        "            \n",
        "        train_images_dir = os.path.join(dataset_dir, \"train\")\n",
        "        valid_images_dir = val_dir\n",
        "        \n",
        "        def count_class_images(directory):\n",
        "            if not os.path.isdir(directory):\n",
        "                return 0\n",
        "            total = 0\n",
        "            for root, dirs, files in os.walk(directory):\n",
        "                for f in files:\n",
        "                    if f.lower().endswith((\".jpg\", \".jpeg\", \".png\", \".bmp\", \".webp\")):\n",
        "                        total += 1\n",
        "            return total\n",
        "\n",
        "        if count_class_images(valid_images_dir) == 0:\n",
        "            print(\"Warning: No validation images found for classification. Copying train split to val split.\")\n",
        "            if os.path.exists(valid_images_dir):\n",
        "                try:\n",
        "                    shutil.rmtree(valid_images_dir)\n",
        "                except Exception:\n",
        "                    pass\n",
        "            shutil.copytree(train_images_dir, valid_images_dir)\n",
        "            \n",
        "        model_name = f\"{ARCHITECTURE}-cls.pt\" if not ARCHITECTURE.endswith(\"-cls\") else f\"{ARCHITECTURE}.pt\"\n",
        "        data_arg = dataset_dir\n",
        "    else:\n",
        "        print(\"Object detection dataset detected (data.yaml found).\")\n",
        "        model_name = f\"{ARCHITECTURE}.pt\"\n",
        "        data_arg = data_yaml\n",
        "\n",
        "    # 3. Train YOLO Model\n",
        "    print(\"\\n--- Step 3: Launching YOLOv8 Training ---\")\n",
        "    from ultralytics import YOLO\n",
        "    import torch\n",
        "    \n",
        "    device_arg = 0\n",
        "    if torch.cuda.is_available():\n",
        "        num_gpus = torch.cuda.device_count()\n",
        "        if num_gpus > 1:\n",
        "            device_arg = ','.join(str(i) for i in range(num_gpus))\n",
        "            print(f'Multi-GPU training detected! Using device: {device_arg}')\n",
        "        else:\n",
        "            print('Single GPU training detected. Using device: 0')\n",
        "    else:\n",
        "        device_arg = 'cpu'\n",
        "        print('No GPU available. Training on CPU.')\n",
        "    \n",
        "    model = YOLO(model_name)\n",
        "    train_results = model.train(\n",
        "        data=data_arg,\n",
        "        epochs=EPOCHS,\n",
        "        imgsz=IMAGE_SIZE,\n",
        "        batch=BATCH_SIZE,\n",
        "        lr0=LEARNING_RATE,\n",
        "        patience=PATIENCE,\n",
        "        project=\"/kaggle/working/runs\",\n",
        "        name=\"train\",\n",
        "        exist_ok=True,\n",
        "        workers=4 if torch.cuda.is_available() and torch.cuda.device_count() > 1 else 2,\n",
        "        device=device_arg,\n",
        "        verbose=True\n",
        "    )\n",
        "    print(\"Training process finished successfully.\")\n",
        "\n",
        "    # 4. Perform evaluation on validation set\n",
        "    print(\"\\n--- Step 4: Evaluating Best Model ---\")\n",
        "    best_model_path = \"/kaggle/working/runs/train/weights/best.pt\"\n",
        "    if not os.path.exists(best_model_path):\n",
        "        raise RuntimeError(\"Training completed but best.pt weights were not created\")\n",
        "\n",
        "    trained_model = YOLO(best_model_path)\n",
        "    if is_classification:\n",
        "        validation = trained_model.val(data=dataset_dir, imgsz=IMAGE_SIZE, verbose=False)\n",
        "    else:\n",
        "        validation = trained_model.val(data=data_yaml, imgsz=IMAGE_SIZE, verbose=False)\n",
        "    metrics = getattr(validation, \"results_dict\", {}) or {}\n",
        "\n",
        "    def get_metric_value(metrics_dict, keys):\n",
        "        for key in keys:\n",
        "            if key in metrics_dict:\n",
        "                return float(metrics_dict[key])\n",
        "        return 0.0\n",
        "\n",
        "    if is_classification:\n",
        "        map_score = get_metric_value(metrics, [\"metrics/accuracy_top1\"])\n",
        "        precision = get_metric_value(metrics, [\"metrics/accuracy_top5\"])\n",
        "        recall = 0.0\n",
        "    else:\n",
        "        map_score = get_metric_value(metrics, [\"metrics/mAP50-95(B)\", \"metrics/mAP50-95\"])\n",
        "        precision = get_metric_value(metrics, [\"metrics/precision(B)\", \"metrics/precision\"])\n",
        "        recall = get_metric_value(metrics, [\"metrics/recall(B)\", \"metrics/recall\"])\n",
        "    print(f\"Validation Results -> Score: {map_score}, Precision: {precision}, Recall: {recall}\")\n",
        "\n",
        "    # 5. Compile validation sample predictions\n",
        "    print(\"\\n--- Step 5: Generating Predictions Samples ---\")\n",
        "    sample_images_dir = val_dir if is_classification else os.path.join(dataset_dir, \"valid\", \"images\")\n",
        "    predictions = []\n",
        "    if os.path.isdir(sample_images_dir):\n",
        "        image_paths = []\n",
        "        for root, dirs, files in os.walk(sample_images_dir):\n",
        "            for filename in files:\n",
        "                if filename.lower().endswith((\".jpg\", \".jpeg\", \".png\", \".bmp\", \".webp\")):\n",
        "                    image_paths.append(os.path.join(root, filename))\n",
        "                if len(image_paths) >= 6:\n",
        "                    break\n",
        "            if len(image_paths) >= 6:\n",
        "                break\n",
        "        if image_paths:\n",
        "            names = getattr(trained_model, \"names\", {}) or {}\n",
        "            results = trained_model.predict(image_paths, conf=CONFIDENCE_THRESHOLD, verbose=False)\n",
        "            for result in results:\n",
        "                img_name = os.path.basename(getattr(result, \"path\", \"sample.jpg\"))\n",
        "                if is_classification:\n",
        "                    probs = getattr(result, \"probs\", None)\n",
        "                    if probs is not None:\n",
        "                        top1_idx = int(probs.top1)\n",
        "                        top1_conf = float(probs.top1conf.item() if hasattr(probs.top1conf, \"item\") else probs.top1conf)\n",
        "                        predictions.append({\n",
        "                            \"image_name\": img_name,\n",
        "                            \"class_name\": names.get(top1_idx, str(top1_idx)),\n",
        "                            \"confidence\": round(top1_conf, 4),\n",
        "                            \"bbox\": None\n",
        "                        })\n",
        "                else:\n",
        "                    boxes = getattr(result, \"boxes\", None)\n",
        "                    if boxes is not None:\n",
        "                        for box in boxes[:1]:\n",
        "                            cls_idx = int(box.cls[0].item())\n",
        "                            xywhn = box.xywhn[0].tolist()\n",
        "                            predictions.append({\n",
        "                                \"image_name\": img_name,\n",
        "                                \"class_name\": names.get(cls_idx, str(cls_idx)),\n",
        "                                \"confidence\": round(float(box.conf[0].item()), 4),\n",
        "                                \"bbox\": {\n",
        "                                    \"x\": round(float(xywhn[0] - xywhn[2]/2), 4),\n",
        "                                    \"y\": round(float(xywhn[1] - xywhn[3]/2), 4),\n",
        "                                    \"width\": round(float(xywhn[2]), 4),\n",
        "                                    \"height\": round(float(xywhn[3]), 4)\n",
        "                                }\n",
        "                            })\n",
        "    print(f\"Compiled {len(predictions)} validation samples.\")\n",
        "\n",
        "    # 6. Upload weight artifacts\n",
        "    print(\"\\n--- Step 6: Uploading Weights to Label Forge ---\")\n",
        "    upload_url = CALLBACK_URL.replace(\"/colab-callback\", \"/upload-artifact\")\n",
        "    with open(best_model_path, \"rb\") as f:\n",
        "        files = {\"file\": (\"best.pt\", f, \"application/octet-stream\")}\n",
        "        upload_response = requests.post(upload_url, files=files)\n",
        "    \n",
        "    if upload_response.status_code != 200:\n",
        "        raise RuntimeError(f\"Artifact upload failed with status code {upload_response.status_code}: {upload_response.text}\")\n",
        "    \n",
        "    model_url = upload_response.json().get(\"model_url\")\n",
        "    print(\"Artifact successfully uploaded S3 Key:\", model_url)\n",
        "\n",
        "    # 7. Post success callback\n",
        "    print(\"\\n--- Step 7: Publishing Success Callback ---\")\n",
        "    success_payload = {\n",
        "        \"status\": \"done\",\n",
        "        \"metrics\": {\n",
        "            \"map_score\": map_score,\n",
        "            \"precision\": precision,\n",
        "            \"recall\": recall,\n",
        "            \"epochs\": EPOCHS\n",
        "        },\n",
        "        \"model_url\": model_url,\n",
        "        \"sample_predictions\": predictions\n",
        "    }\n",
        "    callback_response = requests.post(CALLBACK_URL, json=success_payload)\n",
        "    print(\"Callback status response:\", callback_response.status_code, callback_response.text)\n",
        "    print(\"=== Headless Kaggle Execution Complete ===\")\n",
        "\n",
        "except Exception as e:\n",
        "    print(\"\\n=== ERROR DETECTED DURING HUAN LUYEN ===\")\n",
        "    print(str(e))\n",
        "    error_payload = {\n",
        "        \"status\": \"failed\",\n",
        "        \"error\": str(e)\n",
        "    }\n",
        "    try:\n",
        "        requests.post(CALLBACK_URL, json=error_payload)\n",
        "        print(\"Successfully reported failure to backend.\")\n",
        "    except Exception as notify_err:\n",
        "        print(\"Failed to send error notification back to Label Forge:\", str(notify_err))\n",
        "    raise e\n"
    ]

    return {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": config_source
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": setup_source
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": execution_source
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    }

async def launch_kaggle_headless_job(
    user_kaggle_username: str,
    user_kaggle_key: str,
    job_id: str,
    params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Spins up a temporary folder, creates the dynamic ipynb notebook,
    authenticates using user API credentials, and pushes the kernel to Kaggle.
    """
    
    # 1. Setup temporary directory
    temp_dir = tempfile.mkdtemp(prefix=f"labelforge_kaggle_push_{job_id}_")
    
    try:
        notebook_path = os.path.join(temp_dir, "notebook.ipynb")
        metadata_path = os.path.join(temp_dir, "kernel-metadata.json")
        
        # 2. Write notebook file
        notebook_content = generate_kaggle_notebook_dict(params)
        with open(notebook_path, "w", encoding="utf-8") as f:
            json.dump(notebook_content, f, indent=1)
            
        # 3. Create kernel metadata
        kernel_slug = slugify(f"label-forge-yolov8-train-{job_id}")
        
        metadata_content = {
            "id": f"{user_kaggle_username}/{kernel_slug}",
            "title": f"Label Forge YOLOv8 Train {job_id}",
            "code_file": "notebook.ipynb",
            "language": "python",
            "kernel_type": "notebook",
            "is_private": "true",
            "enable_gpu": "true",
            "enable_internet": "true",
            "dataset_sources": [],
            "competition_sources": [],
            "kernel_sources": []
        }
        
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata_content, f, indent=1)
            
        # 4. Inject kaggle credentials in the active environment
        os.environ["KAGGLE_USERNAME"] = user_kaggle_username
        os.environ["KAGGLE_KEY"] = user_kaggle_key
        
        logger.info(f"Authenticating with Kaggle API for user '{user_kaggle_username}'...")
        from kaggle.api.kaggle_api_extended import KaggleApi
        
        api = KaggleApi()
        api.authenticate()
        
        # 5. Push the kernel to Kaggle API
        logger.info(f"Pushing Kaggle Kernel '{user_kaggle_username}/{kernel_slug}' on GPU T4...")
        push_result = api.kernels_push(temp_dir)
        
        # Clean environment keys
        os.environ.pop("KAGGLE_USERNAME", None)
        os.environ.pop("KAGGLE_KEY", None)
        
        # Check return status or create link
        kaggle_url = f"https://www.kaggle.com/{user_kaggle_username}/{kernel_slug}"
        logger.info(f"Kaggle kernel pushed successfully. View at: {kaggle_url}")
        
        return {
            "status": "success",
            "kaggle_url": kaggle_url,
            "kernel_slug": kernel_slug,
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Error launching Kaggle headless job: {str(e)}")
        # Make sure env keys are popped
        os.environ.pop("KAGGLE_USERNAME", None)
        os.environ.pop("KAGGLE_KEY", None)
        
        return {
            "status": "failed",
            "kaggle_url": None,
            "kernel_slug": None,
            "error": str(e)
        }
        
    finally:
        # Clean up temp files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
