'use client'

import React, { useState } from 'react'
import { ClassLabelResponse } from '@/types'
import { Button, Input } from '@/components/ui'
import { useUpdateClassLabel, useDeleteClassLabel, useMergeClassLabels } from '@/hooks/useClassLabels'
import { Trash2, Edit2, Combine, Check, X, Palette, Tags } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ClassManagementProps {
  projectId: string
  classes: ClassLabelResponse[]
  onRefresh: () => void
}

export function ClassManagement({ projectId, classes, onRefresh }: ClassManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', color: '' })
  
  const [mergingSourceIds, setMergingSourceIds] = useState<string[]>([])
  const [mergingTargetId, setMergingTargetId] = useState<string | null>(null)
  const [isMergeMode, setIsMergeMode] = useState(false)

  const { mutate: updateClass, isLoading: isUpdating } = useUpdateClassLabel(projectId)
  const { mutate: deleteClass } = useDeleteClassLabel(projectId)
  const { mutate: mergeClasses, isLoading: isMerging } = useMergeClassLabels(projectId)

  const handleStartEdit = (cls: ClassLabelResponse) => {
    setEditingId(cls.id)
    setEditForm({ name: cls.name, color: cls.color })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    await updateClass(editingId, editForm)
    setEditingId(null)
    onRefresh()
  }

  const handleDelete = async (classId: string, className: string) => {
    if (!window.confirm(`Delete class "${className}" and ALL of its annotations? This cannot be undone.`)) return
    await deleteClass(classId)
    onRefresh()
  }

  const toggleMergeSource = (id: string) => {
    setMergingSourceIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleExecuteMerge = async () => {
    if (!mergingTargetId || mergingSourceIds.length === 0) return
    await mergeClasses(mergingSourceIds, mergingTargetId)
    setIsMergeMode(false)
    setMergingSourceIds([])
    setMergingTargetId(null)
    onRefresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="icon-gradient mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
            <Tags className="h-5 w-5" />
          </div>
          <div>
          <h3 className="font-display text-2xl leading-tight text-foreground">Manage Class Labels</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Rename, delete, or merge classes. Changes affect all existing annotations.
          </p>
          </div>
        </div>
        <Button 
          variant={isMergeMode ? "primary" : "secondary"}
          size="sm"
          onClick={() => {
            setIsMergeMode(!isMergeMode)
            setMergingSourceIds([])
            setMergingTargetId(null)
          }}
        >
          <Combine className="w-4 h-4 mr-2" />
          {isMergeMode ? "Cancel Merge" : "Merge Classes"}
        </Button>
      </div>

      {isMergeMode && (
        <div className="space-y-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-start gap-3">
            <Combine className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground">Merge Mode Active</p>
              <p className="text-xs text-muted-foreground">
                Select one or more source classes to merge INTO a target class.
              </p>
            </div>
          </div>
          
          {mergingSourceIds.length > 0 && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">
                  Select Target Class
                </label>
                <select 
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                  value={mergingTargetId || ''}
                  onChange={(e) => setMergingTargetId(e.target.value)}
                >
                  <option value="">Choose target class...</option>
                  {classes.filter(c => !mergingSourceIds.includes(c.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <Button 
                onClick={handleExecuteMerge}
                disabled={!mergingTargetId || isMerging}
                className="h-11"
              >
                Execute Merge
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3">
        {classes.map((cls) => {
          const isEditing = editingId === cls.id
          const isSelectedForMerge = mergingSourceIds.includes(cls.id)
          const isTargetForMerge = mergingTargetId === cls.id

          return (
            <div 
              key={cls.id}
              className={cn(
                "group flex flex-col gap-4 rounded-xl border p-4 shadow-sm transition-all sm:flex-row sm:items-center sm:justify-between",
                isEditing ? "border-accent bg-accent/5 ring-4 ring-accent/10" : "border-border bg-background hover:border-accent/25 hover:shadow-md",
                isSelectedForMerge && "border-red-500 bg-red-50/50",
                isTargetForMerge && "border-emerald-500 bg-emerald-50/50"
              )}
            >
              <div className="flex items-center gap-4 flex-1">
                {isMergeMode && (
                  <input 
                    type="checkbox"
                    checked={isSelectedForMerge}
                    onChange={() => toggleMergeSource(cls.id)}
                    disabled={isTargetForMerge}
                    className="w-5 h-5 rounded-lg border-border text-accent focus:ring-accent"
                  />
                )}

                <div 
                  className="flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5"
                  style={{ backgroundColor: isEditing ? editForm.color : cls.color }}
                >
                  <Palette className="w-5 h-5 text-white" />
                </div>

                {isEditing ? (
                  <div className="flex flex-1 items-center gap-3">
                    <Input 
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-10"
                    />
                    <input 
                      type="color"
                      value={editForm.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-background p-1"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-foreground">{cls.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                      {cls.annotation_count} Annotations
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                {isEditing ? (
                  <>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={handleSaveEdit}
                      disabled={isUpdating}
                      className="text-emerald-600 hover:bg-emerald-50"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <button 
                      onClick={handleCancelEdit}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : !isMergeMode && (
                  <>
                    <button 
                      onClick={() => handleStartEdit(cls)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(cls.id, cls.name)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {classes.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Tags className="h-5 w-5" />
            </div>
            <h4 className="font-display text-xl text-foreground">No class labels yet</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Create labels from the annotation workflow to manage them here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
