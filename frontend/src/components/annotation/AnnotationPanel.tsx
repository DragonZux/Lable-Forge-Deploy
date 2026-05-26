'use client'

import React, { useState } from 'react'
import { ClassLabel, Annotation, AnnotationAuditEvent, ImageSplit } from '@/types'
import { apiPost, apiPatch, apiDelete } from '@/lib/api'
import { 
  Layers, 
  Plus, 
  Trash2, 
  Save, 
  Hash, 
  Type, 
  Check,
  ChevronDown,
  Pencil,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { motion, AnimatePresence } from 'framer-motion'
import AuditHistoryPanel from './AuditHistoryPanel'

interface AnnotationPanelProps {
  classLabels: ClassLabel[]
  annotations: Annotation[]
  activeClassId: string | null
  selectedAnnotationId: string | null
  onActiveClassChange: (classId: string) => void
  onSelectAnnotation: (annotationId: string | null) => void
  onAnnotationsChange: (annotations: Annotation[]) => void
  onSave: () => Promise<void>
  onMarkDone?: () => Promise<void>
  selectedSplit: ImageSplit
  onSplitChange: (split: ImageSplit) => void
  isSaving: boolean
  isUpdatingSplit?: boolean
  isMarkingDone?: boolean
  projectId: string
  onClassCreated: (newClassId?: string) => Promise<void>
  readOnly?: boolean
  width?: number | string
  auditEvents?: AnnotationAuditEvent[]
}

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#52C9B5',
]

