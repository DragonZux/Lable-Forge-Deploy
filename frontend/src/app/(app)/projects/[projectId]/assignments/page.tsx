'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useImages } from '@/hooks/useImages'
import { useProject } from '@/hooks/useProjects'
import { useBatchAssignImages, useProjectProgress, useUpdateAssignment } from '@/hooks/useAssignments'
import { usePermissions } from '@/hooks/usePermissions'
import { Button, Input } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { cn } from '@/lib/cn'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MoveRight,
  Send,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'

export default function AssignmentsPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { project } = useProject(projectId)
  const { canManageProject } = usePermissions(project)
  const { images, isLoading: imagesLoading, refetch: refetchImages } = useImages(projectId, undefined, undefined, 1, 200)
  const { progress, isLoading: progressLoading, refetch: refetchProgress } = useProjectProgress(projectId)
  const { mutate: batchAssign, isLoading: assigning } = useBatchAssignImages(projectId)
  const { mutate: updateAssignment, isLoading: reassigning } = useUpdateAssignment()

  const [selectedUserId, setSelectedUserId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [inspectedUserId, setInspectedUserId] = useState('')
  const [selectedMemberImages, setSelectedMemberImages] = useState<Set<string>>(new Set())
  const [reassignUserId, setReassignUserId] = useState('')

  const {
    images: inspectedImages,
    isLoading: inspectedImagesLoading,
    refetch: refetchInspectedImages,
  } = useImages(projectId, undefined, undefined, 1, 500, undefined, inspectedUserId || undefined)

  const members = useMemo(() => {
    return (project?.members || []).filter((member) => ['owner', 'admin', 'annotator'].includes(member.role))
  }, [project])

  const assignableImages = useMemo(() => {
    return images.filter((image) => !image.assigned_to_user_id && image.assignment_status === 'unassigned')
  }, [images])

  const inspectedUser = useMemo(() => {
    return progress.find((row) => row.user_id === inspectedUserId) || null
  }, [inspectedUserId, progress])

  const reassignableMembers = useMemo(() => {
    return members.filter((member) => member.user_id !== inspectedUserId)
  }, [inspectedUserId, members])

  const assignmentStats = useMemo(() => {
    return progress.reduce(
      (acc, row) => {
        acc.assigned += row.total_assigned
        acc.done += row.done
        acc.inProgress += row.in_progress
        acc.overdue += row.overdue
        acc.annotations += row.annotation_count
        return acc
      },
      { assigned: 0, done: 0, inProgress: 0, overdue: 0, annotations: 0 }
    )
  }, [progress])

  const completionRate = assignmentStats.assigned > 0
    ? Math.round((assignmentStats.done / assignmentStats.assigned) * 100)
    : 0

  const toggleImage = (imageId: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }

  const toggleMemberImage = (imageId: string) => {
    setSelectedMemberImages((prev) => {
      const next = new Set(prev)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }

  const handleAssign = async () => {
    if (!selectedUserId || selectedImages.size === 0) return
    await batchAssign({
      image_ids: Array.from(selectedImages),
      assigned_to_user_id: selectedUserId,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    })
    setSelectedImages(new Set())
    await Promise.all([refetchImages(), refetchProgress()])
  }

  const handleInspectUser = (userId: string) => {
    setInspectedUserId(userId)
    setSelectedMemberImages(new Set())
    setReassignUserId('')
  }

  const handleReassign = async () => {
    if (!reassignUserId || selectedMemberImages.size === 0) return
    await Promise.all(
      Array.from(selectedMemberImages).map((imageId) =>
        updateAssignment(imageId, { assigned_to_user_id: reassignUserId })
      )
    )
    setSelectedMemberImages(new Set())
    await Promise.all([refetchImages(), refetchInspectedImages(), refetchProgress()])
  }

  if (project && !canManageProject) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Only project admins can assign images.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell max-w-[1600px] space-y-8">
      <div className="page-hero">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
          <SectionLabel label="Work Distribution" className="mb-4" />
          <h1 className="page-title">Assign <span className="gradient-text">Images</span></h1>
          <p className="page-subtitle mt-3 max-w-2xl">
            Route image batches to annotators, set deadlines, and track work from image assignment and annotation activity.
          </p>
        </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <HeroMetric label="Unassigned" value={assignableImages.length} icon={<ImageIcon className="h-4 w-4" />} />
            <HeroMetric label="Completion" value={`${completionRate}%`} icon={<ListChecks className="h-4 w-4" />} />
            <HeroMetric label="Overdue" value={assignmentStats.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone={assignmentStats.overdue > 0 ? 'danger' : 'default'} />
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        <div className="panel-soft h-fit overflow-hidden p-0">
          <div className="border-b border-border bg-muted/25 p-5">
            <div className="flex items-center gap-3">
              <div className="icon-gradient h-11 w-11 rounded-xl">
              <UsersRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl text-foreground">Assignment</h2>
                <p className="text-sm text-muted-foreground">Choose member, deadline, and image batch</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Member</span>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="select-control"
              >
                <option value="">Select assignee</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email} ({member.role})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Deadline</span>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-12"
              />
            </label>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">Current batch</span>
                <span className="font-mono text-xs text-accent">{selectedImages.size} selected</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-secondary transition-all"
                  style={{
                    width: `${assignableImages.length > 0 ? Math.min(100, (selectedImages.size / assignableImages.length) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Select images on the right, then assign them as one reviewable batch.
              </p>
            </div>

            <Button
              onClick={handleAssign}
              isLoading={assigning}
              disabled={!selectedUserId || selectedImages.size === 0}
              className="h-12 w-full px-6"
            >
              <Send className="w-4 h-4" />
              Assign {selectedImages.size || ''} Images
            </Button>
          </div>
        </div>

        <div className="panel overflow-hidden p-0">
          <div className="flex flex-col gap-4 border-b border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl text-foreground">Images</h2>
              <p className="text-sm text-muted-foreground">{selectedImages.size} selected from {assignableImages.length}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (selectedImages.size === assignableImages.length) {
                  setSelectedImages(new Set())
                } else {
                  setSelectedImages(new Set(assignableImages.map((image) => image.id)))
                }
              }}
            >
              {selectedImages.size === assignableImages.length ? 'Clear' : 'Select All'}
            </Button>
          </div>

          {imagesLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : assignableImages.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="icon-gradient mb-4 h-14 w-14 rounded-xl">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="font-display text-2xl text-foreground">No unassigned images</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Every image in this page range is already routed to a project member.
              </p>
            </div>
          ) : (
            <div className="grid max-h-[600px] grid-cols-2 gap-4 overflow-auto p-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {assignableImages.map((image) => {
                const selected = selectedImages.has(image.id)
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => toggleImage(image.id)}
                    className={cn(
                      'group overflow-hidden rounded-xl border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
                      selected ? 'border-accent ring-4 ring-accent/10' : 'border-border hover:border-accent/30'
                    )}
                    >
                      <div className="aspect-square bg-muted relative overflow-hidden">
                      <img src={image.url} alt={image.original_filename} className="w-full h-full object-cover" />
                      <div className={cn(
                        'absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm backdrop-blur',
                        selected ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/90 text-slate-400'
                      )}>
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-950/45 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-semibold text-foreground truncate">{image.original_filename}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                        {image.assignment_status.replace('_', ' ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Assigned" value={assignmentStats.assigned} icon={<ImageIcon className="h-5 w-5" />} />
        <StatCard label="Done" value={assignmentStats.done} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        <StatCard label="In progress" value={assignmentStats.inProgress} icon={<Clock3 className="h-5 w-5" />} />
        <StatCard label="Annotations" value={assignmentStats.annotations} icon={<ListChecks className="h-5 w-5" />} />
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="border-b border-border p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-gradient h-10 w-10 rounded-xl">
                <UserRoundCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-xl text-foreground">Progress by Member</h2>
                <p className="text-sm text-muted-foreground">Assigned images plus actual annotation volume</p>
              </div>
            </div>
            <div className="rounded-full border border-accent/20 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-accent">
              Click a row to inspect
            </div>
          </div>
        </div>

        {progressLoading ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="text-left p-4 font-semibold">Member</th>
                  <th className="text-right p-4 font-semibold">Assigned</th>
                  <th className="text-right p-4 font-semibold">Done</th>
                  <th className="text-right p-4 font-semibold">In progress</th>
                  <th className="text-right p-4 font-semibold">Overdue</th>
                  <th className="text-right p-4 font-semibold">Annotations</th>
                  <th className="text-right p-4 font-semibold">Rate</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((row) => (
                  <tr
                    key={row.user_id}
                    onClick={() => handleInspectUser(row.user_id)}
                    className={cn(
                      'cursor-pointer border-t border-border transition-colors hover:bg-muted/40',
                      inspectedUserId === row.user_id && 'bg-accent/5 shadow-[inset_4px_0_0_rgb(var(--accent))]'
                    )}
                  >
                    <td className="p-4">
                      <div className="font-semibold text-foreground">{row.full_name || row.email || row.user_id}</div>
                      <div className="text-xs text-muted-foreground">{row.email || 'Click to view assigned images'}</div>
                    </td>
                    <td className="p-4 text-right font-semibold">{row.total_assigned}</td>
                    <td className="p-4 text-right text-emerald-600 font-semibold">{row.done}</td>
                    <td className="p-4 text-right">{row.in_progress}</td>
                    <td className="p-4 text-right">
                      <span className={cn(row.overdue > 0 && 'text-red-600 font-semibold')}>
                        {row.overdue}
                      </span>
                    </td>
                    <td className="p-4 text-right">{row.annotation_count}</td>
                    <td className="p-4 text-right">
                      <span className="inline-flex items-center gap-1.5 justify-end">
                        <Clock3 className="w-3.5 h-3.5 text-muted-foreground" />
                        {Math.round(row.completion_rate * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {progress.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-muted-foreground">
                      No assigned work yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden p-0">
        <div className="p-5 border-b border-border flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-gradient h-10 w-10 rounded-xl">
              <MoveRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-xl text-foreground">Member Images</h2>
              <p className="text-sm text-muted-foreground">
                {inspectedUser
                  ? `${inspectedUser.full_name || inspectedUser.email || inspectedUser.user_id} has ${inspectedImages.length} assigned images`
                  : 'Click a member above to review their assigned images'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={reassignUserId}
              onChange={(event) => setReassignUserId(event.target.value)}
              disabled={!inspectedUserId}
              className="select-control h-11 min-w-[240px]"
            >
              <option value="">Reassign to member</option>
              {reassignableMembers.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.full_name || member.email} ({member.role})
                </option>
              ))}
            </select>
            <Button
              onClick={handleReassign}
              isLoading={reassigning}
              disabled={!reassignUserId || selectedMemberImages.size === 0}
              className="h-11 px-5"
            >
              <MoveRight className="w-4 h-4" />
              Reassign {selectedMemberImages.size || ''}
            </Button>
          </div>
        </div>

        {!inspectedUserId ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <CalendarClock className="h-6 w-6" />
            </div>
            <h3 className="font-display text-2xl text-foreground">Select a member</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Choose a member in the progress table to inspect assigned images and rebalance work.
            </p>
          </div>
        ) : inspectedImagesLoading ? (
          <div className="h-44 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {selectedMemberImages.size} selected from {inspectedImages.length}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedMemberImages.size === inspectedImages.length) {
                    setSelectedMemberImages(new Set())
                  } else {
                    setSelectedMemberImages(new Set(inspectedImages.map((image) => image.id)))
                  }
                }}
                disabled={inspectedImages.length === 0}
              >
                {selectedMemberImages.size === inspectedImages.length && inspectedImages.length > 0 ? 'Clear' : 'Select All'}
              </Button>
            </div>

            {inspectedImages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-muted-foreground">
                This member has no assigned images.
              </div>
            ) : (
              <div className="grid max-h-[520px] grid-cols-2 gap-4 overflow-auto pr-1 md:grid-cols-4 xl:grid-cols-6">
                {inspectedImages.map((image) => {
                  const selected = selectedMemberImages.has(image.id)
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => toggleMemberImage(image.id)}
                      className={cn(
                        'group overflow-hidden rounded-xl border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
                        selected ? 'border-accent ring-4 ring-accent/10' : 'border-border hover:border-accent/30'
                      )}
                    >
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        <img src={image.url} alt={image.original_filename} className="w-full h-full object-cover" />
                        <div className={cn(
                          'absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm backdrop-blur',
                          selected ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/90 text-slate-400'
                        )}>
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-foreground truncate">{image.original_filename}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                          {image.assignment_status.replace('_', ' ')}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function HeroMetric({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  icon: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-background/80 px-4 py-3 shadow-sm backdrop-blur',
        tone === 'danger' && Number(value) > 0 ? 'border-red-200 text-red-600' : 'border-border text-foreground'
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className="font-display text-2xl leading-none">{value}</div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  icon: ReactNode
  tone?: 'default' | 'success'
}) {
  return (
    <div className="panel-soft p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
          <p className={cn('mt-2 font-display text-3xl leading-none text-foreground', tone === 'success' && 'text-emerald-600')}>
            {value}
          </p>
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone === 'success' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-accent/10 text-accent')}>
          {icon}
        </div>
      </div>
    </div>
  )
}
