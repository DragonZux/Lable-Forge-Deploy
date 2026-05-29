'use client'

import React, { useState, useMemo } from 'react'
import { useCreateDatasetVersion } from '@/hooks/useDatasetVersions'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Badge } from '@/components/ui/Badge'
import { 
  X, 
  Database, 
  Wand2, 
  Settings2, 
  ArrowRight, 
  ChevronLeft,
  CheckCircle2,
  Info
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'

interface CreateVersionModalProps {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

export default function CreateVersionModal({
  projectId,
  onClose,
  onSuccess,
}: CreateVersionModalProps) {
  const [step, setStep] = useState<'split' | 'config'>('split')
  const { createVersion, isLoading, error } = useCreateDatasetVersion(projectId)

  // Split state
  const [trainPercent, setTrainPercent] = useState(70)
  const [validPercent, setValidPercent] = useState(20)

  // Auto-calculate test
  const testPercent = useMemo(
    () => Math.max(0, 100 - trainPercent - validPercent),
    [trainPercent, validPercent]
  )

  // Preprocessing config
  const [preprocessing, setPreprocessing] = useState({
    resize: undefined as number | undefined,
    grayscale: false,
    auto_orient: true,
  })

  // Augmentation config
  const [augmentation, setAugmentation] = useState({
    flip_horizontal: false,
    flip_vertical: false,
    rotation: 0,
    brightness: 0,
    blur: 0,
    noise: 0,
  })

  const handleSplitChange = (value: number, field: 'train' | 'valid') => {
    if (field === 'train') {
      const nextTrainPercent = Math.min(100, Math.max(0, value))
      setTrainPercent(nextTrainPercent)
      setValidPercent((current) => Math.min(current, 100 - nextTrainPercent))
    } else {
      setValidPercent(Math.min(100 - trainPercent, Math.max(0, value)))
    }
  }

  const validSliderFill = trainPercent === 100 ? 0 : (validPercent / (100 - trainPercent)) * 100

  const handleSubmit = async () => {
    try {
      await createVersion({
        preprocessing,
        augmentation,
        train_percent: trainPercent,
        valid_percent: validPercent,
        test_percent: testPercent,
      })
      onSuccess()
    } catch (err) {
      console.error('Failed to create version:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-card sticky top-0 z-10">
          <div>
            <SectionLabel label="Dataset Generation" className="mb-2" />
            <h2 className="text-2xl font-display text-foreground leading-tight">Generate New Version</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {step === 'split' ? (
              <motion.div
                key="split"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-8"
              >
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="icon-gradient h-10 w-10 rounded-xl">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Split Distribution</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Define how your data is divided for training.</p>
                    </div>
                  </div>

                  <div className="space-y-10 rounded-2xl border border-border/50 bg-muted/30 p-6 sm:p-8">
                    {/* Train */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground uppercase tracking-widest">Train</span>
                        <span className="text-xl font-display text-accent">{trainPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={trainPercent}
                        onChange={(e) => handleSplitChange(parseInt(e.target.value), 'train')}
                        className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer accent-accent"
                        style={{
                          background: `linear-gradient(to right, rgb(var(--accent)) 0%, rgb(var(--accent)) ${trainPercent}%, #fff ${trainPercent}%, #fff 100%)`,
                        }}
                      />
                    </div>

                    {/* Valid */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground uppercase tracking-widest">Validation</span>
                        <span className="text-xl font-display text-accent-secondary">{validPercent}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={100 - trainPercent}
                        value={validPercent}
                        onChange={(e) => handleSplitChange(parseInt(e.target.value), 'valid')}
                        className="w-full h-2 bg-white rounded-lg appearance-none cursor-pointer accent-accent-secondary"
                        style={{
                          background: `linear-gradient(to right, rgb(var(--accent-secondary)) 0%, rgb(var(--accent-secondary)) ${
                            validSliderFill
                          }%, #fff ${validSliderFill}%, #fff 100%)`,
                        }}
                      />
                    </div>

                    {/* Test */}
                    <div className="space-y-4 pt-6 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Testing (Auto)</span>
                        <span className="text-xl font-display text-muted-foreground">{testPercent}%</span>
                      </div>
                      <div className="w-full h-2 bg-white rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-muted-foreground/30 transition-all duration-500"
                          style={{ width: `${testPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-accent/5 border border-accent/10 flex items-start gap-4">
                  <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Unassigned images will be randomly distributed according to these percentages. We recommend a 70/20/10 split for most models.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="config"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Preprocessing */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="icon-gradient h-10 w-10 rounded-xl">
                      <Settings2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Preprocessing</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ConfigToggle 
                      label="Auto-Orient" 
                      description="Strip EXIF and rotate images"
                      checked={preprocessing.auto_orient}
                      onChange={(checked) => setPreprocessing({ ...preprocessing, auto_orient: checked })}
                    />
                    <ConfigToggle 
                      label="Grayscale" 
                      description="Convert images to B&W"
                      checked={preprocessing.grayscale}
                      onChange={(checked) => setPreprocessing({ ...preprocessing, grayscale: checked })}
                    />
                  </div>

                  <div className={cn(
                    "rounded-2xl border p-6 transition-all",
                    preprocessing.resize ? "bg-accent/5 border-accent/20" : "bg-muted/30 border-border/50"
                  )}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={preprocessing.resize !== undefined}
                          onChange={(e) => setPreprocessing({ ...preprocessing, resize: e.target.checked ? 640 : undefined })}
                          className="w-5 h-5 rounded-lg border-border text-accent focus:ring-accent"
                        />
                        <span className="text-sm font-bold text-foreground">Resize Images</span>
                      </div>
                      {preprocessing.resize && <Badge variant="accent">{preprocessing.resize}px</Badge>}
                    </div>
                    {preprocessing.resize !== undefined && (
                      <input
                        type="range"
                        min="320"
                        max="1024"
                        step="32"
                        value={preprocessing.resize}
                        onChange={(e) => setPreprocessing({ ...preprocessing, resize: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-white rounded-full appearance-none cursor-pointer accent-accent"
                      />
                    )}
                  </div>
                </div>

                {/* Augmentation */}
                <div className="space-y-6 pt-8 border-t border-border">
                  <div className="flex items-center gap-3">
                    <div className="icon-gradient h-10 w-10 rounded-xl">
                      <Wand2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Augmentation</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ConfigToggle 
                      label="Flip Horizontal" 
                      checked={augmentation.flip_horizontal}
                      onChange={(checked) => setAugmentation({ ...augmentation, flip_horizontal: checked })}
                    />
                    <ConfigToggle 
                      label="Flip Vertical" 
                      checked={augmentation.flip_vertical}
                      onChange={(checked) => setAugmentation({ ...augmentation, flip_vertical: checked })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border/50 bg-muted/30 p-6 sm:p-8">
                    <AugSlider 
                      label="Rotation" 
                      value={augmentation.rotation} 
                      max={45} 
                      unit=" deg"
                      onChange={(v) => setAugmentation({ ...augmentation, rotation: v })}
                    />
                    <AugSlider 
                      label="Brightness" 
                      value={augmentation.brightness} 
                      min={-30} 
                      max={30} 
                      unit="%"
                      onChange={(v) => setAugmentation({ ...augmentation, brightness: v })}
                    />
                    <AugSlider 
                      label="Blur" 
                      value={augmentation.blur} 
                      max={3} 
                      step={0.1} 
                      unit="px"
                      onChange={(v) => setAugmentation({ ...augmentation, blur: v })}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-red-500 rotate-180" />
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-border flex items-center gap-4 bg-card sticky bottom-0 z-10">
          {step === 'config' ? (
            <Button
              variant="secondary"
              onClick={() => setStep('split')}
              className="h-14 px-8 rounded-2xl"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={onClose}
              className="h-14 px-8 rounded-2xl"
            >
              Cancel
            </Button>
          )}

          <Button
            onClick={step === 'split' ? () => setStep('config') : handleSubmit}
            isLoading={isLoading}
            className="flex-1 h-14 rounded-2xl shadow-accent group"
          >
            {step === 'split' ? (
              <>
                Next: Configuration
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            ) : (
              <>
                Generate Version
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

function ConfigToggle({ label, description, checked, onChange }: { label: string, description?: string, checked: boolean, onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex flex-col items-start p-5 rounded-2xl border text-left transition-all",
        checked ? "bg-accent/5 border-accent/20" : "bg-card border-border hover:bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3 mb-1">
        <div className={cn(
          "w-5 h-5 rounded-lg border flex items-center justify-center transition-all",
          checked ? "bg-accent border-accent text-white" : "border-border"
        )}>
          {checked && <CheckCircle2 className="w-3.5 h-3.5" />}
        </div>
        <span className="text-sm font-bold text-foreground">{label}</span>
      </div>
      {description && <p className="text-[10px] text-muted-foreground ml-8">{description}</p>}
    </button>
  )
}

function AugSlider({ label, value, min = 0, max, step = 1, unit, onChange }: any) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
        <span className="text-sm font-display text-accent">{value > 0 ? '+' : ''}{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white rounded-full appearance-none cursor-pointer accent-accent"
      />
    </div>
  )
}
