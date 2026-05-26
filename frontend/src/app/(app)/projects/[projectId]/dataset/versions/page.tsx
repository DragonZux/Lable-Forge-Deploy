'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useDatasetVersions } from '@/hooks/useDatasetVersions'
import CreateVersionModal from '@/components/dataset/CreateVersionModal'
import VersionCard from '@/components/dataset/VersionCard'
import { Button } from '@/components/ui'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { GitBranch, PackagePlus } from 'lucide-react'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'

export default function DatasetVersionsPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { project } = useProject(projectId)
  const { canAnnotate, canManageProject, canReview } = usePermissions(project)

  const { versions, isLoading, fetchVersions } = useDatasetVersions(projectId)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleCreateSuccess = () => {
    setShowModal(false)
    fetchVersions()
  }

  return (
    <div className="page-shell max-w-5xl">
      <div className="page-hero mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="relative z-10">
          <SectionLabel label="Dataset Releases" className="mb-4" />
          <h1 className="page-title">
            Dataset <span className="gradient-text">Versions</span>
          </h1>
          <p className="page-subtitle mt-3">Manage and export different versions of your dataset</p>
        </div>
        {canAnnotate && (
          <Button onClick={() => setShowModal(true)} className="relative z-10 h-12 px-5">
            <PackagePlus className="h-4 w-4" />
            Generate New Version
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-muted-foreground">Loading versions...</div>
        </div>
      ) : versions.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center border-dashed py-14 text-center">
          <div className="icon-gradient mb-5 h-14 w-14 rounded-2xl">
            <GitBranch className="h-6 w-6" />
          </div>
          <p className="mb-2 font-semibold text-foreground">No versions yet</p>
          <p className="mb-5 text-sm text-muted-foreground">
            Create your first dataset version to organize and export images
          </p>
          {canAnnotate && (
            <Button onClick={() => setShowModal(true)} size="sm">
              Create First Version
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {versions.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              projectId={projectId}
              onVersionsChange={fetchVersions}
              canExport={canReview}
              canTrain={canManageProject}
            />
          ))}
        </div>
      )}

      {showModal && canAnnotate && (
        <CreateVersionModal
          projectId={projectId}
          onClose={() => setShowModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  )
}
