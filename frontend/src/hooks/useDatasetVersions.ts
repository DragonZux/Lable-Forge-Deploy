'use client'

import { useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api'
import { DatasetVersion } from '@/types'

export function useDatasetVersions(projectId: string) {
  const [versions, setVersions] = useState<DatasetVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchVersions = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<DatasetVersion[]>('/versions', {
        project_id: projectId,
      })
      setVersions(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch versions'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return { versions, isLoading, error, fetchVersions }
}

export function useCreateDatasetVersion(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createVersion = useCallback(
    async (payload: any) => {
      if (!projectId) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await apiPost<DatasetVersion>('/versions', payload, {
          project_id: projectId,
        })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create version'
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { createVersion, isLoading, error }
}

export function useExportVersion(versionId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportVersion = useCallback(
    async (format: 'yolov8' | 'coco' | 'pascal_voc' | 'csv' = 'yolov8') => {
      if (!versionId) return
      setIsLoading(true)
      setError(null)
      try {
        const result = await apiGet<any>(
          `/versions/${versionId}/export`,
          { format }
        )
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to export version'
        setError(msg)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [versionId]
  )

  return { exportVersion, isLoading, error }
}
