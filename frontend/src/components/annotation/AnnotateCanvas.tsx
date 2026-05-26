'use client'

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Annotation, ClassLabel, Image as ImageType } from '@/types'
import {
  MousePointer2,
  Box,
  Pentagon,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { motion } from 'framer-motion'

interface AnnotateCanvasProps {
  image: ImageType | undefined
  annotations: Annotation[]
  classLabels: ClassLabel[]
  activeClassId: string | null
  selectedAnnotationId: string | null
  onActiveClassRequired: () => void
  onSelectAnnotation: (annotationId: string | null) => void
  onAnnotationsChange: (annotations: Annotation[]) => void
  onPrevImage: () => void
  onNextImage: () => void
  onUndo?: () => void
  onRedo?: () => void
  canGoPrev: boolean
  canGoNext: boolean
  readOnly?: boolean
}

interface DraftBox {
  x: number
  y: number
  width: number
  height: number
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'
type CanvasTool =
  | 'select'
  | 'bbox'
  | 'polygon'
  | 'polyline'
  | 'points'
  | 'ellipse'
  | 'cuboid'
  | 'mask'
  | 'skeleton'
  | 'tag'

interface InteractionState {
  mode: 'draw' | 'move' | 'resize' | 'move-points' | 'move-point'
  annotationId?: string
  handle?: ResizeHandle
  pointIndex?: number
  pointerOffsetX?: number
  pointerOffsetY?: number
}

function isDraftBox(value: Record<string, any>): value is DraftBox {
  return (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  )
}

function getPointList(value: Record<string, any>): Array<[number, number]> {
  return Array.isArray(value.points) ? value.points : []
}

export default function AnnotateCanvas({
  image,
  annotations,
  classLabels,
  activeClassId,
  selectedAnnotationId,
  onActiveClassRequired,
  onSelectAnnotation,
  onAnnotationsChange,
  onPrevImage,
  onNextImage,
  onUndo,
  onRedo,
  canGoPrev,
  canGoNext,
  readOnly = false,
}: AnnotateCanvasProps) {
  const [tool, setTool] = useState<CanvasTool>('select')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null)
  const [draftPolygon, setDraftPolygon] = useState<Array<{ x: number; y: number }>>([])
  const [draftMask, setDraftMask] = useState<Array<{ x: number; y: number }>>([])
  const [isBrushing, setIsBrushing] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [interaction, setInteraction] = useState<InteractionState | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const activeClass = useMemo(
    () => classLabels.find((label) => label.id === activeClassId) || null,
    [activeClassId, classLabels]
  )

  // Reset state when image changes
  useEffect(() => {
    setDraftBox(null)
    setDraftPolygon([])
    setDraftMask([])
    setIsBrushing(false)
    setDragStart(null)
    setInteraction(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    onSelectAnnotation(null)
  }, [image?.id, onSelectAnnotation])

  // Automatically switch to drawing tool when a class is activated
  useEffect(() => {
    if (activeClassId && tool === 'select') {
      setTool('bbox')
    }
  }, [activeClassId, tool])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      if (e.code === 'Space') {
        setIsSpacePressed(true)
        if (tool !== 'select') setTool('select')
      } else if (e.key.toLowerCase() === 'v') {
        setTool('select')
      } else if (e.key.toLowerCase() === 'b') {
        setTool('bbox')
      } else if (e.key.toLowerCase() === 'p') {
        setTool('polygon')
      } else if (e.key.toLowerCase() === 'l') {
        setTool('polyline')
      } else if (e.key.toLowerCase() === 'o') {
        setTool('points')
      } else if (e.key.toLowerCase() === 'e') {
        setTool('ellipse')
      } else if (e.key.toLowerCase() === 'c') {
        setTool('cuboid')
      } else if (e.key.toLowerCase() === 'm') {
        setTool('mask')
      } else if (e.key.toLowerCase() === 'k') {
        setTool('skeleton')
      } else if (e.key.toLowerCase() === 't') {
        setTool('tag')
      } else if (e.key === 'Escape') {
        setDraftPolygon([])
        setDraftMask([])
        setDraftBox(null)
        setInteraction(null)
      } else if (e.key === 'Enter' && draftPolygon.length >= 3) {
        e.preventDefault()
        finishPointShape()
      } else if (e.key === '=' || e.key === '+') {
        setZoom(prev => Math.min(5, prev + 0.2))
      } else if (e.key === '-' || e.key === '_') {
        setZoom(prev => Math.max(0.2, prev - 0.2))
      } else if (e.key === '0') {
        setZoom(1)
        setOffset({ x: 0, y: 0 })
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  // finishPointShape is declared below and intentionally captured by the key handler.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, draftPolygon])

  const clampBox = useCallback((box: DraftBox) => {
    if (!image) return box

    const x = Math.max(0, Math.min(box.x, image.width))
    const y = Math.max(0, Math.min(box.y, image.height))
    const width = Math.max(0, Math.min(box.width, image.width - x))
    const height = Math.max(0, Math.min(box.height, image.height - y))

    return { x, y, width, height }
  }, [image])

  const getRelativeCoordinates = useCallback((clientX: number, clientY: number) => {
    const img = imageRef.current
    if (!img || !image) return null

    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * image.width
    const y = ((clientY - rect.top) / rect.height) * image.height

    return {
      x: Math.max(0, Math.min(image.width, x)),
      y: Math.max(0, Math.min(image.height, y)),
    }
  }, [image])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = -e.deltaY
      const factor = 1.1
      const nextZoom = delta > 0 ? Math.min(5, zoom * factor) : Math.max(0.2, zoom / factor)
      setZoom(nextZoom)
    } else if (isSpacePressed || e.buttons === 4) {
      // Allow scroll to pan? Usually standard scroll is better
    }
  }, [zoom, isSpacePressed])

  const buildDraftBox = useCallback((
    start: { x: number; y: number },
    point: { x: number; y: number }
  ) => ({
    x: Math.min(start.x, point.x),
    y: Math.min(start.y, point.y),
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y),
  }), [])

  const updateAnnotationCoordinates = useCallback((annotationId: string, nextBox: DraftBox) => {
    const normalized = clampBox(nextBox)
    onAnnotationsChange(
      annotations.map((annotation) =>
        annotation.id === annotationId
          ? { ...annotation, coordinates: normalized }
          : annotation
      )
    )
  }, [annotations, clampBox, onAnnotationsChange])

  const updateAnnotationPoints = useCallback((
    annotationId: string,
    getNextPoints: (points: Array<[number, number]>) => Array<[number, number]>
  ) => {
    if (!image) return

    onAnnotationsChange(
      annotations.map((annotation) => {
        if (annotation.id !== annotationId) return annotation

        const currentPoints = getPointList(annotation.coordinates)
        const nextPoints = getNextPoints(currentPoints).map(([x, y]) => [
          Math.max(0, Math.min(image.width, x)),
          Math.max(0, Math.min(image.height, y)),
        ])

        return {
          ...annotation,
          coordinates: {
            ...annotation.coordinates,
            points: nextPoints,
          },
        }
      })
    )
  }, [annotations, image, onAnnotationsChange])

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const finishPointShape = useCallback(() => {
    if (!image || !activeClass || draftPolygon.length === 0) return

    const minimumPoints = tool === 'polygon' || tool === 'skeleton' ? 3 : 2
    if (tool !== 'points' && draftPolygon.length < minimumPoints) return

    const nextAnnotation: Annotation = {
      id: `draft-${Date.now()}`,
      image_id: image.id,
      project_id: image.project_id,
      class_id: activeClass.id,
      class_name: activeClass.name,
      type: tool === 'points' ? 'points' : tool === 'polyline' ? 'polyline' : tool === 'skeleton' ? 'skeleton' : 'polygon',
      coordinates: { points: draftPolygon.map((point) => [point.x, point.y]) },
      created_at: new Date().toISOString(),
    }

    onAnnotationsChange([...annotations, nextAnnotation])
    onSelectAnnotation(nextAnnotation.id)
    setDraftPolygon([])
    setTool('select')
  }, [activeClass, annotations, draftPolygon, image, onAnnotationsChange, onSelectAnnotation, tool])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image) return

    // Allow panning even in readOnly
    if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
      setIsPanning(true)
      setDragStart({ x: event.clientX, y: event.clientY })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (readOnly) return

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    if (!point) return

    if (tool === 'tag') {
      if (!activeClass) {
        onActiveClassRequired()
        return
      }

      const nextAnnotation: Annotation = {
        id: `draft-${Date.now()}`,
        image_id: image.id,
        project_id: image.project_id,
        class_id: activeClass.id,
        class_name: activeClass.name,
        type: 'tag',
        coordinates: {},
        created_at: new Date().toISOString(),
      }
      onAnnotationsChange([...annotations, nextAnnotation])
      onSelectAnnotation(nextAnnotation.id)
      setTool('select')
    } else if (tool === 'bbox' || tool === 'ellipse' || tool === 'cuboid') {
      if (!activeClass) {
        onActiveClassRequired()
        return
      }

      setDragStart(point)
      setDraftBox({ x: point.x, y: point.y, width: 0, height: 0 })
      setInteraction({ mode: 'draw' })
    } else if (tool === 'polygon' || tool === 'polyline' || tool === 'points' || tool === 'skeleton') {
      if (!activeClass) {
        onActiveClassRequired()
        return
      }

      setDraftPolygon((current) => [...current, point])
    } else if (tool === 'mask') {
      if (!activeClass) {
        onActiveClassRequired()
        return
      }

      setIsBrushing(true)
      setDraftMask([point])
    } else {
      onSelectAnnotation(null)
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning && dragStart) {
      const dx = event.clientX - dragStart.x
      const dy = event.clientY - dragStart.y
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setDragStart({ x: event.clientX, y: event.clientY })
      return
    }

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    if (!point) return

    if (interaction?.mode === 'draw' && dragStart) {
      setDraftBox(buildDraftBox(dragStart, point))
      return
    }

    if (isBrushing && tool === 'mask') {
      setDraftMask((current) => [...current, point])
      return
    }

    if (interaction?.mode === 'move' && interaction.annotationId) {
      const target = annotations.find((annotation) => annotation.id === interaction.annotationId)
      if (!target || !isDraftBox(target.coordinates)) return

      updateAnnotationCoordinates(interaction.annotationId, {
        x: point.x - (interaction.pointerOffsetX || 0),
        y: point.y - (interaction.pointerOffsetY || 0),
        width: target.coordinates.width,
        height: target.coordinates.height,
      })
      return
    }

    if (interaction?.mode === 'resize' && interaction.annotationId && dragStart && interaction.handle) {
      const target = annotations.find((annotation) => annotation.id === interaction.annotationId)
      if (!target || !isDraftBox(target.coordinates)) return

      const box = target.coordinates
      const anchor = getResizeAnchor(box, interaction.handle)
      updateAnnotationCoordinates(interaction.annotationId, buildDraftBox(anchor, point))
    }

    if (interaction?.mode === 'move-points' && interaction.annotationId) {
      const dx = point.x - (interaction.pointerOffsetX || point.x)
      const dy = point.y - (interaction.pointerOffsetY || point.y)
      updateAnnotationPoints(interaction.annotationId, (points) =>
        points.map(([x, y]) => [x + dx, y + dy])
      )
      setInteraction((current) => current ? { ...current, pointerOffsetX: point.x, pointerOffsetY: point.y } : current)
      return
    }

    if (interaction?.mode === 'move-point' && interaction.annotationId && typeof interaction.pointIndex === 'number') {
      updateAnnotationPoints(interaction.annotationId, (points) =>
        points.map((item, index) => index === interaction.pointIndex ? [point.x, point.y] : item)
      )
    }
  }

  const handleCanvasDoubleClick = () => {
    if ((tool === 'polygon' || tool === 'polyline' || tool === 'points' || tool === 'skeleton') && draftPolygon.length >= 2) {
      finishPointShape()
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false)
      setDragStart(null)
      return
    }

    if (isBrushing && tool === 'mask') {
      setIsBrushing(false)
      if (image && activeClass && draftMask.length >= 2) {
        const nextAnnotation: Annotation = {
          id: `draft-${Date.now()}`,
          image_id: image.id,
          project_id: image.project_id,
          class_id: activeClass.id,
          class_name: activeClass.name,
          type: 'mask',
          coordinates: { points: draftMask.map((point) => [point.x, point.y]), brushSize: 18 },
          created_at: new Date().toISOString(),
        }
        onAnnotationsChange([...annotations, nextAnnotation])
        onSelectAnnotation(nextAnnotation.id)
      }
      setDraftMask([])
      setTool('select')
      return
    }

    if (interaction?.mode !== 'draw') {
      setDragStart(null)
      setDraftBox(null)
      setInteraction(null)
      return
    }

    if (!dragStart || !image || !activeClass) {
      setDragStart(null)
      setDraftBox(null)
      setInteraction(null)
      return
    }

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    const finalBox = point ? buildDraftBox(dragStart, point) : draftBox
    const minSize = 8

    if (finalBox && finalBox.width >= minSize && finalBox.height >= minSize) {
      const nextAnnotation: Annotation = {
        id: `draft-${Date.now()}`,
        image_id: image.id,
        project_id: image.project_id,
        class_id: activeClass.id,
        class_name: activeClass.name,
        type: tool === 'ellipse' ? 'ellipse' : tool === 'cuboid' ? 'cuboid' : 'bbox',
        coordinates: finalBox,
        created_at: new Date().toISOString(),
      }

      onAnnotationsChange([...annotations, nextAnnotation])
      onSelectAnnotation(nextAnnotation.id)
      setTool('select')
    }

    setDragStart(null)
    setDraftBox(null)
    setInteraction(null)
  }

  const handleAnnotationPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    annotation: Annotation
  ) => {
    if (tool !== 'select' || isSpacePressed) return

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    if (!point) return

    const box = annotation.coordinates
    onSelectAnnotation(annotation.id)
    setInteraction({
      mode: 'move',
      annotationId: annotation.id,
      pointerOffsetX: point.x - box.x,
      pointerOffsetY: point.y - box.y,
    })
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLSpanElement>,
    annotation: Annotation,
    handle: ResizeHandle
  ) => {
    if (tool !== 'select' || isSpacePressed || readOnly) return

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    if (!point) return

    onSelectAnnotation(annotation.id)
    setDragStart(point)
    setInteraction({
      mode: 'resize',
      annotationId: annotation.id,
      handle,
    })
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointShapePointerDown = (
    event: React.PointerEvent<SVGElement>,
    annotation: Annotation
  ) => {
    if (tool !== 'select' || isSpacePressed || readOnly) return

    const point = getRelativeCoordinates(event.clientX, event.clientY)
    if (!point) return

    onSelectAnnotation(annotation.id)
    setInteraction({
      mode: 'move-points',
      annotationId: annotation.id,
      pointerOffsetX: point.x,
      pointerOffsetY: point.y,
    })
    event.stopPropagation()
  }

  const handleVertexPointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    annotation: Annotation,
    pointIndex: number
  ) => {
    if (tool !== 'select' || isSpacePressed || readOnly) return

    onSelectAnnotation(annotation.id)
    setInteraction({
      mode: 'move-point',
      annotationId: annotation.id,
      pointIndex,
    })
    event.stopPropagation()
  }

  const handleDeleteSelected = () => {
    if (!selectedAnnotationId) return

    onAnnotationsChange(
      annotations.filter((annotation) => annotation.id !== selectedAnnotationId)
    )
    onSelectAnnotation(null)
  }

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden" ref={containerRef}>
      <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <ToolbarButton
            icon={<MousePointer2 className="w-4 h-4" />}
            active={tool === 'select'}
            onClick={() => setTool('select')}
            tooltip="Select (V)"
          />
          <ToolbarButton
            icon={<Box className="w-4 h-4" />}
            active={tool === 'bbox'}
            onClick={() => setTool('bbox')}
            tooltip="Bounding Box (B)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<Pentagon className="w-4 h-4" />}
            active={tool === 'polygon'}
            onClick={() => setTool('polygon')}
            tooltip="Polygon (P)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="L" />}
            active={tool === 'polyline'}
            onClick={() => setTool('polyline')}
            tooltip="Polyline (L)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="Pt" />}
            active={tool === 'points'}
            onClick={() => setTool('points')}
            tooltip="Points (O)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="E" />}
            active={tool === 'ellipse'}
            onClick={() => setTool('ellipse')}
            tooltip="Ellipse (E)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="3D" />}
            active={tool === 'cuboid'}
            onClick={() => setTool('cuboid')}
            tooltip="Cuboid (C)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="M" />}
            active={tool === 'mask'}
            onClick={() => setTool('mask')}
            tooltip="Mask Brush (M)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="Sk" />}
            active={tool === 'skeleton'}
            onClick={() => setTool('skeleton')}
            tooltip="Skeleton (K)"
            disabled={readOnly}
          />
          <ToolbarButton
            icon={<ToolGlyph label="T" />}
            active={tool === 'tag'}
            onClick={() => setTool('tag')}
            tooltip="Tag (T)"
            disabled={readOnly}
          />
          <div className="w-px h-6 bg-border mx-2" />
          <ToolbarButton
            icon={<Trash2 className="w-4 h-4" />}
            onClick={handleDeleteSelected}
            disabled={!selectedAnnotationId || readOnly}
            tooltip="Delete selected box (Del)"
          />
          <div className="w-px h-6 bg-border mx-2" />
          <ToolbarButton
            icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>}
            onClick={onUndo}
            disabled={!onUndo || readOnly}
            tooltip="Undo (Ctrl+Z)"
          />
          <ToolbarButton
            icon={<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>}
            onClick={onRedo}
            disabled={!onRedo || readOnly}
            tooltip="Redo (Ctrl+Y)"
          />
        </div>

        <div className="flex items-center gap-2">
          <ToolbarButton
            icon={<ZoomOut className="w-4 h-4" />}
            tooltip="Zoom Out (-)"
            onClick={() => setZoom((value) => Math.max(0.2, value - 0.2))}
          />
          <div className="w-12 text-center text-xs font-semibold text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          <ToolbarButton
            icon={<ZoomIn className="w-4 h-4" />}
            tooltip="Zoom In (+)"
            onClick={() => setZoom((value) => Math.min(5, value + 0.2))}
          />
          <ToolbarButton
            icon={<Maximize2 className="w-4 h-4" />}
            tooltip="Reset Zoom (0)"
            onClick={() => {
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
          />
        </div>
      </div>

      <div 
        className="flex-1 flex flex-col items-center justify-center relative bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] overflow-hidden"
        onWheel={handleWheel}
        onPointerLeave={() => setMousePos(null)}
      >
        {/* Crosshair Guide */}
        {tool !== 'select' && mousePos && !isPanning && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div 
              className="absolute top-0 bottom-0 border-l border-accent/40 w-px" 
              style={{ left: mousePos.x }}
            />
            <div 
              className="absolute left-0 right-0 border-t border-accent/40 h-px" 
              style={{ top: mousePos.y }}
            />
          </div>
        )}
        {image ? (
          <motion.div
            key={image.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="relative w-full h-full flex items-center justify-center p-8"
          >
            <div
              className={cn(
                "relative flex items-center justify-center select-none touch-none transition-transform duration-75 ease-out",
                isPanning || isSpacePressed ? "cursor-grab active:cursor-grabbing" : tool === 'bbox' ? "cursor-crosshair" : "cursor-default"
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={handleCanvasDoubleClick}
              style={{ 
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
                transformOrigin: 'center center'
              }}
            >
              <img
                ref={imageRef}
                src={image.url}
                alt={image.original_filename}
                loading="eager"
                decoding="async"
                draggable={false}
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg bg-white"
              />

              <div className="absolute inset-0">
                {annotations.map((annotation) => {
                  const label = classLabels.find((item) => item.id === annotation.class_id)
                  const isSelected = selectedAnnotationId === annotation.id
                  const box = annotation.coordinates || {}

                  if (['polygon', 'polyline', 'points', 'skeleton', 'mask'].includes(annotation.type)) {
                    const points = Array.isArray(box.points) ? box.points : []
                    if (points.length === 0) return null
                    const pointString = points
                      .map((point: [number, number]) => `${(point[0] / image.width) * 100},${(point[1] / image.height) * 100}`)
                      .join(' ')
                    const firstPoint = points[0]
                    const isClosed = annotation.type === 'polygon'
                    const isLine = annotation.type === 'polyline' || annotation.type === 'skeleton'
                    const isPointSet = annotation.type === 'points'
                    const isMask = annotation.type === 'mask'

                    return (
                      <div key={annotation.id} className="absolute inset-0 touch-none pointer-events-none">
                        <svg className="absolute inset-0 h-full w-full overflow-visible">
                          {isMask ? (
                            <polyline
                              points={pointString}
                              fill="none"
                              stroke={label?.color || '#2563eb'}
                              strokeWidth={box.brushSize || 18}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={isSelected ? 0.65 : 0.42}
                              vectorEffect="non-scaling-stroke"
                            className="pointer-events-auto cursor-pointer"
                            onPointerDown={(event) => handlePointShapePointerDown(event, annotation)}
                            onClick={(event) => event.stopPropagation()}
                          />
                          ) : isClosed ? (
                            <polygon
                              points={pointString}
                              fill={isSelected ? `${label?.color || '#2563eb'}33` : `${label?.color || '#2563eb'}14`}
                              stroke={label?.color || '#2563eb'}
                              strokeWidth={isSelected ? 3 : 2}
                              vectorEffect="non-scaling-stroke"
                            className="pointer-events-auto cursor-pointer"
                              onPointerDown={(event) => handlePointShapePointerDown(event, annotation)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : isLine ? (
                            <polyline
                              points={pointString}
                              fill="none"
                              stroke={label?.color || '#2563eb'}
                              strokeWidth={isSelected ? 3 : 2}
                              vectorEffect="non-scaling-stroke"
                              className="pointer-events-auto cursor-pointer"
                              onPointerDown={(event) => handlePointShapePointerDown(event, annotation)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : null}
                          {isPointSet && points.map((point: [number, number], index: number) => (
                            <circle
                              key={index}
                              cx={`${(point[0] / image.width) * 100}%`}
                              cy={`${(point[1] / image.height) * 100}%`}
                              r="5"
                              fill={label?.color || '#2563eb'}
                              stroke="white"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                              className="pointer-events-auto cursor-pointer"
                              onPointerDown={(event) => handlePointShapePointerDown(event, annotation)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          ))}
                          {isSelected && points.map((point: [number, number], index: number) => (
                            <circle
                              key={index}
                              cx={`${(point[0] / image.width) * 100}%`}
                              cy={`${(point[1] / image.height) * 100}%`}
                              r="4"
                              fill={label?.color || '#2563eb'}
                              stroke="white"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                              className="pointer-events-auto cursor-move"
                              onPointerDown={(event) => handleVertexPointerDown(event, annotation, index)}
                            />
                          ))}
                        </svg>
                        <span
                          className="absolute rounded-md px-2 py-1 text-[10px] font-bold text-white shadow-lg whitespace-nowrap pointer-events-none"
                          style={{
                            left: `${(firstPoint[0] / image.width) * 100}%`,
                            top: `calc(${(firstPoint[1] / image.height) * 100}% - 1.75rem)`,
                            backgroundColor: label?.color || '#2563eb',
                          }}
                        >
                          {annotation.class_name}
                        </span>
                      </div>
                    )
                  }

                  if (!['bbox', 'ellipse', 'cuboid'].includes(annotation.type)) return null

                  return (
                    <button
                      key={annotation.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectAnnotation(annotation.id)
                        setTool('select')
                      }}
                      onPointerDown={(event) => handleAnnotationPointerDown(event, annotation)}
                      className={cn(
                        "absolute border-2 transition-all touch-none",
                        annotation.type === 'ellipse' && "rounded-full",
                        isSelected ? "ring-2 ring-white/90" : ""
                      )}
                      style={{
                        left: `${(box.x / image.width) * 100}%`,
                        top: `${(box.y / image.height) * 100}%`,
                        width: `${(box.width / image.width) * 100}%`,
                        height: `${(box.height / image.height) * 100}%`,
                        borderColor: label?.color || '#2563eb',
                        backgroundColor: isSelected ? `${label?.color || '#2563eb'}22` : 'transparent',
                      }}
                      >
                      {annotation.type === 'cuboid' && (
                        <svg className="absolute inset-0 h-full w-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <path
                            d="M 0 0 L 16 12 L 100 12 M 100 0 L 84 12 L 84 100 M 16 12 L 16 100"
                            fill="none"
                            stroke={label?.color || '#2563eb'}
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            opacity="0.9"
                          />
                        </svg>
                      )}
                      {isSelected ? (
                        <>
                          {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((handle) => (
                            <span
                              key={handle}
                              onPointerDown={(event) => handleResizePointerDown(event, annotation, handle)}
                              className={cn(
                                "absolute h-3 w-3 rounded-full border-2 border-white bg-foreground shadow-sm",
                                handle === 'nw' && "-left-1.5 -top-1.5 cursor-nwse-resize",
                                handle === 'ne' && "-right-1.5 -top-1.5 cursor-nesw-resize",
                                handle === 'sw' && "-left-1.5 -bottom-1.5 cursor-nesw-resize",
                                handle === 'se' && "-right-1.5 -bottom-1.5 cursor-nwse-resize"
                              )}
                            />
                          ))}
                        </>
                      ) : null}
                      <span
                        className="absolute -top-7 left-0 rounded-md px-2 py-1 text-[10px] font-bold text-white shadow-lg whitespace-nowrap"
                        style={{ backgroundColor: label?.color || '#2563eb' }}
                      >
                        {annotation.class_name}
                      </span>
                    </button>
                  )
                })}

                {draftBox ? (
                  <div
                    className={cn(
                      "absolute border-2 border-dashed border-accent bg-accent/10",
                      tool === 'ellipse' && "rounded-full"
                    )}
                    style={{
                      left: `${(draftBox.x / image.width) * 100}%`,
                      top: `${(draftBox.y / image.height) * 100}%`,
                      width: `${(draftBox.width / image.width) * 100}%`,
                      height: `${(draftBox.height / image.height) * 100}%`,
                    }}
                  />
                ) : null}

                {draftPolygon.length > 0 ? (
                  <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible">
                    <polyline
                      points={draftPolygon
                        .map((point) => `${(point.x / image.width) * 100},${(point.y / image.height) * 100}`)
                        .join(' ')}
                      fill="none"
                      stroke={activeClass?.color || '#2563eb'}
                      strokeWidth="2"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {draftPolygon.map((point, index) => (
                      <circle
                        key={index}
                        cx={`${(point.x / image.width) * 100}%`}
                        cy={`${(point.y / image.height) * 100}%`}
                        r="4"
                        fill={activeClass?.color || '#2563eb'}
                        stroke="white"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                ) : null}

                {draftMask.length > 0 ? (
                  <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible">
                    <polyline
                      points={draftMask
                        .map((point) => `${(point.x / image.width) * 100},${(point.y / image.height) * 100}`)
                        .join(' ')}
                      fill="none"
                      stroke={activeClass?.color || '#2563eb'}
                      strokeWidth="18"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.45"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-4">
              <MousePointer2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Select an image to start annotating</p>
          </div>
        )}
      </div>

      <div className="h-14 border-t border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onPrevImage}
            disabled={!canGoPrev}
            className="h-9 px-4 rounded-xl"
          >
            <ChevronLeft className="w-4 h-4 mr-1.5" />
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onNextImage}
            disabled={!canGoNext}
            className="h-9 px-4 rounded-xl"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        {image && (
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                Active Class
              </span>
              <span className="text-xs font-semibold text-foreground">
                {tool === 'polygon' && draftPolygon.length > 0
                  ? `${draftPolygon.length} polygon points`
                  : ['polyline', 'points', 'skeleton'].includes(tool) && draftPolygon.length > 0
                    ? `${draftPolygon.length} ${tool} points`
                    : tool === 'mask' && draftMask.length > 0
                      ? `${draftMask.length} brush samples`
                  : activeClass?.name || 'Choose a class'}
              </span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                Filename
              </span>
              <span className="text-xs font-semibold text-foreground">{image.original_filename}</span>
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">
                Resolution
              </span>
              <span className="text-xs font-semibold text-foreground">
                {image.width} x {image.height} px
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getResizeAnchor(box: DraftBox, handle: ResizeHandle) {
  switch (handle) {
    case 'nw':
      return { x: box.x + box.width, y: box.y + box.height }
    case 'ne':
      return { x: box.x, y: box.y + box.height }
    case 'sw':
      return { x: box.x + box.width, y: box.y }
    case 'se':
    default:
      return { x: box.x, y: box.y }
  }
}

function ToolbarButton({
  icon,
  active = false,
  disabled = false,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode
  active?: boolean
  disabled?: boolean
  tooltip: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
        active
          ? "bg-accent text-white shadow-lg shadow-accent/20"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "opacity-30 cursor-not-allowed grayscale"
      )}
    >
      {icon}
    </button>
  )
}

function ToolGlyph({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-bold leading-none tracking-tight">
      {label}
    </span>
  )
}
