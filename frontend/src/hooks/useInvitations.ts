import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { WorkspaceInvitation } from '@/types';

export function useMyWorkspaceInvitations() {
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<WorkspaceInvitation[]>('/workspaces/invitations/my');
      setInvitations(res.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  return { invitations, loading, fetchInvitations };
}

export function useInvitationActions() {
  const acceptWorkspace = useCallback(async (token: string) => {
    return api.post(`/invitations/workspace/${token}/accept`);
  }, []);

  const declineWorkspace = useCallback(async (token: string) => {
    return api.post(`/invitations/workspace/${token}/decline`);
  }, []);

  const acceptProject = useCallback(async (token: string) => {
    return api.post(`/invitations/project/${token}/accept`);
  }, []);

  const declineProject = useCallback(async (token: string) => {
    return api.post(`/invitations/project/${token}/decline`);
  }, []);

  return { acceptWorkspace, declineWorkspace, acceptProject, declineProject };
}

export function useSendInvitation() {
  const sendWorkspaceInvite = useCallback(async (workspaceId: string, data: { email: string, role: string, message?: string }) => {
    return api.post(`/workspaces/${workspaceId}/invitations`, data);
  }, []);

  const sendProjectInvite = useCallback(async (projectId: string, data: { email: string, role: string, message?: string }) => {
    return api.post(`/projects/${projectId}/invitations`, data);
  }, []);

  return { sendWorkspaceInvite, sendProjectInvite };
}
