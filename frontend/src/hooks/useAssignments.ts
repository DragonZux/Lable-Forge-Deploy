'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AssignmentUpdatePayload,
  BatchAssignmentPayload,
  Image,
  UserProgress,
} from '@/types'
import { apiGet, apiPatch, apiPost } from '@/lib/api'

export function useProjectProgress(projectId: string) {
  const [progress, setProgress] = useState<UserProgress[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<UserProgress[]>(`/projects/${projectId}/progress/users`)
      setProgress(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { progress, isLoading, error, refetch }
}

export function useBatchAssignImages(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (payload: BatchAssignmentPayload) => {
    setIsLoading(true)
    try {
      return await apiPost(`/projects/${projectId}/assignments/batch`, payload)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return { mutate, isLoading }
}

export function useUpdateAssignment() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageId: string, payload: AssignmentUpdatePayload) => {
    setIsLoading(true)
    try {
      return await apiPatch<Image>(`/images/${imageId}/assignment`, payload)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}
