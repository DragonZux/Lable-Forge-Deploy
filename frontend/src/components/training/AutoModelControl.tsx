'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ProjectType } from '@/types'
import { useAutoLabelTrainingJob, useTrainingJobs } from '@/hooks/useTrainingJobs'
import { Button } from '@/components/ui/Button'
import { ChevronDown, Loader2, Wand2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

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
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successResult, setSuccessResult] = useState<{ created_annotations: number; processed_images: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const handleRun = () => {
    if (!selectedJobId) return
    setShowConfirm(true)
  }

  const handleConfirmRun = async () => {
    setShowConfirm(false)
    try {
      const result = await autoLabel(selectedJobId, {
        imageIds,
        replaceExisting: Boolean(imageIds?.length),
      })
      setSuccessResult(result || { created_annotations: 0, processed_images: 0 })
      setShowSuccessAlert(true)
      await onComplete?.()
    } catch (error) {
      console.error('Failed to run auto-label:', error)
    }
  }

  return (
    <>
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

      {/* Portal modals to document.body to avoid stacking context issues caused by backdrop-blur parent container */}
      {mounted && typeof window !== 'undefined' && createPortal(
        <>
          {/* Premium Confirm Modal */}
          <AnimatePresence>
            {showConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Dark blur backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowConfirm(false)}
                  className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                />
                {/* Modal Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 16 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent shadow-inner">
                      <Wand2 className="h-6 w-6 animate-pulse" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      Xác nhận chạy {actionLabel}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Bạn có chắc chắn muốn chạy <strong className="text-accent">{actionLabel.toLowerCase()}</strong> cho <strong className="text-accent">{targetText}</strong> bằng mô hình đã chọn không?
                    </p>
                    <div className="mt-6 flex w-full gap-3">
                      <Button
                        variant="secondary"
                        onClick={() => setShowConfirm(false)}
                        className="flex-1"
                      >
                        Hủy
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleConfirmRun}
                        className="flex-1 shadow-lg shadow-accent/25"
                      >
                        Xác nhận
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Premium Success Alert Modal */}
          <AnimatePresence>
            {showSuccessAlert && successResult && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Dark blur backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowSuccessAlert(false)}
                  className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                />
                {/* Modal Card */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 16 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                  className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 shadow-inner">
                      <svg className="h-6 w-6 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">
                      Hoàn tất Auto-Label!
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      Đã gán thành công <strong className="text-emerald-500">{successResult.created_annotations || 0} nhãn</strong> trên <strong className="text-emerald-500">{successResult.processed_images || 0} hình ảnh</strong>.
                    </p>
                    <div className="mt-6 flex w-full">
                      <Button
                        variant="primary"
                        onClick={() => setShowSuccessAlert(false)}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 hover:shadow-lg hover:shadow-emerald-500/20"
                      >
                        Tuyệt vời
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </>
  )
}
