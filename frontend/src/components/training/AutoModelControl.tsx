'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ProjectType } from '@/types'
import { useAutoLabelTrainingJob, useTrainingJobs } from '@/hooks/useTrainingJobs'
import { Button } from '@/components/ui/Button'
import { ChevronDown, Loader2, Wand2 } from 'lucide-react'

interface AutoModelControlProps {
  projectId: string
  projectType?: ProjectType
  imageIds?: string[]
  disabled?: boolean
  onComplete?: () => Promise<void> | void
  compact?: boolean
}

export default function AutoModelControl({
  projectId,
  projectType,
  imageIds,
  disabled = false,
  onComplete,
  compact = false,
}: AutoModelControlProps) {
  const { jobs, fetchJobs } = useTrainingJobs(projectId)
  const { autoLabel, isLoading } = useAutoLabelTrainingJob(projectId)
  const [selectedJobId, setSelectedJobId] = useState('')

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'done' && job.artifact_url),
    [jobs]
  )

  useEffect(() => {
    if (!selectedJobId && completedJobs[0]) {
      setSelectedJobId(completedJobs[0].id)
    }
  }, [completedJobs, selectedJobId])

  const isClassification = projectType === 'classification'
  const actionLabel = isClassification ? 'Auto-classify' : 'Auto-label'
  const targetText = imageIds?.length ? `${imageIds.length} images` : 'untrained images'

  const handleRun = async () => {
    if (!selectedJobId) return
    const confirmed = window.confirm(`${actionLabel} ${targetText} with the selected model?`)
    if (!confirmed) return

    const result = await autoLabel(selectedJobId, {
      imageIds,
      replaceExisting: Boolean(imageIds?.length),
    })
    window.alert(`Created ${result?.created_annotations || 0} labels from ${result?.processed_images || 0} images.`)
    await onComplete?.()
  }

  return (
    <div className={compact ? 'flex min-w-0 items-center gap-2' : 'flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center'}>
      <div className="relative min-w-0 flex-1">
        <select
          value={selectedJobId}
          onChange={(event) => setSelectedJobId(event.target.value)}
          disabled={disabled || isLoading || completedJobs.length === 0}
          className="h-10 w-full appearance-none rounded-xl border border-border bg-background pl-3 pr-9 text-sm font-semibold text-foreground outline-none transition-colors focus:border-accent/50 focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {completedJobs.length === 0 ? (
            <option value="">No trained model yet</option>
          ) : (
            completedJobs.map((job) => (
              <option key={job.id} value={job.id}>
                Model {job.id.slice(-6)} - mAP {((job.map_score || 0) * 100).toFixed(1)}%
              </option>
            ))
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      <Button
        type="button"
        size="sm"
        onClick={handleRun}
        disabled={disabled || isLoading || !selectedJobId}
        className="h-10 shrink-0 rounded-xl px-4"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </div>
  )
}
