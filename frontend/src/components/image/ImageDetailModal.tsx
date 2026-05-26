'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Image as ImageType, ImageSplit } from '@/types'
import { useReviewImage, useUpdateImageSplit, useDeleteImage } from '@/hooks/useImages'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { 
  X, 
  Edit3, 
  ExternalLink, 
  Info, 
  Database, 
  Maximize2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ImageDetailModalProps {
  image: ImageType | null
  projectId: string
  isOpen: boolean
  onClose: () => void
  onDeleted: () => void
  onUpdated?: (image: ImageType) => void
  canEditSplit?: boolean
  canDelete?: boolean
  canReview?: boolean
}

export default function ImageDetailModal({
  image,
  projectId,
  isOpen,
  onClose,
  onDeleted,
  onUpdated,
  canEditSplit = false,
  canDelete = false,
  canReview = false,
}: ImageDetailModalProps) {
  const router = useRouter()
  const { mutate: updateSplit, isLoading: isUpdating } = useUpdateImageSplit()
  const { mutate: reviewImage, isLoading: isReviewing } = useReviewImage()
  const { mutate: deleteImage, isLoading: isDeleting } = useDeleteImage()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [currentImage, setCurrentImage] = useState<ImageType | null>(image)
  const [reviewComment, setReviewComment] = useState(image?.reviewer_comment || '')

  useEffect(() => {
    setCurrentImage(image)
    setReviewComment(image?.reviewer_comment || '')
  }, [image])

  if (!isOpen || !currentImage) return null

  const handleOpenAnnotator = () => {
    if (!projectId || !currentImage.id) return
    router.push(`/projects/${projectId}/annotate?image=${currentImage.id}`)
  }

  const handleSplitChange = async (newSplit: ImageSplit) => {
    if (!canEditSplit || currentImage.split === newSplit) return
    const updatedImage = await updateSplit(currentImage.id, newSplit)
    if (updatedImage) {
      setCurrentImage(updatedImage)
      onUpdated?.(updatedImage)
    }
  }

  const handleDelete = async () => {
    await deleteImage(currentImage.id)
    onDeleted()
    onClose()
  }

  const handleReview = async (status: 'approved' | 'rejected' | 'needs_review') => {
    if (!canReview) return
    await reviewImage(currentImage.id, {
      status,
      comment: reviewComment.trim() || null,
    })
    onDeleted()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-card border border-border rounded-[2.5rem] shadow-2xl overflow-hidden w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row"
      >
        {/* Left Side: Image Preview */}
        <div className="flex-1 bg-muted/30 relative flex items-center justify-center min-h-[300px] md:min-h-0 overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-[0.03]" />
          <img
            src={currentImage.url}
            alt={currentImage.original_filename}
            loading="eager"
            decoding="async"
            className="relative z-10 w-full h-full object-contain p-8 md:p-12 drop-shadow-2xl"
          />
          <button className="absolute bottom-6 right-6 w-12 h-12 rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center text-foreground hover:scale-110 transition-transform">
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Right Side: Details Panel */}
        <div className="w-full md:w-[380px] bg-card border-l border-border flex flex-col">
          {/* Header */}
          <div className="px-8 py-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
            <div className="min-w-0">
              <SectionLabel label="Image Detail" className="mb-2" />
              <h2 className="text-lg font-bold text-foreground truncate pr-4">{currentImage.original_filename}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
            {/* Metadata Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-accent"><Info className="w-4 h-4" /></span>
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Metadata</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow label="Resolution" value={`${currentImage.width} x ${currentImage.height}px`} />
                <InfoRow label="Uploaded" value={new Date(currentImage.created_at).toLocaleDateString()} />
                <InfoRow label="Format" value={currentImage.filename.split('.').pop()?.toUpperCase() || 'RAW'} />
              </div>
            </div>

            {/* Split Management */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-accent"><Database className="w-4 h-4" /></span>
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dataset Split</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['unassigned', 'train', 'valid', 'test'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSplitChange(s)}
                    disabled={isUpdating || !canEditSplit}
                    className={cn(
                      "px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all",
                      currentImage.split === s
                        ? "bg-accent border-accent text-white shadow-accent"
                        : "bg-white border-border text-muted-foreground hover:border-accent/30 hover:text-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Annotation Status */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-accent"><CheckCircle2 className="w-4 h-4" /></span>
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Current Status</h3>
              </div>
              <Badge 
                variant={['annotated', 'approved', 'needs_review'].includes(currentImage.status) ? 'accent' : 'default'}
                className={cn(
                  "w-full py-4 justify-center text-sm font-bold",
                  currentImage.status === 'approved' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    currentImage.status === 'needs_review' ? "bg-amber-50 text-amber-700 border-amber-100" :
                      currentImage.status === 'rejected' ? "bg-red-50 text-red-600 border-red-100" :
                        currentImage.status === 'annotated' ? "bg-blue-50 text-blue-600 border-blue-100" : ""
                )}
                isPulsing={currentImage.status === 'needs_review'}
              >
                {currentImage.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>

            {canReview && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-accent"><CheckCircle2 className="w-4 h-4" /></span>
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Review Decision</h3>
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="Reviewer comment..."
                  className="h-20 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-accent/20"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleReview('approved')}
                    isLoading={isReviewing}
                    className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleReview('rejected')}
                    disabled={isReviewing}
                    className="h-10 rounded-xl text-red-600"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-8 border-t border-border space-y-3 bg-muted/10">
            <Button 
              onClick={handleOpenAnnotator}
              className="w-full h-14 rounded-2xl shadow-accent group"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Open in Annotator
              <ExternalLink className="w-4 h-4 ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Button>

            <AnimatePresence mode="wait">
              {canDelete && !deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full h-12 text-xs font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-widest"
                >
                  Delete Asset
                </button>
              ) : canDelete ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="space-y-3"
                >
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-[10px] font-bold text-red-700">PERMANENTLY DELETE ASSET?</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1 h-12 rounded-xl text-xs font-bold"
                    >
                      CANCEL
                    </Button>
                    <Button
                      onClick={handleDelete}
                      isLoading={isDeleting}
                      className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 shadow-none text-xs font-bold"
                    >
                      DELETE
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-bold text-foreground">{value}</span>
    </div>
  )
}
