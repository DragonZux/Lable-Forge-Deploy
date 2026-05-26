'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Input, Modal } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/components/ui/Toast'
import { apiPatch, apiDelete, apiGet } from '@/lib/api'
import { useProject } from '@/hooks/useProjects'
import {
  AlertTriangle,
  Box,
  Crown,
  Mail,
  Tag,
  Trash2,
  UserPlus,
  Users,
  Settings,
} from 'lucide-react'
import { InviteProjectMemberModal } from '@/components/project/InviteProjectMemberModal'
import { ClassManagement } from '@/components/project/ClassManagement'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import { Tabs } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import { ProjectInvitationResponse, ProjectType } from '@/types'

const PRODUCT_PROJECT_TYPES: { value: ProjectType; label: string; description: string }[] = [
  {
    value: 'classification',
    label: 'Product Classification',
    description: 'Assign product images to predefined types/classes.',
  },
  {
    value: 'object-detection',
    label: 'Product Labeling',
    description: 'Draw product bounding boxes and use them for auto-labeling after training.',
  },
]

export default function ProjectSettingsPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params?.projectId || ''
  const { project, isLoading, error, refetch } = useProject(projectId)
  const { canManageProject } = usePermissions(project)
  const { user: currentUser } = useAuth()
  const toast = useToast()
  
  const [form, setForm] = useState<{ name: string; description: string; type: ProjectType }>({
    name: '',
    description: '',
    type: 'object-detection',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingProject, setIsDeletingProject] = useState(false)
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState<string | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitationResponse[]>([])
  const [isCancellingInvite, setIsCancellingInvite] = useState<string | null>(null)

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        description: project.description || '',
        type: project.type,
      })
    }
  }, [project])

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Project name is required')
      return
    }

    setIsSaving(true)
    try {
      await apiPatch(`/projects/${projectId}`, {
        name: form.name.trim(),
        description: form.description.trim(),
        type: form.type,
      })
      toast.success('Project settings updated')
      refetch()
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to save project settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return

    setIsRemoving(userId)
    try {
      await apiDelete(`/projects/${projectId}/members/${userId}`)
      toast.success('Member removed')
      refetch()
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to remove member')
    } finally {
      setIsRemoving(null)
    }
  }

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await apiPatch(`/projects/${projectId}/members/${userId}`, {
        role: newRole,
      })
      toast.success('Member role updated')
      refetch()
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to update member role')
    }
  }

  const handleCancelInvitation = async (invitationId: string) => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) return

    setIsCancellingInvite(invitationId)
    try {
      await apiDelete(`/projects/${projectId}/invitations/${invitationId}`)
      toast.success('Invitation cancelled')
      fetchPendingInvitations()
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to cancel invitation')
    } finally {
      setIsCancellingInvite(null)
    }
  }

  const handleDeleteProject = async () => {
    if (!projectId || !project) return

    setIsDeletingProject(true)
    try {
      await apiDelete(`/projects/${projectId}`)
      toast.success('Project deleted')
      setIsDeleteProjectModalOpen(false)
      router.push('/dashboard')
    } catch (error: any) {
      toast.error(error?.detail || error?.message || 'Failed to delete project')
    } finally {
      setIsDeletingProject(false)
    }
  }

  const canManageMembers = canManageProject
  const activeInvitations = pendingInvitations.length
  const memberCount = project?.members?.length || 0
  const classCount = project?.class_labels?.length || 0

  const fetchPendingInvitations = useCallback(async () => {
    if (!projectId || !canManageMembers) {
      setPendingInvitations([])
      return
    }

    try {
      const data = await apiGet<ProjectInvitationResponse[]>(
        `/projects/${projectId}/invitations`,
        { status: 'pending' }
      )
      setPendingInvitations(data)
    } catch (error) {
      console.error('Failed to load pending project invitations:', error)
      setPendingInvitations([])
    }
  }, [projectId, canManageMembers])

  useEffect(() => {
    fetchPendingInvitations()
  }, [fetchPendingInvitations])

  const settingsTabs = project
    ? [
      {
        id: 'details',
        label: (
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span>Project Details</span>
          </div>
        ),
        content: (
          <section className="panel overflow-hidden p-0">
            <div className="border-b border-border bg-muted/25 p-5 sm:p-6">
              <SectionLabel label="General Configuration" />
              <h2 className="mt-4 font-display text-2xl leading-tight text-foreground">Project identity</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep naming, description, and labeling mode clear for everyone working in this project.
              </p>
            </div>

            <div className="grid gap-6 p-5 sm:p-6">
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-foreground">Project Name</label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Enter project name"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-foreground">Description</label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Project description"
                  className="h-12 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-foreground">Project Type</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRODUCT_PROJECT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: type.value })}
                      className={cn(
                        'group rounded-xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5',
                        form.type === type.value
                          ? 'border-accent bg-accent/10 ring-4 ring-accent/10'
                          : 'border-border bg-background hover:border-accent/30 hover:shadow-md'
                      )}
                    >
                      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform group-hover:scale-105">
                        <Box className="h-5 w-5" />
                      </span>
                      <span className="block text-sm font-semibold text-foreground">{type.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{type.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button onClick={handleSave} isLoading={isSaving} className="min-w-[10rem]">
                Save changes
              </Button>
            </div>
          </section>
        )
      },
      {
        id: 'members',
        label: (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>Project Members</span>
          </div>
        ),
        content: (
          <section className="panel overflow-hidden p-0">
            <div className="flex flex-col gap-4 border-b border-border bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <SectionLabel label="Collaboration Team" />
                <h2 className="mt-4 font-display text-2xl leading-tight text-foreground">Members and invitations</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Control project access without leaving this workspace.
                </p>
              </div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => setIsInviteModalOpen(true)}
                disabled={!canManageMembers}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            </div>

            <div className="grid gap-3 p-5 sm:p-6">
              {project.members?.map((member) => (
                <div key={member.user_id} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-sm transition-all hover:border-accent/25 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-xl font-bold shadow-sm",
                        member.role === 'owner' 
                          ? "bg-amber-500 text-white" 
                          : member.role === 'admin' 
                            ? "bg-violet-500 text-white"
                            : "bg-accent/10 text-accent"
                      )}>
                        {member.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{member.full_name}</p>
                          {member.user_id === currentUser?.id && (
                            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest">You</span>
                          )}
                          {member.role === 'owner' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                              <Crown className="h-3 w-3" />
                              Owner
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  
                  <div className="flex items-center gap-4">
                    {canManageMembers && member.user_id !== currentUser?.id && member.role !== 'owner' ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                        className="h-9 rounded-lg border border-border bg-card px-3 text-[10px] font-bold uppercase tracking-widest text-foreground outline-none transition focus:ring-2 focus:ring-accent/30 cursor-pointer"
                      >
                        <option value="admin">Admin</option>
                        <option value="annotator">Annotator</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-1 rounded tracking-widest",
                        member.role === 'owner' ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                      )}>
                        {member.role}
                      </span>
                    )}
                    
                    {canManageMembers && member.user_id !== currentUser?.id && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        disabled={isRemoving === member.user_id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-col gap-4 rounded-xl border border-dashed border-amber-300/70 bg-amber-50/40 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 font-bold text-amber-700 shadow-sm">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{invitation.invitee_email}</p>
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest">
                          Pending
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Invited by {invitation.invited_by_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded tracking-widest bg-muted text-muted-foreground">
                      {invitation.role}
                    </span>

                    {canManageMembers && (
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        disabled={isCancellingInvite === invitation.id}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Cancel invitation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {project.members?.length === 0 && pendingInvitations.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                  No project members yet.
                </div>
              )}
            </div>
          </section>
        )
      },
      {
        id: 'labels',
        label: (
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <span>Class Labels</span>
          </div>
        ),
        content: (
          <section className="panel p-5 sm:p-6">
            <ClassManagement 
              projectId={projectId} 
              classes={project.class_labels || []} 
              onRefresh={refetch} 
            />
          </section>
        )
      },
      {
        id: 'danger',
        label: (
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Danger Zone</span>
          </div>
        ),
        content: (
          <section className="overflow-hidden rounded-xl border border-red-200 bg-red-50/60 shadow-sm">
            <div className="border-b border-red-200/70 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-2xl leading-tight text-red-700">Danger Zone</h3>
                  <p className="mt-2 text-sm leading-6 text-red-700/75">
                    Once you delete a project, all images, annotations, dataset versions, training jobs, and deployments are removed.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-sm font-medium text-red-700">This action cannot be undone.</p>
              <Button
                variant="danger"
                onClick={() => setIsDeleteProjectModalOpen(true)}
                isLoading={isDeletingProject}
                disabled={!canManageMembers}
              >
                Delete Project
              </Button>
            </div>
          </section>
        )
      }
    ]
    : []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Project not available</h2>
          <p className="mt-3 text-sm text-muted-foreground">Unable to load project settings right now.</p>
        </div>
      </div>
    )
  }

  if (!canManageProject) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your project role does not allow managing settings.
          </p>
          <Button className="mt-6" onClick={() => router.replace(`/projects/${projectId}/dataset`)}>
            Back to project
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="page-hero">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <SectionLabel label="Project Settings" className="mb-4" />
              <h1 className="page-title">{project.name}</h1>
              <p className="page-subtitle mt-3">Configure project identity, labels, collaborators, and destructive actions.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SettingsMetric label="Members" value={memberCount} icon={<Users className="h-4 w-4" />} />
              <SettingsMetric label="Classes" value={classCount} icon={<Tag className="h-4 w-4" />} />
              <SettingsMetric label="Invites" value={activeInvitations} icon={<Mail className="h-4 w-4" />} />
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs tabs={settingsTabs} defaultTab="details" />
      </div>

      <InviteProjectMemberModal
        projectId={projectId}
        projectName={project.name}
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false)
          refetch()
          fetchPendingInvitations()
        }}
      />

      <Modal
        isOpen={isDeleteProjectModalOpen}
        onClose={() => setIsDeleteProjectModalOpen(false)}
        title="Delete Project"
        size="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This will permanently delete <span className="font-semibold">{project.name}</span> and all images, annotations, dataset versions, training jobs, and deployments inside it.
          </div>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteProjectModalOpen(false)}
              className="h-10 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteProject}
              isLoading={isDeletingProject}
              className="h-10 text-sm font-semibold"
            >
              Delete Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function SettingsMetric({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-background/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
    </div>
  )
}
