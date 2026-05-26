'use client'

import { useState, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '@/lib/api'
import { Annotation, AnnotationAuditEvent } from '@/types'

export function useAnnotations(imageId: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnnotations = useCallback(async () => {
    if (!imageId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<Annotation[]>(`/annotations`, { image_id: imageId })
      setAnnotations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch annotations')
    } finally {
      setIsLoading(false)
    }
  }, [imageId])

  return {
    annotations,
    isLoading,
    error,
    fetchAnnotations,
    setAnnotations,
  }
}

export function useSaveAnnotations(imageId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveAnnotations = useCallback(
    async (annotations: any[]) => {
      if (!imageId) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await apiPost('/annotations/batch', {
          image_id: imageId,
          annotations,
        })
        return result
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save annotations'
        setError(errorMsg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [imageId]
  )

  return { saveAnnotations, isLoading, error }
}

export function useAnnotationHistory(imageId: string) {
  const [events, setEvents] = useState<AnnotationAuditEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!imageId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<AnnotationAuditEvent[]>('/annotations/history', { image_id: imageId })
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch annotation history')
    } finally {
      setIsLoading(false)
    }
  }, [imageId])

  return { events, isLoading, error, fetchHistory }
}

export function useDeleteAnnotation() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await apiDelete(`/annotations/${annotationId}`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete annotation'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { deleteAnnotation, isLoading, error }
}

export function useCreateAnnotation() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createAnnotation = useCallback(async (payload: any) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await apiPost<Annotation>('/annotations', payload)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create annotation'
      setError(errorMsg)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { createAnnotation, isLoading, error }
}
