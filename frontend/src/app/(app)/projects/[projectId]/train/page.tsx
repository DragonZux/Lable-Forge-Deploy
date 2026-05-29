'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useDatasetVersions } from '@/hooks/useDatasetVersions'
import { useTrainingJobs, useCreateTrainingJob, useDeleteTrainingJob, useAutoLabelTrainingJob, useTrainingJobStream } from '@/hooks/useTrainingJobs'
import TrainingJobCard from '@/components/training/TrainingJobCard'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { 
  Zap, 
  History, 
  Rocket, 
  Cpu, 
  ChevronDown,
  Info,
  RefreshCw,
  Cloud,
  Copy,
  X,
  Check,
  Sliders,
  Settings2,
  Sparkles,
  Plus,
  Minus,
  HelpCircle,
  Play,
  Terminal
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import { emitAppToast } from '@/lib/toast-events'
import { cn } from '@/lib/cn'


type TrainingConfig = {
  architecture: 'yolov8n' | 'yolov8s' | 'yolov8m'
  epochs: number
  batch_size: number
  image_size: number
  learning_rate: number
  patience: number
  confidence_threshold: number
}

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  architecture: 'yolov8s',
  epochs: 50,
  batch_size: 16,
  image_size: 640,
  learning_rate: 0.006,
  patience: 12,
  confidence_threshold: 0.25,
}

const ARCHITECTURE_DETAILS = {
  yolov8n: {
    name: 'YOLOv8 Nano',
    desc: 'Lightweight & Ultra-Fast',
    params: '~3.2M params',
    speed: 'Edge & Mobile',
    accuracy: 'Fast Baseline',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  },
  yolov8s: {
    name: 'YOLOv8 Small',
    desc: 'Balanced Speed & Accuracy',
    params: '~11.2M params',
    speed: 'Desktop GPU',
    accuracy: 'Excellent Standard',
    badgeColor: 'bg-accent/10 text-accent border-accent/20'
  },
  yolov8m: {
    name: 'YOLOv8 Medium',
    desc: 'High-Precision Detection',
    params: '~25.9M params',
    speed: 'High-end GPU',
    accuracy: 'State-of-the-Art',
    badgeColor: 'bg-violet-500/10 text-violet-500 border-violet-500/20'
  }
}

