import boto3
from botocore.client import Config
from app.core.config import settings


class Storage:
    def __init__(self):
        endpoint = self._normalize_endpoint(settings.MINIO_ENDPOINT)
        public_endpoint = self._normalize_endpoint(settings.MINIO_PUBLIC_ENDPOINT)

        self.s3 = boto3.client(
            's3',
            endpoint_url=endpoint,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )
        self.public_s3 = boto3.client(
            's3',
            endpoint_url=public_endpoint,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )
        self.bucket = settings.MINIO_BUCKET_NAME

    @staticmethod
    def _normalize_endpoint(endpoint: str) -> str:
        if endpoint.startswith(("http://", "https://")):
            return endpoint
        return f"http://{endpoint}"

    def ensure_bucket(self):
        try:
            self.s3.head_bucket(Bucket=self.bucket)
        except:
            self.s3.create_bucket(Bucket=self.bucket)

    def upload_file(self, file_bytes: bytes, filename: str, content_type: str) -> str:
        self.s3.put_object(
            Bucket=self.bucket,
            Key=filename,
            Body=file_bytes,
            ContentType=content_type
        )
        return self.generate_presigned_url(filename)

    def download_file(self, filename: str) -> bytes:
        response = self.s3.get_object(Bucket=self.bucket, Key=filename)
        return response["Body"].read()

    def delete_file(self, filename: str):
        self.s3.delete_object(Bucket=self.bucket, Key=filename)

    def generate_presigned_url(self, filename: str, expires: int = 3600) -> str:
        return self.public_s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket, 'Key': filename},
            ExpiresIn=expires
        )

    def generate_presigned_put_url(self, filename: str, expires: int = 3600) -> str:
        """Generate a presigned PUT URL for uploading a file to the public S3 endpoint."""
        return self.public_s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket, 'Key': filename},
            ExpiresIn=expires
        )

storage_client = Storage()
