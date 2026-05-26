'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTrainingJobs } from '@/hooks/useTrainingJobs'
import { useDeployedModels, useDeployModel } from '@/hooks/useDeploy'
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
  AlertCircle
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

  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [deployError, setDeployError] = useState<string | null>(null)

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
      {canManageProject && deployableJobs.length > 0 && (
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

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-end">
              <div className="space-y-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-[0.15em] ml-1">
                  Select Training Artifact
                </label>
                <div className="relative">
                  <select
                    value={selectedJobId}
                    onChange={(e) => {
                      setSelectedJobId(e.target.value)
                      setDeployError(null)
                    }}
                    className="select-control w-full h-14 pr-12 appearance-none cursor-pointer"
                  >
                    <option value="">Select a trained model...</option>
                    {deployableJobs.map((job) => (
                      <option key={job.id} value={job.id}>
                        Artifact {job.id.slice(-6)} — mAP {(job.map_score * 100).toFixed(1)}% — {new Date(job.finished_at!).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <Button
                size="lg"
                onClick={handleDeploy}
                disabled={!selectedJobId || isDeploying}
                className="h-14 px-10 rounded-2xl shadow-accent group"
              >
                {isDeploying ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Globe className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
                    Activate Endpoint
                  </>
                )}
              </Button>
            </div>

            {deployError && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-red-700">Deployment failed</p>
                  <p className="mt-1 text-sm text-red-700">{deployError}</p>
                </div>
              </div>
            )}
            
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
                <DeployedModelCard model={model} canTestInference={canReview} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
