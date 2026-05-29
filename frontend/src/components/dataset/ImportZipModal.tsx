'use client'

import React, { useState, useRef, useCallback } from 'react'
import { useImportDatasetVersion } from '@/hooks/useDatasetVersions'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Badge } from '@/components/ui/Badge'
import { 
  X, 
  UploadCloud, 
  FileArchive, 
  CheckCircle2, 
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ImportZipModalProps {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

export default function ImportZipModal({
  projectId,
  onClose,
  onSuccess,
}: ImportZipModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { importVersion, isLoading, error } = useImportDatasetVersion(projectId)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true)
    } else if (e.type === "dragleave") {
      setIsDragActive(false)
    }
  }, [])

  const processFile = (file: File) => {
    setUploadError(null)
    if (!file.name.endsWith('.zip')) {
      setUploadError('Only ZIP files (.zip) are supported.')
      setSelectedFile(null)
      return
    }
    // Limit to 500MB for safe upload
    if (file.size > 500 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size allowed is 500MB.')
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleSubmit = async () => {
    if (!selectedFile) return
    try {
      await importVersion(selectedFile)
      onSuccess()
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-card sticky top-0 z-10">
          <div>
            <SectionLabel label="Dataset Management" className="mb-2" />
            <h2 className="text-2xl font-display text-foreground leading-tight">Import ZIP Dataset</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="space-y-6">
            {/* Drag & Drop Area */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "relative group flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-10 px-6 text-center transition-all cursor-pointer",
                isDragActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/10",
                selectedFile && "border-emerald-500/50 bg-emerald-500/[0.02]"
              )}
              onClick={isLoading ? undefined : handleButtonClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleChange}
                disabled={isLoading}
              />

              {isLoading ? (
                <div className="space-y-4 py-4">
                  <div className="relative flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-accent animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Processing and Uploading ZIP...</p>
                    <p className="text-xs text-muted-foreground mt-1">This might take a moment depending on the dataset size.</p>
                  </div>
                </div>
              ) : selectedFile ? (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-sm">
                    <FileArchive className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground line-clamp-1 max-w-xs mx-auto">{selectedFile.name}</h4>
                    <p className="text-xs text-emerald-500 font-medium mt-1">{formatBytes(selectedFile.size)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Click or drag a new ZIP file to replace this one</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-accent/5 text-accent flex items-center justify-center mx-auto border border-accent/10 shadow-sm group-hover:scale-105 transition-transform">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Drag and drop your ZIP dataset here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse your computer</p>
                  </div>
                  <Badge className="bg-white border-border/50 text-[10px] uppercase tracking-wider font-bold">Only ZIP format (Max 500MB)</Badge>
                </div>
              )}
            </div>

            {/* Error Message */}
            {(uploadError || error) && (
              <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider">Import Error</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{uploadError || error}</p>
                </div>
              </div>
            )}

            {/* Format Instructions Info */}
            <div className="p-5 rounded-2xl bg-accent/5 border border-accent/10 space-y-3">
              <div className="flex items-center gap-2 text-accent font-bold">
                <Info className="w-4 h-4" />
                <span className="text-xs uppercase tracking-wider">Expected Dataset Structure</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your ZIP file must contain a dataset in standard **YOLO format** with:
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1.5 pl-1">
                <li>
                  <code className="text-accent bg-accent/5 px-1.5 py-0.5 rounded font-mono font-semibold">data.yaml</code> at the root.
                </li>
                <li>
                  Directories for splits e.g., <code className="bg-white border px-1 rounded">train/images</code>, <code className="bg-white border px-1 rounded">valid/images</code>.
                </li>
                <li>
                  Class labels matching files under split directories.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-border flex items-center gap-4 bg-card sticky bottom-0 z-10">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="h-14 px-8 rounded-2xl"
          >
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedFile || isLoading}
            className="flex-1 h-14 rounded-2xl shadow-accent group"
          >
            Import ZIP Dataset
            <CheckCircle2 className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
