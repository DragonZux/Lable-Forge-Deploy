'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DatasetVersion } from '@/types'
import { useExportVersion } from '@/hooks/useDatasetVersions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { 
  Download, 
  Zap, 
  Calendar, 
  Database, 
  ChevronDown,
  Settings2,
  Wand2
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface VersionCardProps {
  version: DatasetVersion
  projectId: string
  onVersionsChange: () => void
  canExport?: boolean
  canTrain?: boolean
}

export default function VersionCard({
  version,
  canExport = false,
  canTrain = false,
}: VersionCardProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const router = useRouter()
  const { exportVersion, isLoading: isExporting } = useExportVersion(version.id)

  const handleExport = async (format: string) => {
    try {
      const data = await exportVersion(
        format as 'yolov8' | 'coco' | 'pascal_voc' | 'csv'
      )
      // Download JSON manifest
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `v${version.version_number}-${format}.json`
      a.click()
      URL.revokeObjectURL(url)
      setShowExportMenu(false)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const totalImages =
    version.train_count + version.valid_count + version.test_count

  const handleStartTraining = () => {
    router.push(`/projects/${version.project_id}/train?versionId=${version.id}`)
  }

  return (
    <Card className="overflow-hidden bg-card border-border transition-all hover:shadow-xl hover:-translate-y-1">
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent/5 text-accent flex items-center justify-center shadow-sm border border-accent/10 font-display text-xl">
              {version.version_number}
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground tracking-tight">
                Version {version.version_number}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  {new Date(version.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
            <Badge 
              variant={version.status === 'processing' ? 'default' : 'accent'} 
              className={cn(
                version.status === 'ready' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                version.status === 'processing' ? 'bg-amber-50 text-amber-600 border-amber-100' : ''
              )}
            >
              {version.status === 'processing' ? `Processing ${version.processing_progress}%` : version.status}
            </Badge>

            {canExport && (
              <div className="relative w-full sm:w-48">
                <Button
                  variant="secondary"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={isExporting}
                  className="h-11 w-full rounded-2xl text-sm font-bold group"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isExporting ? 'Exporting...' : 'Export Version'}
                  <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", showExportMenu && "rotate-180")} />
                </Button>
                
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-2 w-full rounded-2xl bg-card border border-border z-20 overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    {['yolov8', 'coco', 'pascal_voc', 'csv'].map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full px-5 py-3 text-left text-xs font-bold text-foreground hover:bg-accent/5 hover:text-accent transition-all uppercase tracking-wider"
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {version.status === 'processing' && (
          <div className="mb-6 h-2 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-500 transition-all duration-500" 
              style={{ width: `${version.processing_progress}%` }}
            />
          </div>
        )}

        {/* Config Summary - Enhanced Section Labels */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.15em]">Preprocessing</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {version.preprocessing.resize && <Badge className="bg-white">Resize: {version.preprocessing.resize}px</Badge>}
              {version.preprocessing.grayscale && <Badge className="bg-white">Grayscale</Badge>}
              {version.preprocessing.auto_orient && <Badge className="bg-white">Auto-Orient</Badge>}
              {!version.preprocessing.resize && !version.preprocessing.grayscale && !version.preprocessing.auto_orient && <span className="text-xs text-muted-foreground italic">None applied</span>}
            </div>
          </div>
          
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[0.15em]">Augmentation</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {version.augmentation.flip_horizontal && <Badge className="bg-white">Flip H</Badge>}
              {version.augmentation.flip_vertical && <Badge className="bg-white">Flip V</Badge>}
              {version.augmentation.rotation > 0 && <Badge className="bg-white">Rotate {version.augmentation.rotation} deg</Badge>}
              {version.augmentation.brightness !== 0 && <Badge className="bg-white">Brightness {version.augmentation.brightness}%</Badge>}
              {version.augmentation.blur > 0 && <Badge className="bg-white">Blur {version.augmentation.blur}px</Badge>}
              {!version.augmentation.flip_horizontal &&
                !version.augmentation.flip_vertical &&
                version.augmentation.rotation === 0 &&
                version.augmentation.brightness === 0 &&
                version.augmentation.blur === 0 && <span className="text-xs text-muted-foreground italic">None applied</span>}
            </div>
          </div>
        </div>

        {/* Split Distribution - Visual Overhaul */}
        <div className="mb-8 p-5 bg-foreground text-background rounded-3xl relative overflow-hidden">
          <div className="absolute inset-0 dot-pattern opacity-[0.03]" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" />
                <span className="text-xs font-bold uppercase tracking-widest">Dataset Split</span>
              </div>
              <span className="text-lg font-display text-accent">{totalImages} <span className="text-[10px] font-sans text-muted-foreground">TOTAL IMAGES</span></span>
            </div>
            
            <div className="space-y-4">
              <SplitProgress 
                label="Train" 
                count={version.train_count} 
                total={totalImages} 
                color="bg-accent" 
              />
              <SplitProgress 
                label="Valid" 
                count={version.valid_count} 
                total={totalImages} 
                color="bg-accent-secondary" 
              />
              <SplitProgress 
                label="Test" 
                count={version.test_count} 
                total={totalImages} 
                color="bg-white" 
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          {canExport && (
          <Button
            className="flex-1 h-14 rounded-2xl shadow-accent group"
            onClick={() => {
              if (version.zip_url) {
                window.open(version.zip_url, '_blank')
              }
            }}
            disabled={!version.zip_url || version.status === 'processing'}
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="text-sm font-bold">Download ZIP</span>
          </Button>
          )}
          
          {canTrain && (
          <Button
            variant="primary"
            className="flex-1 h-14 rounded-2xl shadow-accent group"
            onClick={handleStartTraining}
          >
            <Zap className="w-4 h-4 mr-2 fill-current" />
            <span className="text-sm font-bold">Start Training</span>
          </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function SplitProgress({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-mono font-bold tracking-widest text-muted-foreground">
        <span>{label.toUpperCase()}</span>
        <span>{count} ({Math.round(percentage)}%)</span>
      </div>
      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-1000", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
