'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTrainingJobs } from '@/hooks/useTrainingJobs'
import { useDeployedModels, useDeployModel, useImportModel } from '@/hooks/useDeploy'
import DeployedModelCard from '@/components/deploy/DeployedModelCard'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Button } from '@/components/ui/Button'
import { 
  Globe, 
  Rocket, 
  ChevronDown, 
  Terminal, 
  RefreshCw,
  Box,
  AlertCircle,
  UploadCloud,
  FileUp
} from 'lucide-react'
import { motion } from 'framer-motion'
import { TrainingJobResponse } from '@/types'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'

type DeployableTrainingJob = TrainingJobResponse & {
  map_score: number
  finished_at: string
}

export default function DeployPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { project } = useProject(projectId)
  const { canManageProject, canReview, isGuest } = usePermissions(project)

  const { jobs, fetchJobs } = useTrainingJobs(projectId)
  const { models, fetchModels } = useDeployedModels(projectId)
  const { deployModel, isLoading: isDeploying } = useDeployModel(projectId)
  const { importModel, isLoading: isImporting } = useImportModel(projectId)

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [deployError, setDeployError] = useState<string | null>(null)

  // Custom model file upload state
  const [selectedModelFile, setSelectedModelFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (canReview) {
      fetchJobs()
    }
    fetchModels()
  }, [canReview, fetchJobs, fetchModels])

  const completedJobs = jobs.filter((j): j is DeployableTrainingJob => (
    j.status === 'done'
    && j.map_score !== undefined
    && Boolean(j.finished_at)
    && Boolean(
      j.artifact_url?.startsWith('minio://model-artifacts/')
      || j.artifact_url?.startsWith('http://')
      || j.artifact_url?.startsWith('https://')
    )
  ))
  const alreadyDeployed = new Set(models.map((m) => m.training_job_id))
  const deployableJobs = completedJobs.filter(
    (j) => !alreadyDeployed.has(j.id)
  )

  const handleDeploy = async () => {
    if (!selectedJobId) return

    setDeployError(null)
    try {
      await deployModel(selectedJobId)
      await fetchModels()
      setSelectedJobId('')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to deploy model'
      setDeployError(msg)
    }
  }

  const handleImport = async () => {
    if (!selectedModelFile) return

    setImportError(null)
    try {
      await importModel(selectedModelFile)
      await fetchModels()
      setSelectedModelFile(null)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to import model'
      setImportError(msg)
    }
  }

  if (project && isGuest) {
    return (
      <div className="page-shell">
        <div className="panel p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Access denied</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            You do not have access to this project&apos;s deployments.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell max-w-[1400px]">
      {/* Page Header */}
      <div className="page-hero mb-10">
        <div className="relative z-10">
        <SectionLabel label="Model Deployment" className="mb-4" />
        <h1 className="page-title">
          Cloud <span className="gradient-text">Inference</span>
        </h1>
        <p className="page-subtitle mt-3">
          Promote trained models to production and generate scalable API endpoints.
        </p>
        </div>
      </div>

      {/* Deploy Control Panel */}
      {canManageProject && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel-soft relative mb-12 overflow-hidden p-6 sm:p-8"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="icon-gradient h-10 w-10">
                <Rocket className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Deployment Control</h2>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">New Endpoint Activation</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
              
              {/* Left Column: Deploy Trained Model */}
              <div className="flex flex-col justify-between p-6 bg-background/50 border border-border/80 rounded-2xl">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Option 1: Deploy Trained Artifact</h3>
                  </div>
                  
                  {deployableJobs.length === 0 ? (
                    <div className="py-6 px-4 bg-muted/20 border border-dashed border-border rounded-xl text-center">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        No undeployed training artifacts found in this project. Complete a training cycle to enable deployment here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                        Select Training Artifact
                      </label>
                      <div className="relative">
                        <select
                          value={selectedJobId}
                          onChange={(e) => {
                            setSelectedJobId(e.target.value)
                            setDeployError(null)
                          }}
                          className="select-control w-full h-12 pr-12 appearance-none cursor-pointer text-sm"
                        >
                          <option value="">Select a trained model...</option>
                          {deployableJobs.map((job) => (
                            <option key={job.id} value={job.id}>
                              Artifact {job.id.slice(-6)} — mAP {(job.map_score * 100).toFixed(1)}% — {new Date(job.finished_at!).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  {deployError && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <p className="text-xs text-red-700">{deployError}</p>
                    </div>
                  )}
                  <Button
                    size="lg"
                    onClick={handleDeploy}
                    disabled={!selectedJobId || isDeploying}
                    className="w-full h-12 rounded-xl shadow-accent group"
                  >
                    {isDeploying ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                        Activate Endpoint
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Right Column: Import Custom Model File */}
              <div className="flex flex-col justify-between p-6 bg-background/50 border border-border/80 rounded-2xl">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Option 2: Import Custom Weights</h3>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                      Upload YOLO Weights (.pt)
                    </label>
                    <div className="relative border border-dashed border-border bg-muted/10 rounded-xl p-4 text-center transition-all hover:bg-white/40 hover:border-accent/40 cursor-pointer group/upload">
                      <input
                        type="file"
                        accept=".pt"
                        onChange={(e) => {
                          setSelectedModelFile(e.target.files?.[0] || null)
                          setImportError(null)
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center py-2">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-muted-foreground group-hover/upload:text-accent group-hover/upload:scale-110 transition-all mb-2 shadow-sm border border-border/40">
                          <FileUp className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-foreground truncate max-w-full px-2">
                          {selectedModelFile ? selectedModelFile.name : 'Select custom .pt file'}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-widest font-bold">
                          Click or drag file here
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  {importError && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                      <p className="text-xs text-red-700">{importError}</p>
                    </div>
                  )}
                  <Button
                    size="lg"
                    onClick={handleImport}
                    disabled={!selectedModelFile || isImporting}
                    className="w-full h-12 rounded-xl shadow-accent group bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Uploading Weights...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                        Import & Deploy
                      </>
                    )}
                  </Button>
                </div>
              </div>

            </div>

            <div className="mt-8 flex items-center gap-4 rounded-xl border border-accent/15 bg-accent/5 p-4">
              <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-accent shadow-sm">
                <Terminal className="w-4 h-4" />
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed">
                Endpoints are hosted on <span className="font-bold">Edge Inference</span> clusters. Global latency avg &lt; 200ms.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Endpoints Section */}
      <div>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-muted rounded-xl flex items-center justify-center text-muted-foreground">
            <Box className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-[0.2em]">Active Model Endpoints</h2>
        </div>

        {models.length === 0 ? (
          <div className="panel text-center py-24 border-dashed">
            <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Globe className="w-10 h-10 text-muted-foreground opacity-30" />
            </div>
            <h2 className="text-xl font-display text-foreground mb-2">No Active Endpoints</h2>
            <p className="text-muted-foreground max-w-xs mx-auto">
              {deployableJobs.length > 0
                ? 'Promote a trained model above to create your first API endpoint.'
                : 'Complete a training cycle first to enable cloud deployment.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {models.map((model, idx) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
              >
                <DeployedModelCard 
                  model={model} 
                  canTestInference={canReview} 
                  classLabels={project?.class_labels || []} 
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
