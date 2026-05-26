'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { apiGet } from '@/lib/api'
import { Image, ClassLabel, Annotation, ImageSplit } from '@/types'
import AnnotateCanvas from '@/components/annotation/AnnotateCanvas'
import ImageThumbnailStrip from '@/components/annotation/ImageThumbnailStrip'
import AnnotationPanel from '@/components/annotation/AnnotationPanel'
import ClassificationAnnotator from '@/components/annotation/ClassificationAnnotator'
import AutoModelControl from '@/components/training/AutoModelControl'
import { useAnnotations, useSaveAnnotations, useAnnotationHistory } from '@/hooks/useAnnotations'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import { useUpdateAssignment } from '@/hooks/useAssignments'
import { useUpdateImageSplit } from '@/hooks/useImages'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ImagesResponse {
  images: Image[]
  total: number
  page: number
  pages: number
}

const ANNOTATE_PAGE_SIZE = 500

function dedupeImagesById(images: Image[]) {
  const seen = new Set<string>()
  return images.filter((image) => {
    if (seen.has(image.id)) return false
    seen.add(image.id)
    return true
  })
}

export default function AnnotatePage() {
  const params = useParams<{ projectId: string }>()
  const searchParams = useSearchParams()
  const projectId = params?.projectId || ''
  const initialImageId = searchParams?.get('image')

  const [images, setImages] = useState<Image[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imagesLoading, setImagesLoading] = useState(true)
  const [classLabels, setClassLabels] = useState<ClassLabel[]>([])
  const [filter, setFilter] = useState<'all' | 'unannotated'>('all')
  const [activeClassId, setActiveClassId] = useState<string | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [selectedSplit, setSelectedSplit] = useState<ImageSplit>('train')
  const [history, setHistory] = useState<Annotation[][]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const { currentImage } = useMemo(() => ({ currentImage: images[currentImageIndex] }), [images, currentImageIndex])
  const { annotations, fetchAnnotations, setAnnotations } = useAnnotations(currentImage?.id || '')
  const { saveAnnotations, isLoading: isSaving } = useSaveAnnotations(currentImage?.id || '')
  const { events: historyEvents, fetchHistory } = useAnnotationHistory(currentImage?.id || '')
  const { mutate: updateAssignment, isLoading: isMarkingDone } = useUpdateAssignment()
  const { mutate: updateImageSplit, isLoading: isUpdatingSplit } = useUpdateImageSplit()

  const { project } = useProject(projectId)
  const { canAnnotate } = usePermissions(project)
  const isReadOnly = !canAnnotate
  const isClassificationProject = project?.type === 'classification'

  // Undo/Redo logic
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1]
      setHistoryIndex(historyIndex - 1)
      setAnnotations(prev)
    }
  }, [history, historyIndex, setAnnotations])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1]
      setHistoryIndex(historyIndex + 1)
      setAnnotations(next)
    }
  }, [history, historyIndex, setAnnotations])

  const addToHistory = useCallback((nextAnnotations: Annotation[]) => {
    const nextHistory = history.slice(0, historyIndex + 1)
    nextHistory.push([...nextAnnotations])
    if (nextHistory.length > 50) nextHistory.shift()
    setHistory(nextHistory)
    setHistoryIndex(nextHistory.length - 1)
  }, [history, historyIndex])

  const fetchClassLabels = useCallback(async (newClassId?: string) => {
    try {
      const response = await apiGet<any>(`/projects/${projectId}`)
      setClassLabels(response.class_labels || [])
      if (newClassId) {
        setActiveClassId(newClassId)
      } else {
        setActiveClassId((current) => current || response.class_labels?.[0]?.id || null)
      }
    } catch (error) {
      console.error('Failed to fetch class labels:', error)
    }
  }, [projectId])

  useEffect(() => {
    const fetchImages = async () => {
      setImagesLoading(true)
      try {
        const queryParams = {
          project_id: projectId,
          limit: ANNOTATE_PAGE_SIZE,
          page: 1,
          ...(filter !== 'all' && { status: filter === 'unannotated' ? 'unannotated' : '' }),
        }
        const firstPage = await apiGet<ImagesResponse>('/images', queryParams)
        const fetchedImages = [...(firstPage.images || [])]

        for (let nextPage = 2; nextPage <= firstPage.pages; nextPage += 1) {
          const response = await apiGet<ImagesResponse>('/images', {
            ...queryParams,
            page: nextPage,
          })
          fetchedImages.push(...(response.images || []))
        }

        const uniqueImages = dedupeImagesById(fetchedImages)
        setImages(uniqueImages)
        
        // If initialImageId is provided, find its index
        if (initialImageId && uniqueImages.length > 0) {
          const index = uniqueImages.findIndex((img: Image) => img.id === initialImageId)
          if (index !== -1) {
            setCurrentImageIndex(index)
          }
        } else {
          setCurrentImageIndex((index) => Math.min(index, Math.max(uniqueImages.length - 1, 0)))
        }
      } catch (error) {
        console.error('Failed to fetch images:', error)
      } finally {
        setImagesLoading(false)
      }
    }
    fetchImages()
  }, [projectId, filter, initialImageId])

  useEffect(() => {
    fetchClassLabels()
  }, [fetchClassLabels])

  useEffect(() => {
    if (currentImage?.id) {
      setSelectedSplit(
        currentImage.split === 'valid' || currentImage.split === 'test' || currentImage.split === 'train'
          ? currentImage.split
          : 'train'
      )
      fetchAnnotations()
      fetchHistory()
      setSelectedAnnotationId(null)
      setHistory([])
      setHistoryIndex(-1)
    }
    // This effect intentionally follows image changes only; split changes are user edits saved separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentImage?.id, fetchAnnotations, fetchHistory])

  const saveCurrentImageSplit = useCallback(async () => {
    if (!currentImage?.id) return
    const nextSplit = selectedSplit || 'train'
    if (currentImage.split === nextSplit) return

    const updatedImage = await updateImageSplit(currentImage.id, nextSplit)
    if (updatedImage) {
      setImages((current) => current.map((image) => (
        image.id === updatedImage.id ? updatedImage : image
      )))
    }
  }, [currentImage, selectedSplit, updateImageSplit])

  useEffect(() => {
    if (annotations.length > 0 && historyIndex === -1) {
      setHistory([[...annotations]])
      setHistoryIndex(0)
    }
  }, [annotations, historyIndex])

  useEffect(() => {
    if (!activeClassId && classLabels.length > 0) {
      setActiveClassId(classLabels[0].id)
    }
  }, [activeClassId, classLabels])

  const handleSave = useCallback(async () => {
    if (isReadOnly) return
    try {
      await saveCurrentImageSplit()
      await saveAnnotations(annotations)
      if (currentImageIndex < images.length - 1) {
        setCurrentImageIndex((index) => index + 1)
      } else {
        await fetchAnnotations()
        await fetchHistory()
      }
    } catch (error) {
      console.error('Failed to save annotations:', error)
    }
  }, [annotations, currentImageIndex, fetchAnnotations, fetchHistory, images.length, isReadOnly, saveAnnotations, saveCurrentImageSplit])

  const handleMarkDone = useCallback(async () => {
    if (isReadOnly) return
    if (!currentImage?.id) return
    await saveCurrentImageSplit()
    await saveAnnotations(annotations)
    await updateAssignment(currentImage.id, { assignment_status: 'done' })
    setImages((current) => current.map((image) => (
      image.id === currentImage.id
        ? { ...image, assignment_status: 'done', completed_at: new Date().toISOString() }
        : image
    )))
    await fetchAnnotations()
  }, [annotations, currentImage, fetchAnnotations, isReadOnly, saveAnnotations, saveCurrentImageSplit, updateAssignment])

  const handlePrevImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1)
    }
  }, [currentImageIndex])

  const handleNextImage = useCallback(() => {
    if (currentImageIndex < images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1)
    }
  }, [currentImageIndex, images.length])

  const handleAnnotationsChange = useCallback((nextAnnotations: Annotation[]) => {
    setAnnotations(nextAnnotations)
    addToHistory(nextAnnotations)
    if (selectedAnnotationId && !nextAnnotations.some(a => a.id === selectedAnnotationId)) {
      setSelectedAnnotationId(null)
    }
  }, [selectedAnnotationId, setAnnotations, addToHistory])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'ArrowLeft') handlePrevImage()
    else if (e.key === 'ArrowRight') handleNextImage()
    else if (!isReadOnly && (e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
      handleAnnotationsChange(annotations.filter(a => a.id !== selectedAnnotationId))
    } else if (!isReadOnly && (e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if (!isReadOnly && (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault()
      redo()
    } else if (!isReadOnly && (e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }, [handlePrevImage, handleNextImage, isReadOnly, selectedAnnotationId, annotations, handleAnnotationsChange, undo, redo, handleSave])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Resizable Sidebars state (for persistence/re-renders)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(208) // Default 208px
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320) // Default 320px

  // Refs to track drag values without triggering React renders
  const leftWidthRef = useRef(208)
  const rightWidthRef = useRef(320)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)

  // Synchronize ref values on initial load
  useEffect(() => {
    leftWidthRef.current = leftSidebarWidth
    rightWidthRef.current = rightSidebarWidth
  }, [leftSidebarWidth, rightSidebarWidth])

  const startResizingLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingLeft(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  const startResizingRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingRight(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizingLeft((wasResizing) => {
      if (wasResizing) {
        setLeftSidebarWidth(leftWidthRef.current)
      }
      return false
    })
    setIsResizingRight((wasResizing) => {
      if (wasResizing) {
        setRightSidebarWidth(rightWidthRef.current)
      }
      return false
    })
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const resize = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()

    if (isResizingLeft) {
      const localX = e.clientX - containerRect.left
      const newWidth = Math.max(160, Math.min(380, localX))
      leftWidthRef.current = newWidth
      containerRef.current.style.setProperty('--left-width', `${newWidth}px`)
    } else if (isResizingRight) {
      const localX = containerRect.right - e.clientX
      const newWidth = Math.max(240, Math.min(480, localX))
      rightWidthRef.current = newWidth
      containerRef.current.style.setProperty('--right-width', `${newWidth}px`)
    }
  }, [isResizingLeft, isResizingRight])

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', resize)
      window.addEventListener('mouseup', stopResizing)
    }
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [isResizingLeft, isResizingRight, resize, stopResizing])

  if (imagesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Initialising Editor...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      style={{
        '--left-width': `${leftSidebarWidth}px`,
        '--right-width': `${rightSidebarWidth}px`,
      } as React.CSSProperties}
      className={cn(
        "flex h-full overflow-hidden bg-background",
        (isResizingLeft || isResizingRight) && "select-none cursor-col-resize"
      )}
    >
      <motion.div 
        initial={{ opacity: 0, x: -20 }} 
        animate={{ opacity: 1, x: 0 }} 
        className="flex-shrink-0" 
        style={{ width: 'var(--left-width)' }}
      >
        <ImageThumbnailStrip
          images={images}
          currentImageIndex={currentImageIndex}
          onSelectImage={setCurrentImageIndex}
          annotations={annotations}
          filter={filter}
          onFilterChange={setFilter}
          width="var(--left-width)"
        />
      </motion.div>

      {/* Left Resizer Drag-Handle */}
      <div
        onMouseDown={startResizingLeft}
        className={cn(
          "w-1 cursor-col-resize hover:bg-accent/40 transition-colors z-30 select-none flex-shrink-0 relative",
          isResizingLeft ? "bg-accent" : "bg-border"
        )}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!isReadOnly && (
          <div className="border-b border-border bg-card/70 px-4 py-2 backdrop-blur-md">
            <AutoModelControl
              projectId={projectId}
              projectType={project?.type}
              imageIds={currentImage?.id ? [currentImage.id] : undefined}
              disabled={!currentImage?.id}
              compact
              onComplete={async () => {
                await fetchAnnotations()
                await fetchHistory()
                await fetchClassLabels()
              }}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {isClassificationProject ? (
            <ClassificationAnnotator
              image={currentImage}
              annotations={annotations}
              classLabels={classLabels}
              readOnly={isReadOnly}
              selectedSplit={selectedSplit}
              onSplitChange={setSelectedSplit}
              onAnnotationsChange={handleAnnotationsChange}
              onSave={handleSave}
              onMarkDone={!isReadOnly && currentImage?.assigned_to_user_id ? handleMarkDone : undefined}
              onPrevImage={handlePrevImage}
              onNextImage={handleNextImage}
              canGoPrev={currentImageIndex > 0}
              canGoNext={currentImageIndex < images.length - 1}
              isSaving={isSaving}
              isUpdatingSplit={isUpdatingSplit}
              isMarkingDone={isMarkingDone}
            />
          ) : (
            <>
              <AnnotateCanvas
                image={currentImage}
                annotations={annotations}
                classLabels={classLabels}
                activeClassId={activeClassId}
                selectedAnnotationId={selectedAnnotationId}
                onActiveClassRequired={() => {
                  if (!activeClassId && classLabels[0]) setActiveClassId(classLabels[0].id)
                }}
                onSelectAnnotation={setSelectedAnnotationId}
                onAnnotationsChange={handleAnnotationsChange}
                onPrevImage={handlePrevImage}
                onNextImage={handleNextImage}
                onUndo={undo}
                onRedo={redo}
                canGoPrev={currentImageIndex > 0}
                canGoNext={currentImageIndex < images.length - 1}
                readOnly={isReadOnly}
              />

              {/* Right Resizer Drag-Handle */}
              <div
                onMouseDown={startResizingRight}
                className={cn(
                  "w-1 cursor-col-resize hover:bg-accent/40 transition-colors z-30 select-none flex-shrink-0 relative",
                  isResizingRight ? "bg-accent" : "bg-border"
                )}
              >
                <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
              </div>

              <motion.div 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                className="flex-shrink-0" 
                style={{ width: 'var(--right-width)' }}
              >
                <AnnotationPanel
                  classLabels={classLabels}
                  annotations={annotations}
                  activeClassId={activeClassId}
                  selectedAnnotationId={selectedAnnotationId}
                  onActiveClassChange={setActiveClassId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  onAnnotationsChange={handleAnnotationsChange}
                  onSave={handleSave}
                  onMarkDone={!isReadOnly && currentImage?.assigned_to_user_id ? handleMarkDone : undefined}
                  selectedSplit={selectedSplit}
                  onSplitChange={setSelectedSplit}
                  isSaving={isSaving}
                  isUpdatingSplit={isUpdatingSplit}
                  isMarkingDone={isMarkingDone}
                  projectId={projectId}
                  onClassCreated={fetchClassLabels}
                  readOnly={isReadOnly}
                  width="var(--right-width)"
                  auditEvents={historyEvents}
                />
              </motion.div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
