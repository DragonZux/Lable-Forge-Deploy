'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { NotificationResponse } from '@/types';
import { useMarkAsRead } from '@/hooks/useNotifications';
import { useInvitationActions } from '@/hooks/useInvitations';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useRouter } from 'next/navigation';
import { Check, X } from 'tabler-icons-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/cn';

interface Props {
  notification: NotificationResponse;
  onClose?: () => void;
  refetch?: () => void;
}

export function NotificationItem({ notification, onClose, refetch }: Props) {
  const router = useRouter();
  const { markAsRead } = useMarkAsRead();
  const { acceptWorkspace, declineWorkspace, acceptProject, declineProject } = useInvitationActions();
  const { switchToWorkspaceById } = useWorkspace();

  const handleAction = async (action: 'accept' | 'decline') => {
    try {
      if (notification.type === 'workspace_invitation_received') {
        const token = notification.token || notification.invitation_id;
        if (action === 'accept') {
          const response = await acceptWorkspace(token);
          const workspaceId = response?.data?.workspace_id || notification.entity_id;
          if (workspaceId) await switchToWorkspaceById(workspaceId);
          router.push('/dashboard');
        }
        else await declineWorkspace(token);
      } else if (notification.type === 'project_invitation_received') {
        const token = notification.token || notification.invitation_id;
        if (action === 'accept') {
          const response = await acceptProject(token);
          const workspaceId = response?.data?.workspace_id;
          if (workspaceId) await switchToWorkspaceById(workspaceId);
          window.dispatchEvent(new Event('project-membership-changed'));
          router.push('/dashboard');
        }
        else await declineProject(token);
      }
      toast.success(action === 'accept' ? 'Invitation accepted' : 'Invitation declined');
      if (refetch) refetch();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    }
  };

  const handleNotificationClick = async () => {
    try {
      await markAsRead(notification.id);
      if (refetch) refetch();
      
      if (onClose) onClose();
    } catch (err) {
      console.error("Failed to process notification click:", err);
    }
  };

  return (
    <div 
      className={cn(
        "p-4 border-b border-border transition-colors cursor-pointer hover:bg-muted/50",
        !notification.is_read ? "bg-accent/5" : ""
      )}
      onClick={handleNotificationClick}
    >
      <div className="flex gap-3">
        {notification.actor_avatar ? (
          <img
            src={notification.actor_avatar}
            alt={notification.actor_name}
            className="h-10 w-10 shrink-0 rounded-full object-cover shadow-sm border border-border"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center text-accent-foreground font-bold shadow-sm">
            {notification.actor_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm transition-colors", !notification.is_read ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {notification.title}
          </p>
          <p className="text-xs text-muted-foreground/80 mt-0.5 line-clamp-2">
            {notification.body}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: vi })}
          </p>

          {notification.action_required && !notification.action_taken && (
            <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleAction('accept')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <Check size={14} /> Accept
              </button>
              <button
                onClick={() => handleAction('decline')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold rounded-lg transition-all border border-border active:scale-95"
              >
                <X size={14} /> Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
