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
  ChevronDown,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MoveRight,
  Send,
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

  const selectedProgress = assignableImages.length > 0
    ? Math.min(100, Math.round((selectedImages.size / assignableImages.length) * 100))
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
    <div className="page-shell space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <SectionLabel label="Work Distribution" className="mb-3" />
            <h1 className="break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Assignments
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Route unassigned images to annotators, set due dates, and rebalance workloads from one workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-auto">
            <MetricTile label="Unassigned" value={assignableImages.length} icon={<ImageIcon className="h-4 w-4" />} />
            <MetricTile label="Assigned" value={assignmentStats.assigned} icon={<UsersRound className="h-4 w-4" />} />
            <MetricTile label="Complete" value={`${completionRate}%`} icon={<ListChecks className="h-4 w-4" />} tone="success" />
            <MetricTile label="Overdue" value={assignmentStats.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone={assignmentStats.overdue > 0 ? 'danger' : 'default'} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">New assignment</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select images on the right, then dispatch them to one member.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignee</span>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-10 text-sm font-medium text-foreground outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                >
                  <option value="">Select member...</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email} ({formatRole(member.role)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due date</span>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-11 rounded-xl bg-background text-sm"
              />
            </label>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">Selected images</span>
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                  {selectedImages.size}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${selectedProgress}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {assignableImages.length} images are currently available for assignment.
              </p>
            </div>

            <Button
              onClick={handleAssign}
              isLoading={assigning}
              disabled={!selectedUserId || selectedImages.size === 0}
              className="h-11 w-full"
            >
              <Send className="h-4 w-4" />
              Assign {selectedImages.size || ''} images
            </Button>
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Available images</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedImages.size} selected from {assignableImages.length} unassigned images.
              </p>
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
              disabled={assignableImages.length === 0}
              className="h-10"
            >
              {selectedImages.size === assignableImages.length && assignableImages.length > 0 ? 'Clear selection' : 'Select all'}
            </Button>
          </div>

          {imagesLoading ? (
            <LoadingBlock label="Loading images" />
          ) : assignableImages.length === 0 ? (
            <EmptyPanel
              icon={<CheckCircle2 className="h-7 w-7" />}
              title="No unassigned images"
              description="Every image in the current range is already assigned to a project member."
            />
          ) : (
            <div className="max-h-[620px] overflow-y-auto p-4 sm:p-5">
              <ImageGrid
                images={assignableImages}
                selectedImages={selectedImages}
                onToggle={toggleImage}
              />
            </div>
          )}
        </section>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Done" value={assignmentStats.done} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" />
        <StatTile label="In progress" value={assignmentStats.inProgress} icon={<Clock3 className="h-5 w-5" />} />
        <StatTile label="Overdue" value={assignmentStats.overdue} icon={<AlertTriangle className="h-5 w-5" />} tone={assignmentStats.overdue > 0 ? 'danger' : 'default'} />
        <StatTile label="Annotations" value={assignmentStats.annotations} icon={<ListChecks className="h-5 w-5" />} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <UserRoundCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Progress by member</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Click a row to inspect assigned images and move work to another member.
              </p>
            </div>
          </div>
        </div>

        {progressLoading ? (
          <LoadingBlock label="Loading member progress" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Member</th>
                  <th className="px-5 py-3 text-right font-semibold">Assigned</th>
                  <th className="px-5 py-3 text-right font-semibold">Done</th>
                  <th className="px-5 py-3 text-right font-semibold">In progress</th>
                  <th className="px-5 py-3 text-right font-semibold">Overdue</th>
                  <th className="px-5 py-3 text-right font-semibold">Annotations</th>
                  <th className="px-5 py-3 text-right font-semibold">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {progress.map((row) => {
                  const memberDetail = members.find((member) => member.user_id === row.user_id)
                  const role = memberDetail?.role || 'annotator'
                  const name = row.full_name || row.email || 'Member'
                  const percent = Math.round(row.completion_rate * 100)

                  return (
                    <tr
                      key={row.user_id}
                      onClick={() => handleInspectUser(row.user_id)}
                      className={cn(
                        'cursor-pointer transition hover:bg-muted/30',
                        inspectedUserId === row.user_id && 'bg-accent/[0.04] shadow-[inset_3px_0_0_rgb(var(--accent))]'
                      )}
                    >
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold uppercase text-foreground">
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate font-semibold text-foreground">{name}</span>
                              <RoleBadge role={role} />
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email || row.user_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-semibold text-foreground">{row.total_assigned}</td>
                      <td className="px-5 py-4 text-right font-mono font-semibold text-emerald-600">{row.done}</td>
                      <td className="px-5 py-4 text-right font-mono text-foreground">{row.in_progress}</td>
                      <td className="px-5 py-4 text-right">
                        <span className={cn('font-mono font-semibold', row.overdue > 0 ? 'text-red-600' : 'text-foreground')}>
                          {row.overdue}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-foreground">{row.annotation_count}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="ml-auto w-36">
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono font-semibold text-foreground">{percent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {progress.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground">
                        <UsersRound className="h-6 w-6" />
                      </div>
                      <p className="font-semibold text-foreground">No assigned work yet</p>
                      <p className="mt-1 text-sm text-muted-foreground">Select images above and assign them to a member to begin.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <MoveRight className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Inspect and reassign</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {inspectedUser
                  ? `${inspectedUser.full_name || inspectedUser.email || inspectedUser.user_id} has ${inspectedImages.length} assigned images.`
                  : 'Select a member from the progress table to inspect their queue.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:min-w-64">
              <select
                value={reassignUserId}
                onChange={(event) => setReassignUserId(event.target.value)}
                disabled={!inspectedUserId}
                className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-sm font-medium text-foreground outline-none transition disabled:opacity-50 focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
              >
                <option value="">Reassign to...</option>
                {reassignableMembers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email} ({formatRole(member.role)})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button
              onClick={handleReassign}
              isLoading={reassigning}
              disabled={!reassignUserId || selectedMemberImages.size === 0}
              className="h-10 px-4"
            >
              <MoveRight className="h-4 w-4" />
              Reassign {selectedMemberImages.size || ''}
            </Button>
          </div>
        </div>

        {!inspectedUserId ? (
          <EmptyPanel
            icon={<CalendarClock className="h-7 w-7" />}
            title="Select a member"
            description="Choose a member row above to inspect assigned images and rebalance workloads."
          />
        ) : inspectedImagesLoading ? (
          <LoadingBlock label="Loading assigned images" />
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedMemberImages.size}</span> selected from{' '}
                <span className="font-semibold text-foreground">{inspectedImages.length}</span> assigned images.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="h-10"
                onClick={() => {
                  if (selectedMemberImages.size === inspectedImages.length) {
                    setSelectedMemberImages(new Set())
                  } else {
                    setSelectedMemberImages(new Set(inspectedImages.map((image) => image.id)))
                  }
                }}
                disabled={inspectedImages.length === 0}
              >
                {selectedMemberImages.size === inspectedImages.length && inspectedImages.length > 0 ? 'Clear selection' : 'Select all'}
              </Button>
            </div>

            {inspectedImages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                This member has no assigned images.
              </div>
            ) : (
              <div className="max-h-[520px] overflow-auto pr-1">
                <ImageGrid
                  images={inspectedImages}
                  selectedImages={selectedMemberImages}
                  onToggle={toggleMemberImage}
                  compact
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function MetricTile({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  icon: ReactNode
  tone?: 'default' | 'success' | 'danger'
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-border bg-background p-3 shadow-sm sm:min-w-32',
        tone === 'success' && 'border-emerald-500/20 bg-emerald-500/[0.04]',
        tone === 'danger' && 'border-red-500/25 bg-red-500/[0.04]'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-muted-foreground">{label}</span>
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent',
            tone === 'success' && 'bg-emerald-500/10 text-emerald-600',
            tone === 'danger' && 'bg-red-500/10 text-red-600'
          )}
        >
          {icon}
        </span>
      </div>
      <p className="font-mono text-2xl font-bold leading-none text-foreground">{value}</p>
    </div>
  )
}

function StatTile({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  icon: ReactNode
  tone?: 'default' | 'success' | 'danger'
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p
            className={cn(
              'mt-2 font-mono text-2xl font-bold leading-none text-foreground',
              tone === 'success' && 'text-emerald-600',
              tone === 'danger' && 'text-red-600'
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent',
            tone === 'success' && 'bg-emerald-500/10 text-emerald-600',
            tone === 'danger' && 'bg-red-500/10 text-red-600'
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

function ImageGrid({
  images,
  selectedImages,
  onToggle,
  compact = false,
}: {
  images: Array<{
    id: string
    url: string
    original_filename: string
    assignment_status: string
  }>
  selectedImages: Set<string>
  onToggle: (imageId: string) => void
  compact?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', compact ? 'xl:grid-cols-6' : '2xl:grid-cols-5')}>
      {images.map((image) => {
        const selected = selectedImages.has(image.id)
        return (
          <button
            key={image.id}
            type="button"
            onClick={() => onToggle(image.id)}
            aria-pressed={selected}
            className={cn(
              'group overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:border-accent/40 hover:shadow-md focus-ring',
              selected ? 'border-accent ring-2 ring-accent/20' : 'border-border'
            )}
          >
            <div className="relative aspect-square overflow-hidden bg-muted">
              <img
                src={image.url}
                alt={image.original_filename}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
              <div
                className={cn(
                  'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm backdrop-blur-sm transition',
                  selected
                    ? 'border-accent bg-accent text-white'
                    : 'border-white/70 bg-white/90 text-slate-400 group-hover:text-slate-700'
                )}
              >
                {selected ? <CheckCircle2 className="h-5 w-5" /> : <span className="h-4 w-4 rounded-full border-2 border-current" />}
              </div>
            </div>
            <div className="border-t border-border bg-card p-3">
              <p className="truncate text-xs font-semibold text-foreground">{image.original_filename}</p>
              <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {image.assignment_status.replace('_', ' ')}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        role === 'owner' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
        role === 'admin' && 'border-blue-500/20 bg-blue-500/10 text-blue-700',
        role === 'annotator' && 'border-violet-500/20 bg-violet-500/10 text-violet-700',
        !['owner', 'admin', 'annotator'].includes(role) && 'border-border bg-muted text-muted-foreground'
      )}
    >
      {formatRole(role)}
    </span>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background text-accent">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
