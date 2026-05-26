'use client'

import React, { useMemo } from 'react'
import { Annotation, ClassLabel, Image as ImageType, ImageSplit } from '@/types'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Save,
  Tag,
} from 'lucide-react'
import { motion } from 'framer-motion'

interface ClassificationAnnotatorProps {
  image: ImageType | undefined
  annotations: Annotation[]
  classLabels: ClassLabel[]
  readOnly?: boolean
  selectedSplit: ImageSplit
  onSplitChange: (split: ImageSplit) => void
  onAnnotationsChange: (annotations: Annotation[]) => void
  onSave: () => Promise<void>
  onMarkDone?: () => Promise<void>
  onPrevImage: () => void
  onNextImage: () => void
  canGoPrev: boolean
  canGoNext: boolean
  isSaving: boolean
  isUpdatingSplit?: boolean
  isMarkingDone?: boolean
}

const splitOptions: Array<{ value: ImageSplit; label: string }> = [
  { value: 'train', label: 'Train' },
  { value: 'valid', label: 'Valid' },
  { value: 'test', label: 'Test' },
]

export default function ClassificationAnnotator({
  image,
  annotations,
  classLabels,
  readOnly = false,
  selectedSplit,
  onSplitChange,
  onAnnotationsChange,
  onSave,
  onMarkDone,
  onPrevImage,
  onNextImage,
  canGoPrev,
  canGoNext,
  isSaving,
  isUpdatingSplit = false,
  isMarkingDone = false,
}: ClassificationAnnotatorProps) {
  const currentClassification = useMemo(
    () => annotations.find((annotation) => annotation.type === 'classification'),
    [annotations]
  )

  const selectedClassId = currentClassification?.class_id || null
  const selectedClass = classLabels.find((label) => label.id === selectedClassId)

  const handleSelectClass = (label: ClassLabel) => {
    if (!image || readOnly) return

    const nextAnnotation: Annotation = {
      id: currentClassification?.id || `draft-classification-${image.id}`,
      image_id: image.id,
      project_id: image.project_id,
      class_id: label.id,
      class_name: label.name,
      type: 'classification',
      coordinates: {},
      created_at: currentClassification?.created_at || new Date().toISOString(),
    }

    onAnnotationsChange([nextAnnotation])
  }

  return (
    <div className="flex min-w-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Product Classification</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Choose one type for the entire image
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onPrevImage} disabled={!canGoPrev} className="h-9 px-4 rounded-xl">
              <ChevronLeft className="w-4 h-4 mr-1.5" />
              Prev
            </Button>
            <Button variant="secondary" size="sm" onClick={onNextImage} disabled={!canGoNext} className="h-9 px-4 rounded-xl">
              Next
              <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] p-8">
          {image ? (
            <motion.div
              key={image.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="flex h-full w-full flex-col items-center justify-center gap-5"
            >
              <div className="relative flex max-h-[calc(100%-5rem)] max-w-full items-center justify-center">
                <img
                  src={image.url}
                  alt={image.original_filename}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl"
                />
                {selectedClass && (
                  <div className="absolute left-4 top-4 rounded-xl border border-white/70 bg-card/95 px-4 py-2 shadow-xl backdrop-blur">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedClass.color }}
                      />
                      <span className="text-sm font-bold text-foreground">{selectedClass.name}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex max-w-full items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{image.original_filename}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {image.width} x {image.height} px
                  </p>
                </div>
                <div className="h-8 w-px bg-border" />
                <p className="text-xs font-semibold text-muted-foreground">
                  {selectedClass ? 'Product type selected' : 'No product type selected'}
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-muted">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">Select an image to start classifying</p>
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[360px] flex-shrink-0 flex-col border-l border-border bg-card shadow-2xl">
        <div className="border-b border-border bg-muted/20 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Product Type</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Choose a label for the image</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {classLabels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-center">
              <p className="text-sm font-semibold text-foreground">No product types yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Add classes in Project Settings before classifying images.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {classLabels.map((label, index) => {
                const isSelected = selectedClassId === label.id
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => handleSelectClass(label)}
                    disabled={readOnly}
                    className={cn(
                      'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all',
                      isSelected
                        ? 'border-accent bg-accent/10 ring-2 ring-accent/10'
                        : 'border-border bg-background hover:border-accent/35',
                      readOnly && 'cursor-default opacity-80'
                    )}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{label.name}</span>
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card/80 p-6 backdrop-blur-md">
          {!readOnly ? (
            <>
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dataset Split</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">Default: Train</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {splitOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onSplitChange(option.value)}
                      disabled={isSaving || isUpdatingSplit}
                      className={cn(
                        'h-9 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all',
                        selectedSplit === option.value
                          ? 'border-accent bg-accent text-white shadow-accent'
                          : 'border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground',
                        (isSaving || isUpdatingSplit) && 'cursor-not-allowed opacity-70'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={onSave}
                isLoading={isSaving || isUpdatingSplit}
                disabled={!selectedClassId}
                className="h-12 w-full rounded-2xl text-sm font-bold shadow-accent"
              >
                {isSaving || isUpdatingSplit ? 'Synchronizing...' : 'Save Classification'}
                <Save className="ml-2 h-4 w-4" />
              </Button>

              {onMarkDone && (
                <Button
                  onClick={onMarkDone}
                  isLoading={isMarkingDone}
                  disabled={!selectedClassId}
                  variant="secondary"
                  className="mt-3 h-11 w-full rounded-2xl text-sm font-bold"
                >
                  <Check className="h-4 w-4" />
                  Mark Done
                </Button>
              )}
            </>
          ) : (
            <div className="py-2 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Read Only Mode</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
