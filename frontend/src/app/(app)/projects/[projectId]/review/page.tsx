'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { apiGet } from '@/lib/api'
import { Annotation, Image as ImageType } from '@/types'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import { useAnnotationHistory } from '@/hooks/useAnnotations'
import { useImages, useReviewImage } from '@/hooks/useImages'
import AuditHistoryPanel from '@/components/annotation/AuditHistoryPanel'
import { Badge, Button, EmptyState, SectionLabel } from '@/components/ui'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Edit3,
  ImageIcon,
  MessageSquare,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export default function ReviewQueuePage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const projectId = params?.projectId || ''
  const [page, setPage] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationLoading, setAnnotationLoading] = useState(false)
  const [comment, setComment] = useState('')
  const [historyOpen, setHistoryOpen] = useState(true)

  const { project } = useProject(projectId)
  const { canReview, role } = usePermissions(project)
  const { images, total, pages, isLoading, refetch } = useImages(
    projectId,
    undefined,
    'needs_review',
    page,
    24
  )
  const selectedImage = images[selectedIndex]
  const { mutate: reviewImage, isLoading: isReviewing } = useReviewImage()
  const { events: auditEvents, fetchHistory } = useAnnotationHistory(selectedImage?.id || '')

  const classColorById = useMemo(() => {
    return new Map((project?.class_labels || []).map((label) => [label.id, label.color]))
  }, [project?.class_labels])

  useEffect(() => {
    if (selectedIndex > images.length - 1) {
      setSelectedIndex(Math.max(0, images.length - 1))
    }
  }, [images.length, selectedIndex])

  const fetchSelectedAnnotations = useCallback(async () => {
    if (!selectedImage?.id || !canReview) {
      setAnnotations([])
      return
    }

    setAnnotationLoading(true)
    try {
      const data = await apiGet<Annotation[]>('/annotations', { image_id: selectedImage.id })
      setAnnotations(data)
      await fetchHistory()
      setComment(selectedImage.reviewer_comment || '')
    } catch (error) {
      console.error('Failed to load review annotations:', error)
      setAnnotations([])
    } finally {
      setAnnotationLoading(false)
    }
  }, [canReview, fetchHistory, selectedImage])

  useEffect(() => {
    fetchSelectedAnnotations()
  }, [fetchSelectedAnnotations])

  const handleDecision = async (status: 'approved' | 'rejected') => {
    if (!selectedImage || !canReview) return

    await reviewImage(selectedImage.id, {
      status,
      comment: comment.trim() || null,
    })
    setComment('')
    await refetch()
  }

  const goToAnnotator = () => {
    if (!selectedImage) return
    router.push(`/projects/${projectId}/annotate?image=${selectedImage.id}`)
  }

  if (!canReview) {
    return (
      <div className="page-shell">
        <div className="flex min-h-[60vh] items-center justify-center">
          <EmptyState
            icon={<AlertTriangle className="h-14 w-14 text-amber-500" />}
            title="Review access required"
            description={`Your current role is ${role}. Only project reviewers and admins can use the review queue.`}
            action={{ label: 'Back to dataset', href: `/projects/${projectId}/dataset` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-5">
          <SectionLabel label="Review Queue" className="mb-3" />
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-display text-foreground">Needs review</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {total} images waiting for a decision
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:text-accent"
              title="Refresh queue"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-12 w-12 text-muted-foreground/40" />}
              title="Queue is clear"
              description="Images submitted for review will appear here."
              className="py-16"
            />
          ) : (
            <div className="space-y-2">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-all',
                    selectedImage?.id === image.id
                      ? 'border-accent bg-accent/[0.06] shadow-sm'
                      : 'border-border bg-background hover:border-accent/30'
                  )}
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    <img
                      src={image.url}
                      alt={image.original_filename}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-foreground">{image.original_filename}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant="accent"
                        className="px-2 py-1 text-[9px] font-bold uppercase"
                        isPulsing
                      >
                        Review
                      </Badge>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {image.split}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => {
                setPage((value) => Math.max(1, value - 1))
                setSelectedIndex(0)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-bold text-muted-foreground">
              Page {page} / {pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === pages}
              onClick={() => {
                setPage((value) => Math.min(pages, value + 1))
                setSelectedIndex(0)
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!selectedImage ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<ImageIcon className="h-14 w-14 text-muted-foreground/40" />}
              title="Select an image"
              description="Pick an item from the queue to inspect annotations and make a review decision."
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 border-b border-border bg-card/70 px-6 py-4">
              <div className="min-w-0">
                <SectionLabel label="Review Asset" className="mb-2" />
                <h1 className="truncate text-2xl font-display text-foreground">
                  {selectedImage.original_filename}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/projects/${projectId}/dataset`}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Dataset
                </Link>
                <Button variant="secondary" onClick={goToAnnotator} className="h-10">
                  <Edit3 className="h-4 w-4" />
                  Open annotator
                </Button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
              <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-muted/25 p-8">
                <motion.div
                  key={selectedImage.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative max-h-full max-w-full"
                >
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.original_filename}
                    className="max-h-[calc(100vh-15rem)] max-w-full rounded-xl bg-white object-contain shadow-2xl"
                  />
                  <AnnotationOverlay
                    image={selectedImage}
                    annotations={annotations}
                    classColorById={classColorById}
                  />
                  {annotationLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/50 backdrop-blur-sm">
                      <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent/20 border-t-accent" />
                    </div>
                  )}
                </motion.div>
              </div>

              <aside className="flex min-h-0 flex-col border-l border-border bg-card">
                <div className="space-y-5 p-6">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Decision note
                      </span>
                    </div>
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Leave a reviewer comment..."
                      className="h-28 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => handleDecision('approved')}
                      isLoading={isReviewing}
                      className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleDecision('rejected')}
                      disabled={isReviewing}
                      variant="secondary"
                      className="h-12 rounded-2xl text-red-600"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <Info label="Annotations" value={String(annotations.length)} />
                      <Info label="Split" value={selectedImage.split} />
                      <Info label="Resolution" value={`${selectedImage.width} x ${selectedImage.height}`} />
                      <Info label="Submitted" value={selectedImage.completed_at ? new Date(selectedImage.completed_at).toLocaleDateString() : 'Pending'} />
                    </div>
                  </div>
                </div>

                <AuditHistoryPanel
                  events={auditEvents}
                  isOpen={historyOpen}
                  onToggle={() => setHistoryOpen((value) => !value)}
                  maxHeight={360}
                />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function AnnotationOverlay({
  image,
  annotations,
  classColorById,
}: {
  image: ImageType
  annotations: Annotation[]
  classColorById: Map<string, string>
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {annotations.map((annotation) => {
        const color = classColorById.get(annotation.class_id) || '#2563eb'
        const coordinates = annotation.coordinates || {}

        if (['polygon', 'polyline', 'points', 'skeleton', 'mask'].includes(annotation.type)) {
          const points = Array.isArray(coordinates.points) ? coordinates.points : []
          if (!points.length) return null
          const pointString = points
            .map((point: [number, number]) => `${(point[0] / image.width) * 100},${(point[1] / image.height) * 100}`)
            .join(' ')
          const firstPoint = points[0]

          return (
            <svg key={annotation.id} className="absolute inset-0 h-full w-full overflow-visible">
              {annotation.type === 'points' ? (
                points.map((point: [number, number], index: number) => (
                  <circle
                    key={index}
                    cx={`${(point[0] / image.width) * 100}%`}
                    cy={`${(point[1] / image.height) * 100}%`}
                    r="5"
                    fill={color}
                    stroke="white"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              ) : annotation.type === 'polygon' ? (
                <polygon
                  points={pointString}
                  fill={`${color}22`}
                  stroke={color}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <polyline
                  points={pointString}
                  fill="none"
                  stroke={color}
                  strokeWidth={annotation.type === 'mask' ? coordinates.brushSize || 18 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={annotation.type === 'mask' ? 0.45 : 1}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <text
                x={`${(firstPoint[0] / image.width) * 100}%`}
                y={`${(firstPoint[1] / image.height) * 100}%`}
                dy="-8"
                fill="white"
                stroke={color}
                strokeWidth="4"
                paintOrder="stroke"
                className="text-[10px] font-bold"
              >
                {annotation.class_name}
              </text>
            </svg>
          )
        }

        if (!['bbox', 'ellipse', 'cuboid'].includes(annotation.type)) return null

        return (
          <div
            key={annotation.id}
            className={cn(
              'absolute border-2 shadow-sm',
              annotation.type === 'ellipse' && 'rounded-full'
            )}
            style={{
              left: `${((coordinates.x || 0) / image.width) * 100}%`,
              top: `${((coordinates.y || 0) / image.height) * 100}%`,
              width: `${((coordinates.width || 0) / image.width) * 100}%`,
              height: `${((coordinates.height || 0) / image.height) * 100}%`,
              borderColor: color,
              backgroundColor: `${color}16`,
            }}
          >
            <span
              className="absolute -top-7 left-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold text-white shadow"
              style={{ backgroundColor: color }}
            >
              {annotation.class_name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
