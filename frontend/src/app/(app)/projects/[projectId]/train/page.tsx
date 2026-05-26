'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useDatasetVersions } from '@/hooks/useDatasetVersions'
import { useTrainingJobs, useCreateTrainingJob, useDeleteTrainingJob, useAutoLabelTrainingJob, useTrainingJobStream } from '@/hooks/useTrainingJobs'
import TrainingJobCard from '@/components/training/TrainingJobCard'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Button } from '@/components/ui/Button'
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
  Check
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import { emitAppToast } from '@/lib/toast-events'

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

export default function TrainPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { project } = useProject(projectId)
  const { canManageProject, canReview } = usePermissions(project)

  const { versions: datasetVersions, fetchVersions } = useDatasetVersions(projectId)
  const { jobs, fetchJobs } = useTrainingJobs(projectId)
  const { createJob, isLoading: isCreating } = useCreateTrainingJob(projectId)
  const { deleteJob } = useDeleteTrainingJob(projectId)
  const { autoLabel } = useAutoLabelTrainingJob(projectId)
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [selectedBackend, setSelectedBackend] = useState<'local' | 'colab'>('local')
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>(DEFAULT_TRAINING_CONFIG)
  const [activeJobId, setActiveJobId] = useState<string>('')
  const [deletingJobId, setDeletingJobId] = useState<string>('')
  const [autoLabelingJobId, setAutoLabelingJobId] = useState<string>('')
  const [colabLoading, setColabLoading] = useState(false)
  const [showColabModal, setShowColabModal] = useState(false)
  const [colabParams, setColabParams] = useState<any>(null)
  const [colabUrl, setColabUrl] = useState<string>('')
  const [copiedField, setCopiedField] = useState<string>('')
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
      
      setSelectedVersionId('')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start training'
      try { emitAppToast({ message: msg, type: 'error' }) } catch {}
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
        .map((field) => `${field}=${colabParams[field]}`)
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
      <div className="page-hero mb-10">
        <div className="relative z-10">
        <SectionLabel label="Model Intelligence" className="mb-4" />
        <h1 className="page-title">
          Train <span className="gradient-text">Model</span>
        </h1>
        <p className="page-subtitle mt-3">
          Select an optimized dataset version and initiate the training pipeline.
        </p>
        </div>
      </div>

      {/* Launch Control Panel */}
      {canManageProject && (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-soft relative mb-12 overflow-hidden p-6 sm:p-8"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="icon-gradient h-10 w-10">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Launch Control</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">New Training Session</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-6 items-end">
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                Select Dataset Version
              </label>
              <div className="relative">
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  className="select-control w-full h-14 pr-12 appearance-none cursor-pointer"
                >
                  <option value="">Choose a version...</option>
                  {datasetVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      Version {version.version_number} - {version.train_count + version.valid_count + version.test_count} images total
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                Training Backend
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedBackend('local')}
                  className={`flex-1 h-14 px-4 rounded-2xl transition-all font-medium text-sm ${
                    selectedBackend === 'local'
                      ? 'bg-accent text-white shadow-lg'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Cpu className="w-4 h-4 inline mr-2" />
                  Local
                </button>
                <button
                  onClick={() => setSelectedBackend('colab')}
                  className={`flex-1 h-14 px-4 rounded-2xl transition-all font-medium text-sm ${
                    selectedBackend === 'colab'
                      ? 'bg-accent text-white shadow-lg'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Cloud className="w-4 h-4 inline mr-2" />
                  Colab
                </button>
              </div>
            </div>

            <div className="space-y-3 md:col-span-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                Training Settings
              </label>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
                <select
                  value={trainingConfig.architecture}
                  onChange={(e) => setTrainingConfig((config) => ({ ...config, architecture: e.target.value as TrainingConfig['architecture'] }))}
                  className="select-control h-11 text-sm"
                >
                  <option value="yolov8n">YOLOv8n</option>
                  <option value="yolov8s">YOLOv8s</option>
                  <option value="yolov8m">YOLOv8m</option>
                </select>
                <TrainingNumberInput label="Epochs" value={trainingConfig.epochs} min={1} max={300} onChange={(value) => setTrainingConfig((config) => ({ ...config, epochs: value }))} />
                <TrainingNumberInput label="Batch" value={trainingConfig.batch_size} min={1} max={64} onChange={(value) => setTrainingConfig((config) => ({ ...config, batch_size: value }))} />
                <TrainingNumberInput label="Image" value={trainingConfig.image_size} min={320} max={1280} step={32} onChange={(value) => setTrainingConfig((config) => ({ ...config, image_size: value }))} />
                <TrainingNumberInput label="LR" value={trainingConfig.learning_rate} min={0.00001} max={1} step={0.001} onChange={(value) => setTrainingConfig((config) => ({ ...config, learning_rate: value }))} />
                <TrainingNumberInput label="Patience" value={trainingConfig.patience} min={0} max={100} onChange={(value) => setTrainingConfig((config) => ({ ...config, patience: value }))} />
                <TrainingNumberInput label="Conf" value={trainingConfig.confidence_threshold} min={0.01} max={0.95} step={0.01} onChange={(value) => setTrainingConfig((config) => ({ ...config, confidence_threshold: value }))} />
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleStartTraining}
              disabled={!selectedVersionId || isCreating || colabLoading}
              className="h-14 px-10 rounded-2xl shadow-accent group"
            >
              {isCreating || colabLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  {selectedBackend === 'colab' ? 'Opening...' : 'Initiating...'}
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2 group-hover:scale-125 transition-transform" />
                  {selectedBackend === 'colab' ? 'Train on Colab' : 'Launch Pipeline'}
                </>
              )}
            </Button>
          </div>
          
          <div className="mt-8 flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="w-8 h-8 bg-background rounded-xl flex items-center justify-center text-muted-foreground">
              <Info className="w-4 h-4" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedBackend === 'colab' ? (
                <>
                  Training will run on <span className="text-foreground font-bold">Google Colab GPU</span>. A notebook will open in a new tab where you can run training. Results automatically sync back.
                </>
              ) : (
                <>
                  Training will use <span className="text-foreground font-bold">Standard Compute</span> nodes. Expect 5-15 minutes for baseline models depending on dataset size.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-full blur-3xl -z-0 translate-x-1/2 -translate-y-1/2" />
      </motion.div>
      )}

      {/* History Section */}
      <div>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-muted rounded-xl flex items-center justify-center text-muted-foreground">
            <History className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-[0.2em]">Execution History</h2>
        </div>

        {jobs.length === 0 ? (
          <div className="panel text-center py-24 border-dashed">
            <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Cpu className="w-10 h-10 text-muted-foreground opacity-30" />
            </div>
            <h2 className="text-xl font-display text-foreground mb-2">No Training Logs</h2>
            <p className="text-muted-foreground max-w-xs mx-auto">
              Your training history is empty. Launch a pipeline to see progress here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job, idx) => {
              const displayJob = streamingJob && streamingJob.id === job.id ? streamingJob : job
              const isRunning = ['awaiting_colab', 'preparing', 'training', 'evaluating'].includes(displayJob.status)

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <TrainingJobCard
                    job={displayJob}
                    isStreaming={activeJobId === job.id}
                    canDelete={canManageProject && !isRunning}
                    isDeleting={deletingJobId === job.id}
                    onDelete={() => handleDeleteJob(job.id)}
                    canAutoLabel={canManageProject && project?.type === 'object-detection'}
                    isAutoLabeling={autoLabelingJobId === job.id}
                    onAutoLabel={() => handleAutoLabel(job.id)}
                  />
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Colab Parameters Modal */}
      {showColabModal && colabParams && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-border bg-card p-5 sm:p-6">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent">
                  <Cloud className="h-3.5 w-3.5" />
                  Colab setup
                </div>
                <h2 className="text-xl font-bold text-foreground sm:text-2xl">Google Colab Parameters</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Keep this window open after clicking Open Colab. Copy the values below into the configuration cell in the notebook.
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyToClipboard(colabParamsText, 'ALL_COLAB_PARAMS')}
                  className="h-10 border-accent/20 bg-accent/10 px-3 text-accent hover:bg-accent/15"
                >
                  {copiedField === 'ALL_COLAB_PARAMS' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedField === 'ALL_COLAB_PARAMS' ? 'Copied' : 'Copy all'}
                </Button>
                <button
                  onClick={() => setShowColabModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
                  aria-label="Close Colab parameters"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-background/55 p-5 sm:p-6">
              <div className="mb-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Step 1</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Click Copy all or copy each field.</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Step 2</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Click Open Colab; this modal stays open.</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Step 3</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Paste into the setup cell, then run all.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {colabParamFields.map((field) => (
                  <div key={field} className={field.includes('URL') ? 'md:col-span-2' : ''}>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {field}
                    </label>
                    <div className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-accent/40">
                      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-foreground sm:text-sm">
                        {colabParams[field]}
                      </code>
                      <button
                        onClick={() => handleCopyToClipboard(String(colabParams[field]), field)}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-accent/20 hover:bg-accent/10 hover:text-accent"
                        aria-label={`Copy ${field}`}
                      >
                        {copiedField === field ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-accent/20 bg-accent/10 p-4">
                <p className="text-sm font-semibold text-foreground">Copy guide</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-6 text-muted-foreground">
                  <li>Use Copy all if the notebook has one cell for the full configuration.</li>
                  <li>If the notebook has separate cells, copy each value with the icon at the end of each field.</li>
                  <li>After Colab opens in a new tab, return to this tab any time to copy the values again.</li>
                  <li>Run the full notebook and wait for the callback to finish so the result syncs back to Label Forge.</li>
                </ol>
              </div>
            </div>

            <div className="flex flex-shrink-0 flex-col gap-3 border-t border-border bg-card p-5 sm:flex-row sm:p-6">
              <Button
                variant="secondary"
                onClick={() => setShowColabModal(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={handleOpenColab}
                className="flex-1"
              >
                <Cloud className="w-4 h-4 mr-2" />
                Open Colab
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

function TrainingNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) {
            onChange(Math.max(min, Math.min(max, next)))
          }
        }}
        className="select-control h-11 w-full px-3 text-sm"
      />
    </label>
  )
}
