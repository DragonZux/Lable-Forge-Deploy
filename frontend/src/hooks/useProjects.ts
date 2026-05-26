'use client'

import { useState, useCallback, useEffect } from 'react'
import { Project, ProjectCreate } from '@/types'
import { apiGet, apiPost, apiDelete } from '@/lib/api'

export function useProjects(workspaceId: string) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!workspaceId) return
    
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<Project[]>('/projects', { workspace_id: workspaceId })
      setProjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    window.addEventListener('project-membership-changed', refetch)
    return () => window.removeEventListener('project-membership-changed', refetch)
  }, [refetch])

  return { projects, isLoading, error, refetch }
}

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiGet<Project>(`/projects/${projectId}`)
      setProject(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  return { project, isLoading, error, refetch: load }
}

export function useCreateProject() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (workspaceId: string, payload: ProjectCreate) => {
    setIsLoading(true)
    try {
      const data = await apiPost<Project>('/projects', payload, {
        workspace_id: workspaceId
      })
      return data
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}

export function useDeleteProject() {
  const [isLoading, setIsLoading] = useState(false)

  const mutate = useCallback(async (projectId: string) => {
    setIsLoading(true)
    try {
      await apiDelete(`/projects/${projectId}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { mutate, isLoading }
}
