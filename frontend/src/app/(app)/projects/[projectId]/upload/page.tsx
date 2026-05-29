'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { emitAppToast } from '@/lib/toast-events'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { 
  Upload, 
  X, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  FileUp,
  FileCheck,
  FileJson,
  Table2,
  Plus,
  ArrowRight,
  FolderArchive,
  Info
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'

interface FileWithProgress {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
  previewUrl?: string
}

interface AnnotationImportResult {
  created: number
  deleted: number
  matched_images: number
  created_classes: number
  missing_images: number
  missing_filenames?: string[]
}

export default function UploadPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { project } = useProject(projectId)
  const { canUpload } = usePermissions(project)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const annotationInputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<FileWithProgress[]>([])
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const [files, setFiles] = useState<FileWithProgress[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [annotationFile, setAnnotationFile] = useState<File | null>(null)
  const [annotationFormat, setAnnotationFormat] = useState<'coco' | 'csv'>('coco')
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [isImportingAnnotations, setIsImportingAnnotations] = useState(false)
  const [annotationImportResult, setAnnotationImportResult] = useState<AnnotationImportResult | null>(null)
  const [annotationImportError, setAnnotationImportError] = useState('')

  // ZIP Dataset Upload states
  const [activeTab, setActiveTab] = useState<'raw' | 'zip'>('raw')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [isDraggingZip, setIsDraggingZip] = useState(false)
  const [isUploadingZip, setIsUploadingZip] = useState(false)
  const [zipImportResult, setZipImportResult] = useState<any>(null)
  const [zipImportError, setZipImportError] = useState<string | null>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)

  const uploadZipFile = async () => {
    if (!zipFile) return

    setIsUploadingZip(true)
    setZipImportResult(null)
    setZipImportError(null)

    const formData = new FormData()
    formData.append('file', zipFile)

    try {
      let uploadUrl = `/api/images/upload-zip?project_id=${projectId}`
      if (typeof window !== 'undefined' && window.location.port === '3000') {
        uploadUrl = `${window.location.protocol}//${window.location.hostname}:8888/api/images/upload-zip?project_id=${projectId}`
      }

      const response = await fetch(
        uploadUrl,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )

      const data = await response.json()
      if (response.ok) {
        setZipImportResult(data)
        setZipFile(null)
        if (zipInputRef.current) zipInputRef.current.value = ''
        try { emitAppToast({ message: `Successfully imported ${data.images_count} images!`, type: 'success' }) } catch {}
      } else {
        const errMsg = data?.detail || data?.message || 'ZIP Import failed'
        setZipImportError(errMsg)
        try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
      }
    } catch {
      const errMsg = 'Connection failed'
      setZipImportError(errMsg)
      try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
    } finally {
      setIsUploadingZip(false)
    }
  }

  const revokePreviewUrls = (items: FileWithProgress[]) => {
    items.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl)
      }
    })
  }

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current)
      }
      revokePreviewUrls(filesRef.current)
    }
  }, [])

  const clearFiles = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current)
      resetTimeoutRef.current = null
    }
    setFiles((prev) => {
      revokePreviewUrls(prev)
      return []
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    addFiles(droppedFiles)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.currentTarget.files
    if (selectedFiles) {
      addFiles(Array.from(selectedFiles))
    }
  }

  const handleAnnotationFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.currentTarget.files?.[0]
    if (!selectedFile) return
    const lowerName = selectedFile.name.toLowerCase()
    setAnnotationFile(selectedFile)
    setAnnotationImportResult(null)
    setAnnotationImportError('')
    if (lowerName.endsWith('.csv')) {
      setAnnotationFormat('csv')
    } else if (lowerName.endsWith('.json')) {
      setAnnotationFormat('coco')
    }
  }

  const addFiles = (newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(f.type)
    )

    const newFileProgress: FileWithProgress[] = imageFiles.map((f) => ({
      file: f,
      progress: 0,
      status: 'pending',
      previewUrl: URL.createObjectURL(f)
    }))

    setFiles((prev) => [...prev, ...newFileProgress])
  }

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = [...prev]
      if (next[index].previewUrl) {
        URL.revokeObjectURL(next[index].previewUrl!)
      }
      next.splice(index, 1)
      return next
    })
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setIsUploading(true)
    const formData = new FormData()

    // Add all pending files
    files.forEach((f) => {
      if (f.status === 'pending') {
        formData.append('files', f.file)
      }
    })

    // Update status to uploading
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, status: 'uploading', progress: 10 } : f))

    try {
      const response = await fetch(
        `/api/images/upload?project_id=${projectId}`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )

      if (response.ok) {
        setFiles((prev) =>
          prev.map((f) =>
            f.status === 'uploading'
              ? { ...f, status: 'done', progress: 100 }
              : f
          )
        )
        // Reset after 3 seconds
        resetTimeoutRef.current = setTimeout(() => {
          clearFiles()
          setIsUploading(false)
          resetTimeoutRef.current = null
        }, 3000)
      } else {
        let errorText = 'Upload failed'
        try {
          const errorData = await response.json()
          errorText = errorData?.detail || errorData?.message || errorText
        } catch {}

        setFiles((prev) =>
          prev.map((f) => f.status === 'uploading' ? {
            ...f,
            status: 'error',
            error: errorText,
          } : f)
        )
        try { emitAppToast({ message: errorText, type: 'error' }) } catch {}
        setIsUploading(false)
      }
    } catch {
      const errMsg = 'Connection failed'
      setFiles((prev) =>
        prev.map((f) => f.status === 'uploading' ? {
          ...f,
          status: 'error',
          error: errMsg,
        } : f)
      )
      try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
      setIsUploading(false)
    }
  }

  const importAnnotations = async () => {
    if (!annotationFile) return

    setIsImportingAnnotations(true)
    setAnnotationImportResult(null)
    setAnnotationImportError('')

    const formData = new FormData()
    formData.append('file', annotationFile)

    try {
      const response = await fetch(
        `/api/annotations/import?project_id=${projectId}&format=${annotationFormat}&replace_existing=${replaceExisting}`,
        {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }
      )

      const data = await response.json()
      if (!response.ok) {
        const errMsg = data?.detail || data?.message || 'Import failed'
        setAnnotationImportError(errMsg)
        try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
        return
      }

      setAnnotationImportResult(data)
    } catch {
      const errMsg = 'Connection failed'
      setAnnotationImportError(errMsg)
      try { emitAppToast({ message: errMsg, type: 'error' }) } catch {}
    } finally {
      setIsImportingAnnotations(false)
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const doneCount = files.filter((f) => f.status === 'done').length
  const isAllDone = files.length > 0 && doneCount === files.length

  if (project && !canUpload) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Your project role does not allow uploading images.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell max-w-5xl">
      {/* Header */}
      <div className="page-hero mb-10">
        <div className="relative z-10">
        <SectionLabel label="Data Ingestion" className="mb-4" />
        <h1 className="page-title">
          Upload <span className="gradient-text">New Images</span>
        </h1>
        <p className="page-subtitle mt-3">
          Add images to your project. Supported formats: JPEG, PNG, WebP, BMP.
        </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-px mb-8">
        <button
          onClick={() => setActiveTab('raw')}
          className={cn(
            "h-12 px-6 font-bold text-sm border-b-2 transition-all duration-200",
            activeTab === 'raw'
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Raw Images & Labels
        </button>
        <button
          onClick={() => setActiveTab('zip')}
          className={cn(
            "h-12 px-6 font-bold text-sm border-b-2 transition-all duration-200 flex items-center gap-2",
            activeTab === 'zip'
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FolderArchive className="w-4 h-4" />
          ZIP Dataset Archive
        </button>
      </div>

      {activeTab === 'raw' ? (
        <>
          {/* Dropzone */}
          {!isAllDone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden group sm:p-16",
                isDragging
                  ? "border-accent bg-accent/5 scale-[1.01] shadow-xl"
                  : "border-border hover:border-accent/40 hover:bg-accent/[0.02]"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/bmp"
                onChange={handleFileInput}
                className="hidden"
              />

              <div className="flex flex-col items-center relative z-10">
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-accent/5",
                  isDragging ? "bg-accent text-white" : "bg-muted text-muted-foreground group-hover:bg-accent/10 group-hover:text-accent"
                )}>
                  <Upload className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-display text-foreground mb-3">
                  {isDragging ? 'Release to upload' : 'Drag images here'}
                </h3>
                <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  Or <span className="text-accent font-bold">browse files</span> on your computer.
                </p>
                <div className="mt-8 flex items-center gap-6 text-xs font-mono text-muted-foreground/60 uppercase tracking-[0.1em]">
                  <span>Max 20MB / file</span>
                  <div className="w-1 h-1 bg-border rounded-full" />
                  <span>Up to 100 images</span>
                </div>
              </div>

              {/* Background Decorative Rings */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-accent/5 rounded-full -z-0" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-accent/5 rounded-full -z-0" />
            </motion.div>
          )}

          {/* Annotation Import */}
          <section className="mt-8 grid gap-4 rounded-2xl border border-border bg-card/80 p-5 shadow-sm sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  {annotationFormat === 'coco' ? <FileJson className="h-5 w-5" /> : <Table2 className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground">Import annotations</h2>
                  <p className="text-sm text-muted-foreground">
                    Match labels to uploaded images by filename.
                  </p>
                </div>
              </div>

              <input
                ref={annotationInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={handleAnnotationFileInput}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => annotationInputRef.current?.click()}
                className={cn(
                  'flex w-full items-center justify-between gap-4 rounded-xl border border-dashed p-4 text-left transition-colors',
                  annotationFile
                    ? 'border-accent/40 bg-accent/[0.03]'
                    : 'border-border bg-background hover:border-accent/40 hover:bg-accent/[0.02]'
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {annotationFile ? annotationFile.name : 'Choose COCO JSON or CSV file'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    COCO supports bbox and polygon. CSV supports bbox rows.
                  </p>
                </div>
                <FileUp className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotationFormat('coco')}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-semibold transition-colors',
                    annotationFormat === 'coco'
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-background text-foreground hover:border-accent/30'
                  )}
                >
                  COCO JSON
                </button>
                <button
                  type="button"
                  onClick={() => setAnnotationFormat('csv')}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm font-semibold transition-colors',
                    annotationFormat === 'csv'
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-background text-foreground hover:border-accent/30'
                  )}
                >
                  CSV
                </button>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(event) => setReplaceExisting(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border accent-[rgb(var(--accent))]"
                />
                <span>
                  <span className="block font-semibold">Replace existing annotations</span>
                  <span className="text-xs text-muted-foreground">
                    If enabled, matched images are cleared before importing.
                  </span>
                </span>
              </label>

              <Button
                onClick={importAnnotations}
                disabled={!annotationFile || isImportingAnnotations}
                className="h-11 rounded-xl"
              >
                {isImportingAnnotations ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing
                  </>
                ) : (
                  <>
                    Import annotations
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              {annotationImportError && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  {annotationImportError}
                </div>
              )}

              {annotationImportResult && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Imported {annotationImportResult.created} annotations across {annotationImportResult.matched_images} images.
                  {annotationImportResult.created_classes > 0 ? ` Created ${annotationImportResult.created_classes} classes.` : ''}
                  {annotationImportResult.deleted > 0 ? ` Replaced ${annotationImportResult.deleted} old annotations.` : ''}
                  {annotationImportResult.missing_images > 0 ? ` ${annotationImportResult.missing_images} filenames were not found.` : ''}
                </div>
              )}
            </div>
          </section>

          {/* File List & Progress */}
          <AnimatePresence>
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-12"
              >
                <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="icon-gradient h-10 w-10">
                      {isAllDone ? <FileCheck className="w-5 h-5" /> : <FileUp className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">
                        {isAllDone ? 'Upload Complete' : 'Queue Details'}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {doneCount} of {files.length} images processed
                      </p>
                    </div>
                  </div>
                  
                  {!isUploading && !isAllDone && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button onClick={uploadFiles} className="h-10 shadow-accent group sm:px-5">
                        Upload {pendingCount} image{pendingCount !== 1 ? 's' : ''}
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-1.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={clearFiles} className="text-red-500 hover:bg-red-50">
                        Clear All
                      </Button>
                      <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Add More
                      </Button>
                    </div>
                  )}
                </div>

                {/* Overall Progress Bar */}
                {isUploading && (
                  <div className="panel mb-8 p-6">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold text-foreground">Overall Progress</span>
                      <span className="text-sm font-mono text-accent">{Math.round((doneCount / files.length) * 100)}%</span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(doneCount / files.length) * 100}%` }}
                        className="h-full bg-gradient-to-r from-accent to-accent-secondary"
                      />
                    </div>
                  </div>
                )}

                {/* Preview Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.map((f, idx) => (
                    <motion.div
                      key={idx}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "relative flex items-center gap-4 p-3 bg-card border rounded-2xl transition-all duration-300",
                        f.status === 'done' ? "border-emerald-100 bg-emerald-50/20" : "border-border",
                        f.status === 'error' ? "border-red-100 bg-red-50/20" : ""
                      )}
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted flex-shrink-0 relative">
                        {f.previewUrl ? (
                          <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-muted-foreground m-auto" />
                        )}
                        {f.status === 'uploading' && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {f.file.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {(f.file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>

                      <div className="flex-shrink-0 pr-1">
                        {f.status === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        {f.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        {f.status === 'pending' && !isUploading && (
                          <button 
                            onClick={() => removeFile(idx)}
                            className="p-2 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {isAllDone && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-10 p-8 bg-emerald-50/50 border border-emerald-100 rounded-[2rem] text-center"
                  >
                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-emerald-200">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-display text-emerald-900 mb-2">Upload Complete</h3>
                    <p className="text-emerald-700/70 mb-8 max-w-sm mx-auto">
                      All images have been successfully uploaded and added to your project dataset.
                    </p>
                    <div className="flex justify-center gap-4">
                      <Button variant="secondary" onClick={clearFiles}>
                        Upload More
                      </Button>
                      <Link href={`/projects/${projectId}/dataset`}>
                        <Button>Go to Dataset</Button>
                      </Link>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="space-y-6">
          {/* success result card */}
          {zipImportResult && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 bg-emerald-50/50 border border-emerald-100 rounded-[2rem] text-center"
            >
              <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-emerald-200">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-display text-emerald-900 font-bold mb-2">ZIP Dataset Imported!</h3>
              <p className="text-emerald-700/70 mb-6 max-w-md mx-auto">
                Successfully processed and imported **{zipImportResult.images_count}** images, **{zipImportResult.annotations_count}** annotations, and created **{zipImportResult.classes_created}** new class labels in your active dataset.
              </p>
              <div className="flex justify-center gap-4">
                <Button variant="secondary" onClick={() => setZipImportResult(null)}>
                  Import Another ZIP
                </Button>
                <Link href={`/projects/${projectId}/annotate`}>
                  <Button className="shadow-accent">Go to Annotate Workspace</Button>
                </Link>
              </div>
            </motion.div>
          )}

          {!zipImportResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingZip(true); }}
              onDragLeave={() => setIsDraggingZip(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingZip(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  if (file.name.endsWith('.zip')) {
                    if (file.size <= 500 * 1024 * 1024) {
                      setZipFile(file);
                      setZipImportError(null);
                    } else {
                      setZipImportError('File size exceeds 500MB limit.');
                    }
                  } else {
                    setZipImportError('Only ZIP files (.zip) are allowed.');
                  }
                }
              }}
              onClick={() => { if (!isUploadingZip) zipInputRef.current?.click(); }}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden group sm:p-16",
                isDraggingZip
                  ? "border-accent bg-accent/5 scale-[1.01] shadow-xl"
                  : "border-border hover:border-accent/40 hover:bg-accent/[0.02]"
              )}
            >
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size <= 500 * 1024 * 1024) {
                      setZipFile(file);
                      setZipImportError(null);
                    } else {
                      setZipImportError('File size exceeds 500MB limit.');
                    }
                  }
                }}
                className="hidden"
                disabled={isUploadingZip}
              />

              <div className="flex flex-col items-center relative z-10">
                {isUploadingZip ? (
                  <div className="space-y-4 py-4">
                    <div className="relative flex items-center justify-center">
                      <Loader2 className="w-12 h-12 text-accent animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-xl font-display text-foreground font-bold">Processing ZIP Dataset</h3>
                      <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed mt-2 text-sm">
                        Extracting images, uploading to MinIO, and denormalizing YOLO/COCO bounding boxes...
                      </p>
                    </div>
                  </div>
                ) : zipFile ? (
                  <div className="space-y-4">
                    <div className="w-20 h-20 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto text-accent shadow-md border border-accent/20">
                      <FileCheck className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-display text-foreground font-bold line-clamp-1 max-w-sm mx-auto">{zipFile.name}</h3>
                    <p className="text-accent font-semibold font-mono text-sm">{(zipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p className="text-xs text-muted-foreground">Click or drag a new ZIP file to replace this one</p>
                  </div>
                ) : (
                  <>
                    <div className={cn(
                      "w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-accent/5",
                      isDraggingZip ? "bg-accent text-white" : "bg-muted text-muted-foreground group-hover:bg-accent/10 group-hover:text-accent"
                    )}>
                      <Upload className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-display text-foreground mb-3">
                      {isDraggingZip ? 'Release to upload ZIP' : 'Drag ZIP file here'}
                    </h3>
                    <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
                      Or <span className="text-accent font-bold">browse ZIP</span> from your computer.
                    </p>
                    <div className="mt-8 flex items-center gap-6 text-xs font-mono text-muted-foreground/60 uppercase tracking-[0.1em]">
                      <span>YOLO (data.yaml) or COCO (JSON) or RAW</span>
                      <div className="w-1 h-1 bg-border rounded-full" />
                      <span>Max 500MB</span>
                    </div>
                  </>
                )}
              </div>

              {/* Background Decorative Rings */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-accent/5 rounded-full -z-0" />
            </motion.div>
          )}

          {zipFile && !isUploadingZip && !zipImportResult && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end gap-3"
            >
              <Button variant="secondary" onClick={() => setZipFile(null)} className="h-12 px-6 rounded-xl">
                Remove
              </Button>
              <Button onClick={uploadZipFile} className="h-12 px-8 rounded-xl shadow-accent">
                Start ZIP Import
              </Button>
            </motion.div>
          )}

          {zipImportError && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-red-800">Import failed</h4>
                <p className="mt-1 text-red-700/80">{zipImportError}</p>
              </div>
            </div>
          )}

          {/* Guide Card */}
          {!zipImportResult && (
            <div className="rounded-2xl border border-border bg-card/50 p-6 space-y-4">
              <div className="flex items-center gap-2 text-accent font-bold">
                <Info className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">ZIP Import Guide</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When you import a ZIP file, Label Forge will scan and automatically ingest both the images and their annotations, populating them directly into your active annotation project.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-muted/40 border border-border/40">
                  <h4 className="text-xs font-bold text-foreground mb-1">YOLO Format ZIP</h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Must contain a <code className="bg-white px-1 rounded border">data.yaml</code> at the root defining class names, along with <code className="bg-white px-1 rounded border">.txt</code> annotation files matching your image names. Normalized coordinates will be automatically converted back to pixel space.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border/40">
                  <h4 className="text-xs font-bold text-foreground mb-1">COCO Format ZIP</h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Must contain COCO JSON file(s) defining categories and annotations. Image paths in JSON will be matched to ZIP images, and bounding boxes extracted.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border/40">
                  <h4 className="text-xs font-bold text-foreground mb-1">Raw Image ZIP</h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    A flat ZIP of images without labels is also fully supported. All images will be uploaded and set as <code className="bg-white px-1 rounded border">unannotated</code> in your queue.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
