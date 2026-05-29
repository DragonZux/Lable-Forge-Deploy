'use client'

import React, { useState } from 'react'
import { TrainingJob } from '@/types'
import { Card } from '@/components/ui/Card'
import { 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Calendar, 
  Clock, 
  BarChart3,
  Target,
  Zap,
  Activity,
  Info,
  Play,
  Cloud,
  Cpu,
  Trash2,
  Wand2,
  ChevronDown,
  Settings2
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'

interface TrainingJobCardProps {
  job: TrainingJob
  isStreaming?: boolean
  canDelete?: boolean
  isDeleting?: boolean
  onDelete?: (job: TrainingJob) => void
  canAutoLabel?: boolean
  isAutoLabeling?: boolean
  onAutoLabel?: (job: TrainingJob) => void
  onViewColabParams?: (jobId: string) => void
  isColabLoading?: boolean
}

export default function TrainingJobCard({
  job,
  canDelete = false,
  isDeleting = false,
  onDelete,
  canAutoLabel = false,
  isAutoLabeling = false,
  onAutoLabel,
  onViewColabParams,
  isColabLoading = false,
}: TrainingJobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'queued':
        return { label: 'Queued', color: 'text-slate-500 bg-slate-100', icon: <Clock className="w-4 h-4" /> }
      case 'awaiting_colab':
        return { label: 'Awaiting Colab', color: 'text-blue-500 bg-blue-100', icon: <Cloud className="w-4 h-4" /> }
      case 'preparing':
        return { label: 'Preparing', color: 'text-amber-500 bg-amber-100', icon: <Loader2 className="w-4 h-4 animate-spin" /> }
      case 'training':
        return { label: 'Training', color: 'text-accent bg-accent/10', icon: <Zap className="w-4 h-4 animate-pulse" /> }
      case 'evaluating':
        return { label: 'Evaluating', color: 'text-violet-500 bg-violet-100', icon: <BarChart3 className="w-4 h-4" /> }
      case 'done':
        return { label: 'Success', color: 'text-emerald-500 bg-emerald-100', icon: <CheckCircle2 className="w-4 h-4" /> }
      case 'failed':
        return { label: 'Failed', color: 'text-red-500 bg-red-100', icon: <AlertCircle className="w-4 h-4" /> }
      default:
        return { label: status, color: 'text-slate-500 bg-slate-100', icon: <Info className="w-4 h-4" /> }
    }
  }

  const getProgressPercent = () => {
    switch (job.status) {
      case 'queued': return 0
      case 'awaiting_colab': return 2
      case 'preparing': return 5
      case 'training': return 5 + (job.epochs_completed || 0) * (85 / Math.max(1, job.total_epochs || 50))
      case 'evaluating': return 90
      case 'done': return 100
      case 'failed': return 100
      default: return 0
    }
  }

  const info = getStatusInfo(job.status)
  const progress = getProgressPercent()

  return (
    <Card 
      onClick={() => setIsExpanded(!isExpanded)}
      className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer" 
      variant="default"
    >
      {/* Status Bar */}
      <div className={cn("absolute top-0 left-0 w-full h-1", info.color.split(' ')[1])} />

      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", info.color)}>
              {info.icon}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Pipeline Execution</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase">
                  ID: {job.id.slice(-6)}
                </span>
                {job.training_backend && (
                  <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded uppercase", 
                    job.training_backend === 'colab' 
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  )}>
                    {job.training_backend === 'colab' ? <Cloud className="w-3 h-3 inline mr-1" /> : <Cpu className="w-3 h-3 inline mr-1" />}
                    {job.training_backend}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(job.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {job.training_backend === 'colab' && onViewColabParams && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewColabParams(job.id)
                }}
                disabled={isColabLoading}
                title="View Colab setup parameters"
                className="h-9 rounded-xl px-3.5 text-xs font-bold bg-accent/5 text-accent hover:bg-accent/10 border border-accent/10 flex items-center gap-1.5"
              >
                {isColabLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                Colab Setup
              </Button>
            )}
            {job.training_backend === 'kaggle' && job.artifact_url && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  const match = job.artifact_url?.match(/https?:\/\/[^\s]+/);
                  if (match) window.open(match[0], '_blank');
                }}
                title="Open running notebook on Kaggle"
                className="h-9 rounded-xl px-3.5 text-xs font-bold bg-accent/5 text-accent hover:bg-accent/10 border border-accent/10 flex items-center gap-1.5"
              >
                <Cloud className="h-3.5 w-3.5" />
                View Kaggle
              </Button>
            )}
            <div className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2", info.color)}>
              {info.label}
            </div>
            {job.status === 'done' && (
              <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">
                mAP: {((job.map_score ?? 0) * 100).toFixed(1)}%
              </div>
            )}
            {canAutoLabel && job.status === 'done' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onAutoLabel?.(job)
                }}
                disabled={isAutoLabeling}
                title="Auto-label untrained images"
                className="h-9 rounded-xl px-3 text-xs font-bold"
              >
                {isAutoLabeling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Auto label
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete?.(job)
                }}
                disabled={isDeleting}
                title="Delete execution history item"
                className="h-9 w-9 rounded-xl px-0 text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <div className="text-muted-foreground group-hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted ml-1">
              <ChevronDown className={cn("w-5 h-5 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Execution Progress</p>
              <p className="text-sm font-semibold text-foreground">
                {job.status === 'training' ? `Epoch ${job.epochs_completed || 0} / ${job.total_epochs || 50}` : info.label}
              </p>
            </div>
            <span className="text-lg font-display text-foreground">{Math.floor(progress)}%</span>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className={cn("h-full rounded-full bg-gradient-to-r", 
                job.status === 'failed' ? "from-red-500 to-red-400" : 
                job.status === 'done' ? "from-emerald-500 to-emerald-400" : 
                "from-accent to-accent-secondary"
              )}
            />
          </div>
        </div>

        {/* Detailed Info (Expandable) */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/60 pt-6 mt-6 space-y-6">
                {/* Hyperparameters Config */}
                {job.training_config && (
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-accent" /> Hyperparameters & Configuration
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/20 border border-border/40 rounded-2xl p-4">
                      <ConfigItem label="Architecture" value={job.training_config.architecture} />
                      <ConfigItem label="Total Epochs" value={job.training_config.epochs} />
                      <ConfigItem label="Batch Size" value={job.training_config.batch_size} />
                      <ConfigItem label="Image Size" value={job.training_config.image_size ? job.training_config.image_size + 'px' : '640px'} />
                      <ConfigItem label="Learning Rate" value={job.training_config.learning_rate} />
                      <ConfigItem label="Patience" value={job.training_config.patience} />
                      <ConfigItem label="Conf Threshold" value={job.training_config.confidence_threshold} />
                      <ConfigItem label="Dataset Version" value={`v${job.dataset_version_id?.slice(-4) || '1'}`} />
                    </div>
                  </div>
                )}

                {/* Results / Metrics */}
                {job.status === 'done' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 border border-border rounded-2xl">
                      <MetricItem label="mAP" value={((job.map_score ?? 0) * 100).toFixed(1) + '%'} icon={<Target className="w-3 h-3" />} color="text-emerald-600" />
                      <MetricItem label="Precision" value={((job.precision ?? 0) * 100).toFixed(1) + '%'} icon={<Activity className="w-3 h-3" />} color="text-blue-600" />
                      <MetricItem label="Recall" value={((job.recall ?? 0) * 100).toFixed(1) + '%'} icon={<Zap className="w-3 h-3" />} color="text-violet-600" />
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Metric Curve</p>
                          <span className="text-[10px] font-mono text-muted-foreground">{job.metrics_history?.length || 0} epochs</span>
                        </div>
                        <div className="flex h-24 items-end gap-1">
                          {(job.metrics_history || []).filter((_, index) => index % 3 === 0).slice(-18).map((point, index) => (
                            <div
                              key={index}
                              className="flex-1 rounded-t bg-accent/80"
                              style={{ height: `${Math.max(8, Math.min(100, (point.map || 0) * 100))}%` }}
                              title={`Epoch ${point.epoch}: mAP ${point.map}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Artifact</p>
                        <div className="rounded-xl bg-muted/50 p-3 font-mono text-[11px] text-foreground break-all">
                          {job.artifact_url || 'Artifact pending'}
                        </div>
                      </div>
                    </div>

                    {job.confusion_matrix && (
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Confusion Matrix</p>
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${job.confusion_matrix.labels.length}, minmax(0, 1fr))` }}>
                          {job.confusion_matrix.matrix.flatMap((row, rowIndex) =>
                            row.map((value, colIndex) => (
                              <div
                                key={`${rowIndex}-${colIndex}`}
                                className="flex aspect-square items-center justify-center rounded-md bg-accent/10 text-[10px] font-bold text-foreground"
                                style={{ opacity: Math.max(0.35, Math.min(1, value / 42)) }}
                                title={`${job.confusion_matrix?.labels[rowIndex]} -> ${job.confusion_matrix?.labels[colIndex]}`}
                              >
                                {value}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {job.status === 'failed' && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-800">Pipeline Failure Reason</p>
                      <p className="text-xs font-medium text-red-700 leading-relaxed">
                        {job.error_message || 'The pipeline execution was interrupted by a system error.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timestamps Footer */}
        <div className="flex items-center gap-6 pt-4 border-t border-border mt-6">
          {job.started_at && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Play className="w-3 h-3" />
              Started {new Date(job.started_at).toLocaleTimeString()}
            </div>
          )}
          {job.finished_at && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <CheckCircle2 className="w-3 h-3" />
              Finished {new Date(job.finished_at).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function MetricItem({ label, value, icon, color }: any) {
  return (
    <div className="text-center sm:text-left">
      <div className={cn("flex items-center justify-center sm:justify-start gap-1.5 mb-1", color)}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-lg font-display text-foreground leading-none">{value}</p>
    </div>
  )
}

function ConfigItem({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-background rounded-xl p-2.5 border border-border/30">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</span>
      <span className="text-xs font-mono font-bold text-foreground truncate block">{value !== undefined && value !== null ? String(value) : 'n/a'}</span>
    </div>
  )
}
