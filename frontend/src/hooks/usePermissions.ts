import { useAuth } from './useAuth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ProjectResponse } from '@/types';

export type ProjectRole = 'admin' | 'annotator' | 'reviewer' | 'viewer' | 'guest';

/**
 * Hook to determine the current user's role in a specific project.
 */
export function useProjectRole(project: ProjectResponse | null) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  if (!project || !user) return 'guest';

  // 1. Check project members list first (explicit role)
  const pMember = project.members?.find(m => m.user_id === user.id);

  // Workspace role only applies to projects that belong to that workspace.
  const isProjectInCurrentWorkspace = currentWorkspace?.id === project.workspace_id;
  const wsMember = isProjectInCurrentWorkspace
    ? currentWorkspace?.members?.find(m => m.user_id === user.id)
    : null;

  if (
    wsMember?.role === 'owner' ||
    wsMember?.role === 'admin' ||
    pMember?.role === 'owner' ||
    pMember?.role === 'admin'
  ) {
    return 'admin';
  }

  if (pMember?.role === 'annotator') {
    return 'annotator';
  }

  if (pMember?.role === 'reviewer') {
    return 'reviewer';
  }

  if (pMember?.role === 'viewer' || wsMember) {
    return 'viewer';
  }

  return 'guest';
}

/**
 * Hook to get simplified permission flags for the UI.
 */
export function usePermissions(project: ProjectResponse | null) {
  const role = useProjectRole(project);

  return {
    role,
    canAnnotate: role === 'admin' || role === 'annotator',
    canUpload: role === 'admin' || role === 'annotator',
    canManageProject: role === 'admin',
    canDelete: role === 'admin',
    canReview: role === 'admin' || role === 'reviewer',
    isReadOnly: role === 'reviewer' || role === 'viewer' || role === 'guest',
    isGuest: role === 'guest'
  };
}
