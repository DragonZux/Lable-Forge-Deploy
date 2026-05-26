'use client'

import React, { useEffect, useRef } from 'react'
import { Image } from '@/types'
import { cn } from '@/lib/cn'
import { Filter, CheckCircle2, Circle } from 'lucide-react'

interface ImageThumbnailStripProps {
  images: Image[]
  currentImageIndex: number
  onSelectImage: (index: number) => void
  annotations: any[]
  filter: 'all' | 'unannotated'
  onFilterChange: (filter: 'all' | 'unannotated') => void
  width?: number | string
}

export default function ImageThumbnailStrip({
  images,
  currentImageIndex,
  onSelectImage,
  filter,
  onFilterChange,
  width = 208,
}: ImageThumbnailStripProps) {
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const activeThumbnail = thumbnailRefs.current[currentImageIndex]
    activeThumbnail?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, [currentImageIndex])

  return (
    <div 
      style={{ width }} 
      className="bg-card border-r border-border flex flex-col h-full overflow-hidden"
    >
      {/* Header / Filter */}
      <div className="p-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Images</span>
        </div>
        
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as any)}
            className="w-full pl-3 pr-8 py-2 bg-background border border-border rounded-xl text-xs font-semibold text-foreground focus:ring-2 focus:ring-accent focus:border-transparent focus:outline-none appearance-none cursor-pointer shadow-sm"
          >
            <option value="all">All Items</option>
            <option value="unannotated">Unannotated</option>
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Thumbnail List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Circle className="w-8 h-8 text-muted/40 mb-2" />
            <p className="text-xs text-muted-foreground">No images matching filter</p>
          </div>
        ) : (
          images.map((img, idx) => {
            const isActive = idx === currentImageIndex
            const isAnnotated = img.status === 'annotated'
            
            return (
              <button
                key={`${img.id}-${idx}`}
                ref={(element) => {
                  thumbnailRefs.current[idx] = element
                }}
                onClick={() => onSelectImage(idx)}
                className={cn(
                  "w-full group relative transition-all duration-300",
                  isActive ? "scale-[1.02]" : "hover:scale-[1.01]"
                )}
              >
                <div className={cn(
                  "relative aspect-square rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-sm",
                  isActive 
                    ? "border-accent ring-4 ring-accent/10" 
                    : "border-transparent group-hover:border-accent/30"
                )}>
                  <img
                    src={img.url}
                    alt={img.original_filename}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "w-full h-full object-cover transition-transform duration-500",
                      isActive ? "scale-105" : "group-hover:scale-105"
                    )}
                  />
                  
                  {/* Indicators Overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      {isAnnotated ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-white/50" />
                      )}
                    </div>
                    <div className="bg-white/20 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-white font-mono">
                      {idx + 1}
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