export default function AnnotationPanel({
  classLabels,
  annotations,
  activeClassId,
  selectedAnnotationId,
  onActiveClassChange,
  onSelectAnnotation,
  onAnnotationsChange,
  onSave,
  onMarkDone,
  selectedSplit,
  onSplitChange,
  isSaving,
  isUpdatingSplit = false,
  isMarkingDone = false,
  projectId,
  onClassCreated,
  readOnly = false,
  width = 320,
  auditEvents = [],
}: AnnotationPanelProps) {
  const [isAddingClass, setIsAddingClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])

  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState('')

  const [deletingClassId, setDeletingClassId] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const splitOptions: Array<{ value: ImageSplit; label: string }> = [
    { value: 'train', label: 'Train' },
    { value: 'valid', label: 'Valid' },
    { value: 'test', label: 'Test' },
  ]

  const handleAddClass = async () => {
    if (!newClassName.trim()) return

    try {
      const createdClass = await apiPost<any>(`/projects/${projectId}/classes`, {
        name: newClassName,
        color: selectedColor,
      })

      await onClassCreated(createdClass.id)
      setNewClassName('')
      setIsAddingClass(false)
    } catch (error) {
      console.error('Failed to add class:', error)
    }
  }

  const handleStartEdit = (label: ClassLabel, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingClassId(label.id)
    setEditingName(label.name)
    setEditingColor(label.color)
  }

  const handleSaveEdit = async (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editingName.trim()) return

    try {
      await apiPatch(`/projects/${projectId}/classes/${labelId}`, {
        name: editingName,
        color: editingColor,
      })
      await onClassCreated()
      setEditingClassId(null)
    } catch (error) {
      console.error('Failed to update class label:', error)
    }
  }

  const handleStartDelete = (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingClassId(labelId)
  }

  const handleConfirmDelete = async (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiDelete(`/projects/${projectId}/classes/${labelId}`)
      
      if (activeClassId === labelId) {
        const remaining = classLabels.filter(c => c.id !== labelId)
        if (remaining.length > 0) {
          onActiveClassChange(remaining[0].id)
        } else {
          onActiveClassChange('')
        }
      }
      
      await onClassCreated()
      setDeletingClassId(null)
    } catch (error) {
      console.error('Failed to delete class label:', error)
    }
  }

  const handleDeleteAnnotation = (index: number) => {
    const updated = annotations.filter((_, i) => i !== index)
    onAnnotationsChange(updated)
    onSelectAnnotation(null)
  }

  return (
    <div 
      style={{ width }} 
      className="bg-card border-l border-border flex flex-col h-full overflow-hidden shadow-2xl z-20"
    >
      {/* Classes Header */}
      <div className="p-5 border-b border-border bg-muted/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Class Labels</span>
          </div>
          {!readOnly && (
            <button 
              onClick={() => setIsAddingClass(!isAddingClass)}
              className="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center hover:bg-accent/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isAddingClass && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 bg-background border border-border rounded-2xl mb-4 space-y-4 shadow-sm">
                <Input
                  placeholder="Label name..."
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="h-9 px-3 rounded-xl text-xs"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={cn(
                        "w-6 h-6 rounded-full transition-all duration-200",
                        selectedColor === color ? "ring-2 ring-accent ring-offset-2 scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm" 
                    className="flex-1 h-8 rounded-xl"
                    onClick={handleAddClass}
                  >
                    Add
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="flex-1 h-8 rounded-xl"
                    onClick={() => setIsAddingClass(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {classLabels.map((label) => {
            const isEditing = editingClassId === label.id
            const isDeleting = deletingClassId === label.id

            if (isEditing) {
              return (
                <div
                  key={label.id}
                  className="p-3 bg-muted/35 border border-border rounded-2xl space-y-3 shadow-inner"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="h-8 px-2 rounded-xl text-xs"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditingColor(color)}
                        className={cn(
                          "w-5 h-5 rounded-full transition-all duration-200",
                          editingColor === color ? "ring-2 ring-accent ring-offset-2 scale-110" : "hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1 h-7 rounded-xl text-[10px] uppercase font-bold"
                      onClick={(e) => handleSaveEdit(label.id, e)}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Save
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="flex-1 h-7 rounded-xl text-[10px] uppercase font-bold"
                      onClick={(e) => { e.stopPropagation(); setEditingClassId(null); }}
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              )
            }

            if (isDeleting) {
              return (
                <div
                  key={label.id}
                  className="p-3 bg-destructive/10 border border-destructive/20 rounded-2xl space-y-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] text-destructive font-bold uppercase tracking-wider leading-tight">
                    Delete &quot;{label.name}&quot;? All associated annotations will be removed!
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="danger"
                      className="flex-1 h-7 rounded-xl text-[10px] uppercase font-bold"
                      onClick={(e) => handleConfirmDelete(label.id, e)}
                    >
                      Delete
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="flex-1 h-7 rounded-xl text-[10px] uppercase font-bold"
                      onClick={(e) => { e.stopPropagation(); setDeletingClassId(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={label.id}
                onClick={() => onActiveClassChange(label.id)}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 rounded-xl bg-background border transition-all cursor-pointer relative overflow-hidden",
                  activeClassId === label.id
                    ? "border-accent bg-accent/[0.06] shadow-sm"
                    : "border-border hover:border-accent/30"
                )}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-xs font-bold text-foreground flex-1 truncate">{label.name}</span>
                
                {/* Actions group (hover to show) */}
                {!readOnly && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-gradient-to-l from-background via-background pl-2 pr-1 absolute right-2 inset-y-0 transition-opacity">
                    <button
                      onClick={(e) => handleStartEdit(label, e)}
                      className="w-6 h-6 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                      title="Edit Label"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleStartDelete(label.id, e)}
                      className="w-6 h-6 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
                      title="Delete Label"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase group-hover:opacity-0 transition-opacity">
                  {label.annotation_count || 0}
                </span>
              </div>
            )
          })}
          {classLabels.length === 0 && !isAddingClass && (
            <div className="text-center py-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No labels defined</p>
            </div>
          )}
        </div>
      </div>

      {/* Annotations List */}
      <div className="flex-1 flex flex-col min-h-0 bg-background/50">
        <div className="p-5 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Objects <span className="text-accent">({annotations.length})</span>
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40">
              <Type className="w-8 h-8 mb-2" />
              <p className="text-xs font-medium">No objects detected</p>
            </div>
          ) : (
            annotations.map((ann, idx) => {
              const classLabel = classLabels.find((c) => c.id === ann.class_id)
              return (
                <motion.div
                  key={ann.id || idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => onSelectAnnotation(ann.id)}
                  className={cn(
                    "flex items-start gap-3 p-3 bg-card border rounded-2xl hover:shadow-md transition-all group cursor-pointer",
                    selectedAnnotationId === ann.id
                      ? "border-accent shadow-md bg-accent/[0.04]"
                      : "border-border"
                  )}
                >
                  <div
                    className="w-1.5 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: classLabel?.color || '#999' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-foreground truncate">{ann.class_name}</p>
                      {!readOnly && (
                        <button
                          onClick={() => handleDeleteAnnotation(idx)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-red-500 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-muted text-[9px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                        {ann.type}
                      </span>
                      {ann.coordinates && (
                        <span className="text-[9px] font-mono text-muted-foreground/60">
                          {ann.type === 'polygon'
                            ? `${ann.coordinates.points?.length || 0} pts`
                            : ['polyline', 'points', 'skeleton', 'mask'].includes(ann.type)
                              ? `${ann.coordinates.points?.length || 0} pts`
                              : ann.type === 'tag'
                                ? 'image tag'
                            : `${Math.round(ann.coordinates.width || 0)} x ${Math.round(ann.coordinates.height || 0)}`}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      <AuditHistoryPanel
        events={auditEvents}
        isOpen={isHistoryOpen}
        onToggle={() => setIsHistoryOpen(!isHistoryOpen)}
        maxHeight={180}
      />

      {/* Action Footer */}
      <div className="p-6 border-t border-border bg-card/80 backdrop-blur-md">
        {!readOnly ? (
          <>
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dataset Split</span>
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
                      "h-9 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition-all",
                      selectedSplit === option.value
                        ? "border-accent bg-accent text-white shadow-accent"
                        : "border-border bg-background text-muted-foreground hover:border-accent/40 hover:text-foreground",
                      (isSaving || isUpdatingSplit) && "cursor-not-allowed opacity-70"
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
              className="w-full h-12 rounded-2xl shadow-accent group text-sm font-bold"
            >
              {isSaving || isUpdatingSplit ? 'Synchronizing...' : 'Save Annotations'}
              <Save className="w-4 h-4 ml-2 group-hover:scale-110 transition-transform" />
            </Button>
            {onMarkDone && (
              <Button
                onClick={onMarkDone}
                isLoading={isMarkingDone}
                variant="secondary"
                className="w-full h-11 rounded-2xl mt-3 text-sm font-bold"
              >
                <Check className="w-4 h-4" />
                Mark Done
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Read Only Mode</p>
          </div>
        )}
        <p className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-widest font-bold">
          Auto-saved locally
        </p>
      </div>
    </div>
  )
}
