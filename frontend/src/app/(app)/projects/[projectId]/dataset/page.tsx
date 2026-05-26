'use client'

import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { useImages, useBatchUpdateSplit, useBatchDeleteImages } from '@/hooks/useImages'
import { AssignmentStatus, Image as ImageType, ImageSplit, ImageStatus } from '@/types'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuth } from '@/hooks/useAuth'
import { apiGet } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import CreateVersionModal from '@/components/dataset/CreateVersionModal'
import AutoModelControl from '@/components/training/AutoModelControl'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
  CheckCircle2,
  Clock,
  ChevronDown,
  Check,
  X,
  ImageIcon,
  Search,
  GitBranch,
  PackagePlus
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'

const ImageDetailModal = dynamic(() => import('@/components/image/ImageDetailModal'))

type PaginationItem = number | 'ellipsis'

const DATASET_PAGE_SIZE = 50
const SELECT_ALL_PAGE_SIZE = 500

interface ImagesResponse {
  images: ImageType[]
  total: number
  page: number
  pages: number
}

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items = new Set<number>([
    1,
    2,
    3,
    totalPages - 1,
    totalPages,
    currentPage,
  ])

  if (currentPage > 4 && currentPage < totalPages - 2) {
    items.add(currentPage - 1)
    items.add(currentPage + 1)
  }

  const sortedPages = Array.from(items).sort((a, b) => a - b)
  const paginationItems: PaginationItem[] = []

  sortedPages.forEach((pageNumber, index) => {
    const previousPage = sortedPages[index - 1]
    if (previousPage && pageNumber - previousPage > 1) {
      paginationItems.push('ellipsis')
    }
    paginationItems.push(pageNumber)
  })

  return paginationItems
}

