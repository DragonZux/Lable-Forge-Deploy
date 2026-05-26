'use client'

import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react'
import { Workspace } from '@/types'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'

function shouldLogApiError(error: unknown) {
  return (error as any)?.status !== 401
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null
  workspaces: Workspace[]
  setCurrentWorkspace: (workspace: Workspace) => void
  switchToWorkspaceById: (id: string) => Promise<void>
  refreshWorkspaces: () => Promise<Workspace[]>
  createWorkspace: (name: string) => Promise<Workspace>
  updateWorkspaceName: (id: string, name: string) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>
  isLoading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadWorkspaceDetail = useCallback(async (workspace: Workspace) => {
    try {
      return await apiGet<Workspace>(`/workspaces/${workspace.id}`)
    } catch (error) {
      if (shouldLogApiError(error)) {
        console.error('Failed to fetch workspace details:', error)
      }
      return workspace
    }
  }, [])

  const refreshWorkspaces = useCallback(async () => {
    const data = await apiGet<Workspace[]>('/workspaces')
    setWorkspaces(data)
    return data
  }, [])

  const createWorkspace = async (name: string) => {
    const newWs = await apiPost<Workspace>('/workspaces', { name })
    const detailedWs = await loadWorkspaceDetail(newWs)
    setWorkspaces((prev) => [...prev, detailedWs])
    setCurrentWorkspace(detailedWs)
    return detailedWs
  }

  const updateWorkspaceName = async (id: string, name: string) => {
    const updatedWs = await apiPatch<Workspace>(`/workspaces/${id}`, { name })
    const detailedWs = await loadWorkspaceDetail(updatedWs)
    setWorkspaces((prev) => prev.map((w) => w.id === id ? { ...w, ...detailedWs } : w))
    if (currentWorkspace?.id === id) {
      setCurrentWorkspaceState(detailedWs)
    }
    return detailedWs
  }

  const deleteWorkspace = async (id: string) => {
    await apiDelete(`/workspaces/${id}`)
    const remainingWorkspaces = workspaces.filter((workspace) => workspace.id !== id)
    setWorkspaces(remainingWorkspaces)

    if (currentWorkspace?.id !== id) {
      return
    }

    if (remainingWorkspaces.length === 0) {
      setCurrentWorkspaceState(null)
      localStorage.removeItem('currentWorkspaceId')
      return
    }

    const nextWorkspace = await loadWorkspaceDetail(remainingWorkspaces[0])
    setCurrentWorkspaceState(nextWorkspace)
    localStorage.setItem('currentWorkspaceId', nextWorkspace.id)
  }

  useEffect(() => {
    const loadWorkspaces = async () => {
      const savedWorkspaceId = localStorage.getItem('currentWorkspaceId')

      try {
        const data = await refreshWorkspaces()

        // Set current workspace
        if (savedWorkspaceId) {
          const workspace = data.find((w: Workspace) => w.id === savedWorkspaceId)
          if (workspace) {
            const detailedWorkspace = await loadWorkspaceDetail(workspace)
            setCurrentWorkspaceState(detailedWorkspace)
          } else {
            // Try fetching directly (e.g. if invited)
            try {
              const ws = await apiGet<Workspace>(`/workspaces/${savedWorkspaceId}`)
              if (ws) {
                setCurrentWorkspaceState(ws)
              } else if (data.length > 0) {
                setCurrentWorkspaceState(data[0])
                localStorage.setItem('currentWorkspaceId', data[0].id)
              }
            } catch (error) {
              if (shouldLogApiError(error)) {
                console.error('Failed to fetch workspace directly:', error)
              }
              if (data.length > 0) {
                setCurrentWorkspaceState(data[0])
                localStorage.setItem('currentWorkspaceId', data[0].id)
              }
            }
          }
        } else if (data.length > 0) {
          const detailedWorkspace = await loadWorkspaceDetail(data[0])
          setCurrentWorkspaceState(detailedWorkspace)
          localStorage.setItem('currentWorkspaceId', data[0].id)
        }
      } catch (error) {
        if (shouldLogApiError(error)) {
          console.error('Failed to load workspaces:', error)
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspaces()
  }, [loadWorkspaceDetail, refreshWorkspaces])

  const setCurrentWorkspace = (workspace: Workspace) => {
    if (workspace.members) {
      setCurrentWorkspaceState(workspace)
    } else {
      apiGet<Workspace>(`/workspaces/${workspace.id}`)
        .then(setCurrentWorkspaceState)
        .catch(() => setCurrentWorkspaceState(workspace))
    }
    localStorage.setItem('currentWorkspaceId', workspace.id)
  }

  const switchToWorkspaceById = async (id: string) => {
    localStorage.setItem('currentWorkspaceId', id)
    let latestWorkspaces = workspaces
    try {
      latestWorkspaces = await refreshWorkspaces()
    } catch (error) {
      if (shouldLogApiError(error)) {
        console.error('Failed to refresh workspaces:', error)
      }
    }

    const workspace = latestWorkspaces.find((w: Workspace) => w.id === id)
    if (workspace) {
      try {
        const ws = await apiGet<Workspace>(`/workspaces/${id}`)
        setCurrentWorkspaceState(ws)
        setWorkspaces((prev) => prev.map((item) => item.id === id ? { ...item, ...ws } : item))
      } catch (error) {
        if (shouldLogApiError(error)) {
          console.error('Failed to fetch workspace details:', error)
        }
        setCurrentWorkspaceState(workspace)
      }
    } else {
      try {
        const ws = await apiGet<Workspace>(`/workspaces/${id}`)
        if (ws) {
          setCurrentWorkspaceState(ws)
          setWorkspaces((prev) => {
            if (prev.some((item) => item.id === ws.id)) {
              return prev.map((item) => item.id === ws.id ? { ...item, ...ws } : item)
            }
            return [...prev, ws]
          })
        }
      } catch (error) {
        if (shouldLogApiError(error)) {
          console.error('Failed to switch to workspace:', error)
        }
      }
    }
  }

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        setCurrentWorkspace,
        switchToWorkspaceById,
        refreshWorkspaces,
        createWorkspace,
        updateWorkspaceName,
        deleteWorkspace,
        isLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (context === undefined) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}
