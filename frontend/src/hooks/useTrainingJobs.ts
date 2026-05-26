'use client'

import { useState, useCallback, useEffect } from 'react'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { TrainingJob } from '@/types'

export function useTrainingJobs(projectId: string) {
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<TrainingJob[]>('/training', {
        project_id: projectId,
      })
      setJobs(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch jobs'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return { jobs, isLoading, error, fetchJobs }
}

export function useCreateTrainingJob(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createJob = useCallback(
    async (
      datasetVersionId: string,
      backend: 'local' | 'colab' = 'local',
      trainingConfig?: Record<string, any>
    ) => {
      if (!projectId) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await apiPost<TrainingJob>('/training', {
          dataset_version_id: datasetVersionId,
          backend: backend,
          training_config: trainingConfig,
        }, {
          project_id: projectId,
        })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create job'
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { createJob, isLoading, error }
}

export function useDeleteTrainingJob(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!projectId || !jobId) return
      setIsLoading(true)
      setError(null)
      try {
        await apiDelete(`/training/${jobId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete job'
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { deleteJob, isLoading, error }
}

export function useAutoLabelTrainingJob(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autoLabel = useCallback(
    async (
      jobId: string,
      options?: {
        imageIds?: string[]
        replaceExisting?: boolean
      }
    ) => {
      if (!projectId || !jobId) return
      setIsLoading(true)
      setError(null)
      try {
        return await apiPost<{
          status: string
          processed_images: number
          skipped_images: number
          failed_images: number
          created_annotations: number
        }>(`/training/${jobId}/auto-label`, {
          image_ids: options?.imageIds,
          replace_existing: options?.replaceExisting,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to auto-label images'
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { autoLabel, isLoading, error }
}

export function useTrainingJobStream(jobId: string) {
  const [job, setJob] = useState<TrainingJob | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!jobId) return

    const eventSource = new EventSource(
      `/api/training/${jobId}/stream`
    )

    setIsConnected(true)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setJob(data)
      } catch (err) {
        console.error('Failed to parse job update:', err)
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [jobId])

  return { job, isConnected }
}