export default function TrainPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const router = useRouter()
  const { project } = useProject(projectId)
  const { canManageProject, canReview } = usePermissions(project)

  const { versions: datasetVersions, fetchVersions } = useDatasetVersions(projectId)
  const { jobs, fetchJobs } = useTrainingJobs(projectId)
  const { createJob, isLoading: isCreating } = useCreateTrainingJob(projectId)
  const { deleteJob } = useDeleteTrainingJob(projectId)
  const { autoLabel } = useAutoLabelTrainingJob(projectId)
  
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [selectedBackend, setSelectedBackend] = useState<'colab' | 'kaggle'>('colab')
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG)
  const [activeJobId, setActiveJobId] = useState<string>('')
  const [deletingJobId, setDeletingJobId] = useState<string>('')
  const [autoLabelingJobId, setAutoLabelingJobId] = useState<string>('')
  const [colabLoading, setColabLoading] = useState(false)
  const [loadingColabJobId, setLoadingColabJobId] = useState<string>('')
  const [showColabModal, setShowColabModal] = useState(false)
  const [colabParams, setColabParams] = useState<any>(null)
  const [colabUrl, setColabUrl] = useState<string>('')
  const [copiedField, setCopiedField] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  const { job: streamingJob } = useTrainingJobStream(activeJobId)

  useEffect(() => {
    fetchVersions()
    fetchJobs()
  }, [fetchVersions, fetchJobs])

  // Track active training job
  useEffect(() => {
    const activeJob = jobs.find(j => ['queued', 'awaiting_colab', 'preparing', 'training', 'evaluating'].includes(j.status))
    if (activeJob) {
      setActiveJobId(activeJob.id)
    } else {
      setActiveJobId('')
    }
  }, [jobs])

  const handleCopyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(''), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleStartTraining = async () => {
    if (!selectedVersionId) return

    try {
      const job = await createJob(selectedVersionId, selectedBackend, trainingConfig)
      await fetchJobs()
      
      // If Colab, show parameters modal
      if (selectedBackend === 'colab' && job) {
        setColabLoading(true)
        try {
          const response = await fetch(`/api/training/${job.id}/colab-link`)
          const data = await response.json()
          if (!response.ok) {
            const errMsg = data?.detail || data?.message || `Failed to get Colab link (${response.status})`
            try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
          } else if (data.colab_url && data.parameters) {
            setColabParams(data.parameters)
            setColabUrl(data.colab_url)
            setShowColabModal(true)
          }
        } finally {
          setColabLoading(false)
        }
      }
      
      if (selectedBackend === 'kaggle' && job) {
        try { emitAppToast({ message: 'Kaggle automated headless training job successfully launched!', type: 'success' }) } catch {}
      }
      
      setSelectedVersionId('')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start training'
      if (msg.includes('Kaggle API credentials not found')) {
        try {
          emitAppToast({
            message: 'Kaggle credentials missing! Redirecting to Settings...',
            type: 'error'
          })
        } catch {}
        setTimeout(() => {
          router.push('/settings?tab=kaggle')
        }, 1500)
      } else {
        try { emitAppToast({ message: msg, type: 'error' }) } catch {}
      }
      console.error('Failed to start training:', error)
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Delete this execution history item? This cannot be undone.')) return

    setDeletingJobId(jobId)
    try {
      await deleteJob(jobId)
      await fetchJobs()
    } catch (error) {
      console.error('Failed to delete training job:', error)
    } finally {
      setDeletingJobId('')
    }
  }

  const handleAutoLabel = async (jobId: string) => {
    if (!window.confirm('Auto-label images that are not in the train split and do not have labels yet?')) return

    setAutoLabelingJobId(jobId)
    try {
      const result = await autoLabel(jobId)
      await fetchJobs()
      window.alert(`Created ${result?.created_annotations || 0} labels from ${result?.processed_images || 0} images.`)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to auto-label images')
      console.error('Failed to auto-label images:', error)
    } finally {
      setAutoLabelingJobId('')
    }
  }

  const handleViewColabParams = async (jobId: string) => {
    setLoadingColabJobId(jobId)
    try {
      const response = await fetch(`/api/training/${jobId}/colab-link`)
      const data = await response.json()
      if (!response.ok) {
        const errMsg = data?.detail || data?.message || `Failed to get Colab link (${response.status})`
        try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
      } else if (data.colab_url && data.parameters) {
        setColabParams(data.parameters)
        setColabUrl(data.colab_url)
        setShowColabModal(true)
      }
    } catch (err) {
      console.error('Failed to get Colab link:', err)
      try { emitAppToast({ message: 'Failed to fetch Colab connection parameters', type: 'error' }) } catch {}
    } finally {
      setLoadingColabJobId('')
    }
  }

  const handleOpenColab = () => {
    if (colabUrl) {
      window.open(colabUrl, '_blank')
    }
  }

  const colabParamFields = [
    'JOB_ID',
    'DATASET_URL',
    'CALLBACK_URL',
    'ARCHITECTURE',
    'EPOCHS',
    'IMAGE_SIZE',
    'BATCH_SIZE',
    'LEARNING_RATE',
    'PATIENCE',
    'CONFIDENCE_THRESHOLD',
  ]
  const colabParamsText = colabParams
    ? colabParamFields
        .filter((field) => colabParams[field] !== undefined)
        .map((field) => {
          const value = colabParams[field]
          const isNumeric = !isNaN(Number(value)) && String(value).trim() !== ''
          return `${field} = ${isNumeric ? value : `"${value}"`}`
        })
        .join('\n')
    : ''

  if (project && !canReview) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your project role does not allow viewing training jobs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell max-w-[1400px]">
      {/* Page Header */}
      <div className="page-hero mb-10 overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <SectionLabel label="Model Intelligence" className="mb-4" />
            <h1 className="page-title tracking-tight">
              Train <span className="gradient-text">Model</span>
            </h1>
            <p className="page-subtitle mt-3">
              Select an optimized dataset version and initiate the custom YOLOv8 deep learning pipeline.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 px-5 py-3 rounded-2xl bg-muted/20 border border-border backdrop-blur-md">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-foreground/80 uppercase">Pipeline Status: Ready</span>
          </div>
        </div>
        
        {/* Abstract Background Decoration */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 left-1/3 w-72 h-32 bg-indigo-500/5 rounded-full blur-2xl" />
      </div>

      {/* Launch Control Panel */}
      {canManageProject && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-soft relative mb-12 overflow-hidden p-6 sm:p-8 border border-border/80 shadow-xl bg-card/65 backdrop-blur-md"
        >
          <div className="relative z-10">
            {/* Header section with sparkles */}
            <div className="flex items-center justify-between border-b border-border/60 pb-5 mb-8">
              <div className="flex items-center gap-3">
                <div className="icon-gradient h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-secondary text-white shadow-accent">
                  <Rocket className="w-5 h-5 animate-bounce-soft" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Launch Control</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent animate-pulse" /> Configure Pipeline Parameters
                  </p>
                </div>
              </div>
            </div>

            {/* Launch Configuration Form */}
            <div className="space-y-8">
              {/* Row 1: Dataset Select */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                    Dataset Source Version
                  </label>
                  {datasetVersions.length === 0 && (
                    <span className="text-[11px] text-red-500 font-semibold">Generate a dataset version first</span>
                  )}
                </div>
                <div className="relative rounded-2xl border border-border bg-background shadow-inner-sm transition-all duration-300 focus-within:border-accent/40 focus-within:ring-4 focus-within:ring-accent/5">
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                    className="select-control w-full h-14 bg-transparent border-none pr-12 appearance-none cursor-pointer font-medium text-sm text-foreground focus:ring-0"
                  >
                    <option value="" className="bg-card">Select from generated versions...</option>
                    {datasetVersions.map((version) => (
                      <option key={version.id} value={version.id} className="bg-card font-medium text-foreground py-2">
                        Version {version.version_number} — {version.train_count + version.valid_count + version.test_count} images total (Train: {version.train_count}, Valid: {version.valid_count}, Test: {version.test_count})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Row 2: Grid column split for Architecture and Backend */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 2.1 Model Architecture Selection */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center gap-1.5 ml-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Model Architecture
                    </label>
                    <div className="relative group">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-accent transition-colors" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 bg-slate-950 text-white text-[11px] rounded-xl p-3 shadow-2xl z-50 border border-slate-800 leading-relaxed font-sans">
                        Choose model size. Larger models are more precise but slower to train, validate, and run. YOLOv8s is standard.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['yolov8n', 'yolov8s', 'yolov8m'] as const).map((arch) => {
                      const details = ARCHITECTURE_DETAILS[arch]
                      const isSelected = trainingConfig.architecture === arch

                      let selectedClasses = ''
                      if (isSelected) {
                        if (arch === 'yolov8n') selectedClasses = 'bg-emerald-500/[0.04] border-emerald-500 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)] ring-2 ring-emerald-500/10'
                        else if (arch === 'yolov8s') selectedClasses = 'bg-accent/[0.04] border-accent shadow-[0_0_15px_-3px_rgba(37,99,235,0.15)] ring-2 ring-accent/10'
                        else selectedClasses = 'bg-violet-500/[0.04] border-violet-500 shadow-[0_0_15px_-3px_rgba(139,92,246,0.15)] ring-2 ring-violet-500/10'
                      }

                      return (
                        <button
                          key={arch}
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, architecture: arch }))}
                          className={`relative text-left p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between hover:scale-[1.02] hover:shadow-md active:scale-[0.98] ${
                            isSelected
                              ? selectedClasses
                              : 'bg-background hover:bg-muted/30 border-border hover:border-border/80'
                          }`}
                        >
                          {isSelected && (
                            <div className={cn(
                              "absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm",
                              arch === 'yolov8n' ? 'bg-emerald-500 shadow-emerald-500/25' :
                              arch === 'yolov8s' ? 'bg-accent shadow-accent/25' :
                              'bg-violet-500 shadow-violet-500/25'
                            )}>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                          <div>
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider border uppercase mb-3 ${details.badgeColor}`}>
                              {arch}
                            </span>
                            <h3 className="text-sm font-bold text-foreground leading-tight">{details.name}</h3>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{details.desc}</p>
                          </div>
                          
                          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                            <span>{details.params}</span>
                            <span className="font-sans font-semibold text-foreground/80">{details.speed}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2.2 Compute Backend Selection */}
                <div className="lg:col-span-5 space-y-4">
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
                    Training Compute Backend
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Colab Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedBackend('colab')}
                      className={`group relative overflow-hidden p-5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between hover:scale-[1.02] hover:shadow-md active:scale-[0.98] ${
                        selectedBackend === 'colab'
                          ? 'bg-blue-500/[0.04] border-blue-500 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)] ring-2 ring-blue-500/10'
                          : 'bg-background hover:bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                          selectedBackend === 'colab' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Cloud className="w-5 h-5" />
                        </div>
                        {selectedBackend === 'colab' && (
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Google Colab GPU</h4>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">Interactive notebook setup using Colab free T4 hardware</p>
                      </div>
                    </button>

                    {/* Kaggle Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedBackend('kaggle')}
                      className={`group relative overflow-hidden p-5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between hover:scale-[1.02] hover:shadow-md active:scale-[0.98] ${
                        selectedBackend === 'kaggle'
                          ? 'bg-purple-500/[0.04] border-purple-500 shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)] ring-2 ring-purple-500/10'
                          : 'bg-background hover:bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                          selectedBackend === 'kaggle' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Cpu className="w-5 h-5" />
                        </div>
                        {selectedBackend === 'kaggle' && (
                          <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-sm">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Kaggle GPU</h4>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">Fully-automated headless run on Kaggle free GPU nodes</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 3: Primary Configurations / Accordion */}
              <div className="border border-border/60 rounded-2xl overflow-hidden bg-background/50 backdrop-blur-sm shadow-inner-sm">
                {/* Advanced configuration bar toggle */}
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-accent/[0.03] to-transparent hover:from-accent/[0.06] transition-all border-b border-border/40"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-accent animate-pulse" />
                    <span className="text-xs font-bold text-foreground tracking-wider uppercase">Hyperparameters & Settings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                <div className="p-6">
                  {/* Default layout: primary inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Epochs: Custom stepper input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Epochs</span>
                        <span className="text-xs font-mono font-semibold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">{trainingConfig.epochs}</span>
                      </div>
                      <div className="flex items-center rounded-xl border border-border bg-background p-1.5 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/5 transition-all">
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, epochs: Math.max(1, c.epochs - 10) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={trainingConfig.epochs}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            if (Number.isFinite(val)) setTrainingConfig(c => ({ ...c, epochs: Math.max(1, Math.min(300, val)) }))
                          }}
                          className="flex-1 text-center font-bold text-sm bg-transparent border-none outline-none focus:ring-0 p-0 font-mono text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, epochs: Math.min(300, c.epochs + 10) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Batch size stepper */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Batch Size</span>
                        <span className="text-xs font-mono font-semibold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">{trainingConfig.batch_size}</span>
                      </div>
                      <div className="flex items-center rounded-xl border border-border bg-background p-1.5 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/5 transition-all">
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, batch_size: Math.max(1, c.batch_size / 2) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={trainingConfig.batch_size}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            if (Number.isFinite(val)) setTrainingConfig(c => ({ ...c, batch_size: Math.max(1, Math.min(64, val)) }))
                          }}
                          className="flex-1 text-center font-bold text-sm bg-transparent border-none outline-none focus:ring-0 p-0 font-mono text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, batch_size: Math.min(64, c.batch_size * 2) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Image Size selection dropdown */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Image Resolution</span>
                        <span className="text-xs font-mono font-semibold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">{trainingConfig.image_size}</span>
                      </div>
                      <div className="relative rounded-xl border border-border bg-background p-1.5 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/5 transition-all">
                        <select
                           value={trainingConfig.image_size}
                           onChange={(e) => setTrainingConfig(c => ({ ...c, image_size: Number(e.target.value) }))}
                           className="w-full h-9 bg-transparent border-none text-sm font-bold text-foreground focus:ring-0 pr-8 appearance-none py-0 pl-3 cursor-pointer"
                        >
                          {[320, 416, 512, 640, 800, 960, 1024, 1280].map((size) => (
                            <option key={size} value={size} className="bg-card">
                              {size} px
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>

                    {/* Patience Stepper */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Patience</span>
                        <span className="text-xs font-mono font-semibold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">{trainingConfig.patience} epochs</span>
                      </div>
                      <div className="flex items-center rounded-xl border border-border bg-background p-1.5 shadow-sm focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/5 transition-all">
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, patience: Math.max(0, c.patience - 1) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-red-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={trainingConfig.patience}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            if (Number.isFinite(val)) setTrainingConfig(c => ({ ...c, patience: Math.max(0, Math.min(100, val)) }))
                          }}
                          className="flex-1 text-center font-bold text-sm bg-transparent border-none outline-none focus:ring-0 p-0 font-mono text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => setTrainingConfig(c => ({ ...c, patience: Math.min(100, c.patience + 1) }))}
                          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-emerald-500 hover:text-white text-muted-foreground transition-all duration-200"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Accordion panel inside AnimatePresence */}
                  <AnimatePresence initial={false}>
                    {showAdvanced && (
                      <motion.div
                        key="advanced-config"
                        initial={{ height: 0, opacity: 0, marginTop: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 24 }}
                        exit={{ height: 0, opacity: 0, marginTop: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden border-t border-border/40 pt-6"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Learning Rate hyperparameter slider/input */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Learning Rate (LR)</span>
                                <span title="Initial learning rate for SGD/Adam Optimizer" className="cursor-help">
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60" />
                                </span>
                              </div>
                              <span className="text-xs font-mono font-bold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">
                                {trainingConfig.learning_rate}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 bg-muted/20 border border-border/40 rounded-xl p-3.5">
                              <input
                                type="range"
                                min={0.0001}
                                max={0.1}
                                step={0.0005}
                                value={trainingConfig.learning_rate}
                                onChange={(e) => setTrainingConfig(c => ({ ...c, learning_rate: Number(e.target.value) }))}
                                className="flex-1 accent-accent h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                              <input
                                type="number"
                                step={0.001}
                                value={trainingConfig.learning_rate}
                                onChange={(e) => setTrainingConfig(c => ({ ...c, learning_rate: Math.max(0.00001, Math.min(1, Number(e.target.value))) }))}
                                className="w-20 text-center font-mono font-bold text-xs bg-background border border-border rounded-lg py-1.5 focus:ring-1 focus:ring-accent"
                              />
                            </div>
                          </div>

                          {/* Confidence Threshold slider/input */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Confidence Threshold</span>
                                <span title="Minimum prediction score required to trigger validation bounding box" className="cursor-help">
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60" />
                                </span>
                              </div>
                              <span className="text-xs font-mono font-bold text-accent bg-accent/5 border border-accent/10 px-2 py-0.5 rounded">
                                {trainingConfig.confidence_threshold}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 bg-muted/20 border border-border/40 rounded-xl p-3.5">
                              <input
                                type="range"
                                min={0.01}
                                max={0.99}
                                step={0.01}
                                value={trainingConfig.confidence_threshold}
                                onChange={(e) => setTrainingConfig(c => ({ ...c, confidence_threshold: Number(e.target.value) }))}
                                className="flex-1 accent-accent h-1.5 bg-muted rounded-lg cursor-pointer"
                              />
                              <input
                                type="number"
                                step={0.01}
                                value={trainingConfig.confidence_threshold}
                                onChange={(e) => setTrainingConfig(c => ({ ...c, confidence_threshold: Math.max(0.01, Math.min(0.99, Number(e.target.value))) }))}
                                className="w-20 text-center font-mono font-bold text-xs bg-background border border-border rounded-lg py-1.5 focus:ring-1 focus:ring-accent"
                              />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Row 4: Submit Button & Guide note */}
              <div className="grid grid-cols-1 items-stretch gap-4 border-t border-border/60 pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                {/* Guide Information banner */}
                <div className="flex min-w-0 items-start gap-4 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:items-center">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-background text-accent shadow-sm">
                    <Info className="h-5 w-5 animate-pulse" />
                  </div>
                  <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    {selectedBackend === 'colab' ? (
                      <>
                        Pipeline will run on <span className="text-foreground font-bold">Google Colab GPU</span>. Clicking start will generate a notebook integration link with pre-populated configurations.
                      </>
                    ) : (
                      <>
                        Pipeline will execute <span className="text-foreground font-bold">fully headless</span> on Kaggle's free GPU nodes. Kernel setup and launch takes ~5 seconds.
                      </>
                    )}
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={handleStartTraining}
                  disabled={!selectedVersionId || isCreating || colabLoading}
                  className={cn(
                    "h-14 w-full rounded-2xl px-10 text-white font-bold transition-all duration-300 group shadow-lg hover:-translate-y-0.5 active:translate-y-0 lg:w-auto lg:min-w-[250px]",
                    selectedBackend === 'colab'
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30"
                      : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-purple-500/20 hover:shadow-lg hover:shadow-purple-500/30"
                  )}
                >
                  {isCreating || colabLoading ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      {selectedBackend === 'colab' ? 'Awaiting Link...' : 'Pushing Kernel...'}
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2 group-hover:scale-125 transition-transform" />
                      {selectedBackend === 'colab' ? 'Initiate on Colab' : 'Launch on Kaggle'}
                    </>
                  )}
                </Button>

              </div>
            </div>
          </div>

          {/* Decorative gradients */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl -z-0 translate-x-1/3 -translate-y-1/3 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -z-0 pointer-events-none" />
        </motion.div>
      )}

      {/* History Section */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-muted/60 border border-border rounded-xl flex items-center justify-center text-muted-foreground shadow-inner-sm">
              <History className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-[0.2em]">Execution History</h2>
              <p className="text-[10px] text-muted-foreground">Historical records and diagnostic training metrics</p>
            </div>
          </div>
          {jobs.length > 0 && (
            <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border/80">
              {jobs.length} Job{jobs.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {jobs.length === 0 ? (
          <div className="panel text-center py-24 border-dashed border-border/80 bg-muted/10 backdrop-blur-sm rounded-3xl relative overflow-hidden">
            <div className="w-20 h-20 bg-muted border border-border/60 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Cpu className="w-10 h-10 text-muted-foreground opacity-30 animate-pulse" />
            </div>
            <h2 className="text-xl font-display text-foreground font-bold mb-2">No Training Logs</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Your training history is currently empty. Set your configurations above and launch the pipeline to begin.
            </p>
            {/* Glow backdrop decoration */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.01] to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {jobs.map((job, idx) => {
              const displayJob = streamingJob && streamingJob.id === job.id ? streamingJob : job
              const isRunning = ['awaiting_colab', 'preparing', 'training', 'evaluating'].includes(displayJob.status)

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.08, 0.4), duration: 0.3 }}
                >
                  <TrainingJobCard
                    job={displayJob}
                    isStreaming={activeJobId === job.id}
                    canDelete={canManageProject}
                    isDeleting={deletingJobId === job.id}
                    onDelete={() => handleDeleteJob(job.id)}
                    canAutoLabel={canManageProject && project?.type === 'object-detection'}
                    isAutoLabeling={autoLabelingJobId === job.id}
                    onAutoLabel={() => handleAutoLabel(job.id)}
                    onViewColabParams={handleViewColabParams}
                    isColabLoading={loadingColabJobId === job.id}
                  />
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Colab Parameters Modal */}
      {showColabModal && colabParams && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card/95 shadow-2xl text-foreground"
          >
            {/* Modal Header */}
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border bg-card/50 backdrop-blur-md p-6 sm:p-8">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                  <Cloud className="h-3.5 w-3.5" />
                  Google Colab cockpit
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl tracking-tight">Colab Setup Parameters</h2>
                <p className="mt-1.5 max-w-xl text-xs leading-normal text-slate-400">
                  Copy these configuration variables to Colab to link training process and automatically sync weights back.
                </p>
              </div>
              
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  onClick={() => setShowColabModal(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground transition-colors hover:border-border/80"
                  aria-label="Close setup modal"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
              {/* Stepper Guide */}
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent font-mono">01</p>
                  <p className="mt-1 text-xs font-bold text-foreground leading-snug">Setup GPU Runtime</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                    In Colab: Runtime &gt; Change runtime type &gt; Python 3 &amp; select T4 GPU.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent font-mono">02</p>
                  <p className="mt-1 text-xs font-bold text-foreground leading-snug">Copy parameters</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                    Click copy configuration cell variables below.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent font-mono">03</p>
                  <p className="mt-1 text-xs font-bold text-foreground leading-snug">Open Colab notebook</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                    Click Launch Google Colab to open in a new tab.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent font-mono">04</p>
                  <p className="mt-1 text-xs font-bold text-foreground leading-snug">Paste &amp; Train model</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-normal">
                    Paste copied config into the first cell &amp; Run all cells.
                  </p>
                </div>
              </div>

              {/* Parameter Code Box */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-accent" /> FULL CONFIGURATION CELL
                  </span>
                  <button
                    onClick={() => handleCopyToClipboard(colabParamsText, 'ALL_COLAB_PARAMS')}
                    className="h-8 flex items-center gap-1.5 px-3.5 rounded-lg border border-accent/20 bg-accent/10 text-xs font-bold text-accent hover:bg-accent/15 transition-all shadow-sm"
                  >
                    {copiedField === 'ALL_COLAB_PARAMS' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Copied config</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy config cell</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative rounded-2xl border border-border bg-slate-950 p-4 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto overflow-x-auto text-emerald-400 shadow-inner-sm">
                  <pre className="whitespace-pre-wrap break-all">{colabParamsText}</pre>
                </div>
              </div>

              {/* Individual Fields Grid */}
              <div className="space-y-3.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">INDIVIDUAL CONSTANTS</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {colabParamFields.map((field) => (
                    <div key={field} className={field.includes('URL') ? 'md:col-span-2' : ''}>
                      <div className="flex items-center justify-between mb-1.5 px-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground font-mono">{field}</span>
                      </div>
                      <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-2 shadow-sm">
                        <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground font-bold leading-normal">
                          {colabParams[field]}
                        </code>
                        <button
                          onClick={() => handleCopyToClipboard(String(colabParams[field]), field)}
                          className="flex h-7.5 w-7.5 flex-shrink-0 items-center justify-center rounded-lg border border-border hover:border-accent/35 hover:bg-accent/10 text-muted-foreground hover:text-accent transition-colors"
                          aria-label={`Copy ${field}`}
                        >
                          {copiedField === field ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Instruction banner */}
              <div className="rounded-2xl border border-accent/15 bg-accent/5 p-4 flex gap-3.5">
                <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <div className="space-y-1 leading-normal">
                  <h4 className="text-xs font-bold text-foreground">Callback Integration Sync</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Google Colab will perform high-speed GPU computations. On epoch validation and final output generation, it sends a web hook request back to our `CALLBACK_URL`. Rest assured, this window remains active, and you can monitor real-time charts on the dashboard as the training progresses.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-shrink-0 gap-3 border-t border-border bg-card/50 p-6 sm:p-8">
              <Button
                variant="secondary"
                onClick={() => setShowColabModal(false)}
                className="flex-1 rounded-xl h-12"
              >
                Close Cockpit
              </Button>
              <Button
                onClick={handleOpenColab}
                className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:brightness-110 text-white shadow-accent rounded-xl h-12"
              >
                <Cloud className="w-4 h-4 mr-2 animate-bounce-soft" />
                Launch Google Colab
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
