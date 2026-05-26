'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useInvitationActions } from '@/hooks/useInvitations';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AcceptWorkspaceInvitationPage() {
  const { token } = useParams();
  const router = useRouter();
  const { acceptWorkspace } = useInvitationActions();
  const { switchToWorkspaceById } = useWorkspace();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    const handleAccept = async () => {
      if (hasSubmittedRef.current || !token) return;
      hasSubmittedRef.current = true;

      try {
        const response = await acceptWorkspace(token as string);
        const workspaceId = response?.data?.workspace_id;
        if (workspaceId) {
          await switchToWorkspaceById(workspaceId);
        }
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.response?.data?.detail || 'The invitation is invalid or has expired');
      }
    };
    handleAccept();
  }, [token, acceptWorkspace, switchToWorkspaceById]);

  return (
    <div className="page-shell flex min-h-[70vh] items-center justify-center">
      <div className="panel-soft w-full max-w-lg p-8 text-center">
      {status === 'loading' && (
        <div className="flex flex-col items-center">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-accent" />
          <h1 className="font-display text-2xl text-foreground">Processing invitation...</h1>
          <p className="mt-2 text-muted-foreground">Please wait a moment.</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center animate-in zoom-in duration-300">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-xl bg-emerald-500/10">
            <Check size={40} className="text-green-500" />
          </div>
          <h1 className="font-display text-3xl text-foreground">Joined successfully!</h1>
          <p className="mt-2 max-w-md text-muted-foreground">
            You are now a member of this workspace.
            You can start working with your team.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-8 rounded-xl bg-gradient-to-r from-accent to-accent-secondary px-6 py-3 font-bold text-accent-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-accent"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center animate-in zoom-in duration-300">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-xl bg-red-500/10">
            <X size={40} className="text-red-500" />
          </div>
          <h1 className="font-display text-3xl text-foreground">Cannot join</h1>
          <p className="mt-3 max-w-md rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </p>
          <Link
            href="/dashboard"
            className="mt-8 font-semibold text-muted-foreground transition-colors hover:text-accent"
          >
            Back to home
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}
