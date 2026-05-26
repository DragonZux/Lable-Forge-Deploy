'use client'

import { useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { emitAppToast } from '@/lib/toast-events'

export interface DeployedModel {
  id: string
  project_id: string
  training_job_id: string
  api_key?: string | null
  api_endpoint: string
  status: string
  artifact_url?: string | null
  metrics_snapshot?: {
    map_score?: number | null
    precision?: number | null
    recall?: number | null
  } | null
  created_at: string
}

export interface PredictionResult {
  class_name: string
  confidence: number
  bbox?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface InferenceResponse {
  model_id: string
  predictions: PredictionResult[]
  processing_time_ms: number
}

export function useDeployedModels(projectId: string) {
  const [models, setModels] = useState<DeployedModel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<DeployedModel[]>('/deploy', {
        project_id: projectId,
      })
      setModels(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch models'
      setError(msg)
      try { emitAppToast({ message: msg, type: 'error' }) } catch {}
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return { models, isLoading, error, fetchModels }
}

export function useDeployModel(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deployModel = useCallback(
    async (trainingJobId: string) => {
      if (!projectId) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await apiPost<DeployedModel>('/deploy', {
          training_job_id: trainingJobId,
        }, {
          project_id: projectId,
        })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to deploy model'
        setError(msg)
        try { emitAppToast({ message: msg, type: 'error' }) } catch {}
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { deployModel, isLoading, error }
}

export function useTestInference(modelId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const testInference = useCallback(
    async (file: File) => {
      if (!modelId || !file) {
        throw new Error('Model and image file are required')
      }
      setIsLoading(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`/api/deploy/${modelId}/test`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (!response.ok) {
          let errorMessage = `API error: ${response.status}`
          try {
            const errorData = await response.json()
            if (typeof errorData?.detail === 'string') {
              errorMessage = errorData.detail
            } else if (typeof errorData?.message === 'string') {
              errorMessage = errorData.message
            }
          } catch {
            // Keep the status-only fallback when the API response is not JSON.
          }
          throw new Error(errorMessage)
        }

        const data: InferenceResponse = await response.json()
        return data
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to test inference'
        setError(msg)
        try { emitAppToast({ message: msg, type: 'error' }) } catch {}
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [modelId]
  )

  return { testInference, isLoading, error }
}
