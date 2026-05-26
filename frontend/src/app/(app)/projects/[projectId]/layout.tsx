'use client'

import React, { ReactNode } from 'react'
import { useParams } from 'next/navigation'
import ProjectSidebar from '@/components/project/ProjectSidebar'
import { useProject } from '@/hooks/useProjects'
import { motion, easeOut } from 'framer-motion'
import { Box, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui'
import { InviteProjectMemberModal } from '@/components/project/InviteProjectMemberModal'
import { usePermissions } from '@/hooks/usePermissions'

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { project, isLoading, error } = useProject(projectId)
  const { canManageProject } = usePermissions(project)
  const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Loading project details...</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-red-500">
            <Box className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-display text-foreground mb-2">
            {error ? 'Access Denied' : 'Project not found'}
          </h2>
          <p className="text-muted-foreground mb-8">
            {error || 'The project you are looking for does not exist or has been deleted.'}
          </p>
          <Button onClick={() => window.location.href = '/dashboard'}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar - Local project context */}
      <ProjectSidebar />
      
      <main className="flex-1 flex flex-col min-w-0">
        {/* Project Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOut }}
          className="relative z-10 border-b border-border bg-card/85 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-6 lg:px-8"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="min-w-0 truncate text-lg font-display tracking-tight text-foreground sm:text-xl lg:text-2xl">{project.name}</h1>
                <div className="shrink-0 rounded-full border border-accent/20 bg-accent/5 px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-accent sm:px-3 sm:text-[10px] sm:tracking-widest">
                  {project.type.replace('-', ' ')}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {project.image_count} images
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {project.annotation_count} annotations
                </span>
              </div>
            </div>
            
            {canManageProject && (
              <div className="hidden sm:flex items-center gap-3">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setIsInviteModalOpen(true)}
                >
                  <UserPlus className="w-4 h-4 text-violet-500" />
                  Invite
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-transparent">
          {children}
        </div>
      </main>

      {project && (
        <InviteProjectMemberModal
          projectId={project.id}
          projectName={project.name}
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
        />
      )}
    </div>
  )
}
