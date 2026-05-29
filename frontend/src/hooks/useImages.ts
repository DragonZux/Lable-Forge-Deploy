'use client'

import { useState, useCallback, useEffect } from 'react'
import { Image, ImageReviewPayload, ImageSplit, ImageStatus } from '@/types'
import api, { apiGet, apiPatch, apiDelete, apiPost } from '@/lib/api'
import { emitAppToast } from '@/lib/toast-events'

interface ImagesResponse {
  images: Image[]
  total: number
  page: number
  pages: number
}

export function useImages(
  projectId: string,
  split?: ImageSplit,
  status?: ImageStatus,
  page: number = 1,
  limit: number = 50,
  search?: string,
  assignedToUserId?: string,
  assignmentStatus?: string,
  classId?: string,
  createdFrom?: string,
  createdTo?: string
) {
  const [images, setImages] = useState<Image[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)
    try {
      const params: Record<string, any> = { project_id: projectId, page, limit }
      if (split) params.split = split
      if (status) params.status = status
      if (search) params.search = search
      if (assignedToUserId) params.assigned_to_user_id = assignedToUserId
      if (assignmentStatus) params.assignment_status = assignmentStatus
      if (classId) params.class_id = classId
      if (createdFrom) params.created_from = createdFrom
      if (createdTo) params.created_to = createdTo

      const data = await apiGet<ImagesResponse>('/images', params)
      setImages(data.images)
      setTotal(data.total)
      setPages(data.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, split, status, page, limit, search, assignedToUserId, assignmentStatus, classId, createdFrom, createdTo])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { images, total, pages, isLoading, error, refetch }
}

export function useUploadImages(projectId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  const mutate = useCallback(
    async (files: File[]) => {
      setIsLoading(true)
      setProgress(0)

      try {
        const formData = new FormData()
        files.forEach((f) => formData.append('files', f))

        const response = await api.post(`/images/upload?project_id=${projectId}`, formData)
        const data = response.data
        setProgress(100)
        return data
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        try { emitAppToast({ message: msg, type: 'error' }) } catch {}
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  return { mutate, isLoading, progress }
}

export function useUpdateImageSplit() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageId: string, split: ImageSplit) => {
    setIsLoading(true)
    try {
      const data = await apiPatch<Image>(`/images/${imageId}/split`, { split })
      return data
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}

export function useReviewImage() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageId: string, payload: ImageReviewPayload) => {
    setIsLoading(true)
    try {
      const data = await apiPatch<Image>(`/images/${imageId}/review`, payload)
      return data
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}

export function useBatchUpdateSplit() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageIds: string[], split: ImageSplit) => {
    setIsLoading(true)
    try {
      const data = await apiPatch('/images/batch-split', {
        image_ids: imageIds,
        split,
      })
      return data
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}

export function useDeleteImage() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageId: string) => {
    setIsLoading(true)
    try {
      await apiDelete(`/images/${imageId}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}

export function useBatchDeleteImages() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (imageIds: string[]) => {
    setIsLoading(true)
    try {
      await apiPost('/images/batch-delete', { image_ids: imageIds })
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}
