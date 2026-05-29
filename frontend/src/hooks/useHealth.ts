'use client'

import { useState, useCallback } from 'react'
import { apiGet } from '@/lib/api'

export interface ProjectHealth {
  project_id: string
  project_type?: 'object-detection' | 'classification'
  timestamp: string
  summary: {
    total_images: number
    annotated_images: number
    annotated_percent: number
    total_annotations: number
    avg_annotations_per_image: number
  }
  class_balance: Array<{
    name: string
    count: number
    percentage: number
  }>
  split_distribution: {
    train: number
    valid: number
    test: number
    unassigned: number
  }
  annotation_types: Record<string, number>
  images_without_annotations: number
  image_size_distribution: Array<{
    label: string
    count: number
  }>
  validation?: {
    duplicate_images: Array<Record<string, any>>
    small_boxes: Array<Record<string, any>>
    large_boxes: Array<Record<string, any>>
    out_of_bounds_annotations: Array<Record<string, any>>
    unused_classes: Array<Record<string, any>>
    unassigned_images: Array<Record<string, any>>
    class_split_imbalance: Array<Record<string, any>>
  }
  issues: Array<{
    type: string
    message: string
    severity: 'warning' | 'error'
  }>
}

export function useProjectHealth(projectId: string) {
  const [health, setHealth] = useState<ProjectHealth | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async (refresh = false) => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const url = refresh
        ? `/health/project/${projectId}?refresh=true`
        : `/health/project/${projectId}`
      const data = await apiGet<ProjectHealth>(url)
      setHealth(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch health'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return { health, isLoading, error, fetchHealth }
}