export default function DatasetPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const router = useRouter()

  // State
  const [page, setPage] = useState(1)
  const [split, setSplit] = useState<ImageSplit | undefined>(undefined)
  const [status, setStatus] = useState<ImageStatus | undefined>(undefined)
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentStatus | undefined>(undefined)
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined)
  const [classId, setClassId] = useState<string | undefined>(undefined)
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [selectedImageDetail, setSelectedImageDetail] = useState<ImageType | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateVersionModal, setShowCreateVersionModal] = useState(false)
  const [batchSplitDropdown, setBatchSplitDropdown] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [isSelectingAllImages, setIsSelectingAllImages] = useState(false)

  // Project Data & Permissions
  const { project } = useProject(projectId)
  const { user } = useAuth()
  const { canAnnotate, canUpload, canDelete, canReview, role } = usePermissions(project)
  const canSelectImages = canAnnotate || canDelete

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  // Hooks
  const { images, total, pages, isLoading, refetch } = useImages(
    projectId,
    split,
    status,
    page,
    DATASET_PAGE_SIZE,
    debouncedSearch,
    myTasksOnly ? user?.id : assigneeId,
    assignmentStatus,
    classId,
    createdFrom ? new Date(createdFrom).toISOString() : undefined,
    createdTo ? new Date(createdTo).toISOString() : undefined
  )
  const { mutate: batchUpdateSplit, isLoading: isUpdatingBatch } = useBatchUpdateSplit()
  const { mutate: batchDeleteImages, isLoading: isDeletingBatch } = useBatchDeleteImages()
  const visibleImageIds = images.map((image) => image.id)
  const firstVisibleImage = total === 0 ? 0 : (page - 1) * DATASET_PAGE_SIZE + 1
  const lastVisibleImage = Math.min(page * DATASET_PAGE_SIZE, total)
  const paginationItems = getPaginationItems(page, pages)
  const activeFilterCount = [
    split,
    status,
    assignmentStatus,
    assigneeId,
    classId,
    createdFrom,
    createdTo,
    debouncedSearch,
    myTasksOnly ? 'my-tasks' : undefined,
  ].filter(Boolean).length

  // Handlers
  const handleSelectImage = (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canSelectImages) return
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

  const getImageQueryParams = (queryPage: number, limit: number) => {
    const params: Record<string, string | number> = {
      project_id: projectId,
      page: queryPage,
      limit,
    }

    if (split) params.split = split
    if (status) params.status = status
    if (debouncedSearch) params.search = debouncedSearch
    const effectiveAssigneeId = myTasksOnly ? user?.id : assigneeId
    if (effectiveAssigneeId) params.assigned_to_user_id = effectiveAssigneeId
    if (assignmentStatus) params.assignment_status = assignmentStatus
    if (classId) params.class_id = classId
    if (createdFrom) params.created_from = new Date(createdFrom).toISOString()
    if (createdTo) params.created_to = new Date(createdTo).toISOString()

    return params
  }

  const handleSelectVisibleImages = async () => {
    if (!canSelectImages || visibleImageIds.length === 0) return

    setSelectedImages((current) => {
      const next = new Set(current)
      const isCurrentPageSelected = visibleImageIds.every((imageId) => next.has(imageId))

      visibleImageIds.forEach((imageId) => {
        if (isCurrentPageSelected) {
          next.delete(imageId)
        } else {
          next.add(imageId)
        }
      })

      return next
    })
  }

  const handleSelectAllMatchingImages = async () => {
    if (!canSelectImages || total === 0 || isSelectingAllImages) return

    setIsSelectingAllImages(true)
    try {
      const firstPage = await apiGet<ImagesResponse>('/images', getImageQueryParams(1, SELECT_ALL_PAGE_SIZE))
      const allImageIds = firstPage.images.map((image) => image.id)

      for (let nextPage = 2; nextPage <= firstPage.pages; nextPage += 1) {
        const data = await apiGet<ImagesResponse>('/images', getImageQueryParams(nextPage, SELECT_ALL_PAGE_SIZE))
        allImageIds.push(...data.images.map((image) => image.id))
      }

      setSelectedImages((current) => {
        const next = new Set(current)
        const isEveryMatchingImageSelected = allImageIds.length > 0 && allImageIds.every((imageId) => next.has(imageId))

        allImageIds.forEach((imageId) => {
          if (isEveryMatchingImageSelected) {
            next.delete(imageId)
          } else {
            next.add(imageId)
          }
        })

        return next
      })
    } finally {
      setIsSelectingAllImages(false)
    }
  }

  const handleBatchSplit = async (newSplit: ImageSplit) => {
    if (!canAnnotate) return
    const imageIds = Array.from(selectedImages)
    await batchUpdateSplit(imageIds, newSplit)
    setSelectedImages(new Set())
    setBatchSplitDropdown(false)
    await refetch()
  }

  const handleBatchDelete = async () => {
    if (!canDelete) return
    if (!window.confirm(`Delete ${selectedImages.size} images?`)) return

    const imageIds = Array.from(selectedImages)
    await batchDeleteImages(imageIds)
    setSelectedImages(new Set())
    await refetch()
  }

  const handleImageClick = (image: ImageType) => {
    setSelectedImageDetail(image)
    setShowDetailModal(true)
  }

  const goToUpload = () => {
    if (!projectId) return
    router.push(`/projects/${projectId}/upload`)
  }

  const goToVersions = () => {
    if (!projectId) return
    router.push(`/projects/${projectId}/dataset/versions`)
  }

  const clearFilters = () => {
    setSplit(undefined)
    setStatus(undefined)
    setAssignmentStatus(undefined)
    setAssigneeId(undefined)
    setClassId(undefined)
    setCreatedFrom('')
    setCreatedTo('')
    setSearch('')
    setDebouncedSearch('')
    setMyTasksOnly(false)
    setPage(1)
  }

  const handleVersionCreated = () => {
    setShowCreateVersionModal(false)
    goToVersions()
  }

  return (
    <div className="page-shell">
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <SectionLabel label="Dataset" className="mb-3" />
            <h1 className="break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
              Images
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border bg-background px-2.5 py-1 font-medium">
                {total} total
              </span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 font-medium">
                {images.length} on this page
              </span>
              {activeFilterCount > 0 && (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 font-medium text-accent">
                  {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
                </span>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
            <Button
              variant="secondary"
              onClick={goToVersions}
              className="h-11 w-full lg:w-auto"
            >
              <GitBranch className="h-4 w-4" />
              View Versions
            </Button>
            {canAnnotate && (
              <Button
                onClick={() => setShowCreateVersionModal(true)}
                className="h-11 w-full lg:w-auto"
              >
                <PackagePlus className="h-4 w-4" />
                Create Version
              </Button>
            )}
            {canUpload && (
              <Button onClick={goToUpload} className="h-11 w-full lg:w-auto">
                Import Images
              </Button>
            )}
          </div>
        </div>
      </div>

      {canAnnotate && (
        <div className="mb-6">
          <AutoModelControl
            projectId={projectId}
            projectType={project?.type}
            imageIds={selectedImages.size > 0 ? Array.from(selectedImages) : undefined}
            onComplete={async () => {
              setSelectedImages(new Set())
              await refetch()
            }}
          />
        </div>
      )}

      <div className="relative z-20 mb-6 overflow-visible rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xl">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search images by filename..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
              />
            </div>

            <div className="w-full min-w-0 xl:w-auto xl:shrink-0">
              <AnimatePresence>
                {canSelectImages ? (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={cn(
                      "flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border px-2 py-2 sm:w-auto xl:flex-nowrap",
                      selectedImages.size > 0
                        ? "border-accent/20 bg-accent/[0.04]"
                        : "border-border bg-muted/30"
                    )}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSelectVisibleImages}
                      disabled={isLoading || visibleImageIds.length === 0}
                      className="h-9 whitespace-nowrap rounded-lg px-3 text-foreground hover:bg-accent/10 hover:text-accent"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Select page ({images.length})
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSelectAllMatchingImages}
                      disabled={isLoading || isSelectingAllImages || total === 0}
                      className="h-9 whitespace-nowrap rounded-lg border-accent/25 bg-card px-3 text-accent hover:border-accent/50 hover:bg-accent/5"
                    >
                      {isSelectingAllImages ? (
                        <Clock className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Select all {total}
                    </Button>

                    {selectedImages.size > 0 ? (
                      <>
                        <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-foreground">
                          {selectedImages.size} selected
                        </span>

                        <div className="hidden h-5 w-px bg-accent/20 sm:block" />

                        {canAnnotate && (
                          <div className="relative shrink-0">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setBatchSplitDropdown(!batchSplitDropdown)}
                              disabled={isUpdatingBatch}
                              className="h-9 whitespace-nowrap rounded-lg border-accent/25 bg-card px-3 text-accent hover:border-accent/50 hover:bg-accent/5"
                            >
                              Assign Split
                              <ChevronDown className={cn("h-4 w-4 transition-transform", batchSplitDropdown && "rotate-180")} />
                            </Button>

                            {batchSplitDropdown && (
                              <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-border bg-card py-2 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                                {(['train', 'valid', 'test', 'unassigned'] as const).map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => handleBatchSplit(s)}
                                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                                  >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                    {split === s && <Check className="h-3.5 w-3.5 text-accent" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {canDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleBatchDelete}
                            disabled={isDeletingBatch}
                            className="h-9 whitespace-nowrap rounded-xl px-3 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedImages(new Set())}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Clear selection"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <span className="px-2 text-sm text-muted-foreground">
                        Showing {images.length} of {total}
                      </span>
                    )}
                  </motion.div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    Showing {images.length} of {total} images
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>

            <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible xl:pb-0">
            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={split || ''}
                onChange={(e) => {
                  setSplit(e.target.value as ImageSplit | undefined)
                  setPage(1)
                }}
                className="min-w-24 cursor-pointer border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              >
                <option value="">All Splits</option>
                <option value="train">Train</option>
                <option value="valid">Valid</option>
                <option value="test">Test</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <select
                value={status || ''}
                onChange={(e) => {
                  setStatus(e.target.value as ImageStatus | undefined)
                  setPage(1)
                }}
                className="min-w-28 cursor-pointer border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              >
                <option value="">All Status</option>
                <option value="annotated">Annotated</option>
                <option value="unannotated">Unannotated</option>
                <option value="needs_review">Needs review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <select
                value={assignmentStatus || ''}
                onChange={(e) => {
                  setAssignmentStatus(e.target.value as AssignmentStatus || undefined)
                  setPage(1)
                }}
                className="min-w-24 cursor-pointer border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              >
                <option value="">All Work</option>
                <option value="unassigned">Unassigned</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <select
                value={classId || ''}
                onChange={(e) => {
                  setClassId(e.target.value || undefined)
                  setPage(1)
                }}
                className="min-w-28 cursor-pointer border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              >
                <option value="">All Classes</option>
                {(project?.class_labels || []).map((label) => (
                  <option key={label.id} value={label.id}>{label.name}</option>
                ))}
              </select>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <select
                value={assigneeId || ''}
                onChange={(e) => {
                  setAssigneeId(e.target.value || undefined)
                  setMyTasksOnly(false)
                  setPage(1)
                }}
                className="min-w-32 cursor-pointer border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
              >
                <option value="">All Assignees</option>
                {(project?.members || []).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email || member.user_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <span className="text-xs font-semibold text-muted-foreground">From</span>
              <input
                type="date"
                value={createdFrom}
                onChange={(event) => {
                  setCreatedFrom(event.target.value)
                  setPage(1)
                }}
                className="h-8 border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
                aria-label="Created from"
              />
            </div>

            <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 transition-colors focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
              <span className="text-xs font-semibold text-muted-foreground">To</span>
              <input
                type="date"
                value={createdTo}
                onChange={(event) => {
                  setCreatedTo(event.target.value)
                  setPage(1)
                }}
                className="h-8 border-none bg-transparent text-sm font-medium text-foreground outline-none focus:ring-0"
                aria-label="Created to"
              />
            </div>

            {(role === 'annotator' || role === 'admin') && (
              <button
                type="button"
                onClick={() => {
                  setMyTasksOnly((value) => !value)
                  setPage(1)
                }}
                className={cn(
                  'h-10 shrink-0 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-colors',
                  myTasksOnly
                    ? 'bg-accent text-white border-accent'
                    : 'bg-background text-foreground border-border hover:border-accent/30 hover:bg-muted/40'
                )}
              >
                My Tasks
              </button>
            )}

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 shrink-0 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-muted-foreground transition hover:border-accent/30 hover:bg-muted/40 hover:text-foreground"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl border border-border bg-muted" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-background">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">No images found</h2>
          <p className="mx-auto mb-7 max-w-sm text-sm text-muted-foreground">
            Upload images to this project to start your computer vision workflow.
          </p>
          {canUpload ? (
            <Button onClick={goToUpload} className="h-11 px-6">
              Go to Upload
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              You need upload permission to add images to this project.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {images.map((image) => {
              const isSelected = selectedImages.has(image.id)
              return (
                <motion.div
                  key={image.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -2 }}
                  onClick={() => handleImageClick(image)}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition duration-200 hover:border-accent/40 hover:shadow-md",
                    isSelected ? "border-accent ring-2 ring-accent/20" : "border-border"
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

                    <div className="absolute left-2 top-2 flex gap-2">
                      <div className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                        {image.split === 'unassigned' ? '?' : image.split}
                      </div>
                    </div>

                    <div className="absolute right-2 top-2">
                      <div className={cn(
                        "h-3 w-3 rounded-full border-2 border-white shadow-sm",
                        image.status === 'approved' ? "bg-emerald-500" :
                          image.status === 'needs_review' ? "bg-amber-400" :
                            image.status === 'rejected' ? "bg-red-500" :
                              image.status === 'annotated' ? "bg-blue-500" : "bg-slate-400"
                      )} />
                    </div>

                    {canSelectImages && (
                      <div
                        onClick={(e) => handleSelectImage(image.id, e)}
                        className={cn(
                          "absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg transition duration-200",
                          isSelected
                            ? "bg-accent text-white"
                            : "bg-white/90 text-foreground opacity-0 backdrop-blur-sm group-hover:opacity-100"
                        )}
                      >
                        {isSelected ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-5 w-5 rounded-full border-2 border-slate-300" />}
                      </div>
                    )}
                  </div>

                  <div className="bg-card p-3">
                    <p className="mb-1 truncate text-xs font-semibold text-foreground">
                      {image.original_filename}
                    </p>
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        {new Date(image.created_at).toLocaleDateString()}
                      </div>
                      <div className="truncate text-[10px] font-mono text-muted-foreground">
                        {image.status.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="mt-12 border-t border-border pt-8">
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Showing {firstVisibleImage}-{lastVisibleImage} of {total} images
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Page {page} of {pages}
                  </p>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-10 shrink-0 px-3 sm:px-4"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>

                  <div className="flex items-center gap-1 rounded-xl bg-muted/40 p-1">
                    {paginationItems.map((item, index) => (
                      item === 'ellipsis' ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center text-sm text-muted-foreground"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setPage(item)}
                          aria-current={page === item ? 'page' : undefined}
                          className={cn(
                            'h-9 min-w-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors focus-ring',
                            page === item
                              ? 'bg-accent text-accent-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-card hover:text-foreground'
                          )}
                        >
                          {item}
                        </button>
                      )
                    ))}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="h-10 shrink-0 px-3 sm:px-4"
                    aria-label="Next page"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4 sm:ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Image Detail Modal */}
      {showDetailModal ? (
        <ImageDetailModal
          image={selectedImageDetail}
          projectId={projectId}
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          onDeleted={() => refetch()}
          onUpdated={(updatedImage) => {
            setSelectedImageDetail(updatedImage)
            refetch()
          }}
          canEditSplit={canAnnotate}
          canDelete={canDelete}
          canReview={canReview}
        />
      ) : null}

      {showCreateVersionModal && canAnnotate ? (
        <CreateVersionModal
          projectId={projectId}
          onClose={() => setShowCreateVersionModal(false)}
          onSuccess={handleVersionCreated}
        />
      ) : null}
    </div>
  )
}
