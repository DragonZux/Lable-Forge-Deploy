'use client'

import { useState, useCallback } from 'react'
import { apiPatch, apiDelete, apiPost } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

export function useUpdateClassLabel(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const mutate = useCallback(async (classId: string, payload: { name?: string, color?: string }) => {
    setIsLoading(true)
    try {
      await apiPatch(`/projects/${projectId}/classes/${classId}`, payload)
      toast.success('Class updated successfully')
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to update class')
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  return { mutate, isLoading }
}

export function useDeleteClassLabel(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const mutate = useCallback(async (classId: string) => {
    setIsLoading(true)
    try {
      await apiDelete(`/projects/${projectId}/classes/${classId}`)
      toast.success('Class and its annotations deleted')
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to delete class')
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  return { mutate, isLoading }
}

export function useMergeClassLabels(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const mutate = useCallback(async (sourceClassIds: string[], targetClassId: string) => {
    setIsLoading(true)
    try {
      await apiPost(`/projects/${projectId}/classes/merge`, {
        source_class_ids: sourceClassIds,
        target_class_id: targetClassId,
      })
      toast.success('Classes merged successfully')
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to merge classes')
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [projectId, toast])

  return { mutate, isLoading }
}
