'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useInvitationActions } from '@/hooks/useInvitations';
import { Check, Loader2, X } from 'lucide-react';
import Link from 'next/link';

export default function DeclineWorkspaceInvitationPage() {
  const { token } = useParams();
  const { declineWorkspace } = useInvitationActions();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    const handleDecline = async () => {
      if (hasSubmittedRef.current || !token) return;
      hasSubmittedRef.current = true;

      try {
        await declineWorkspace(token as string);
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.response?.data?.detail || err.message || 'Invitation is invalid or already processed');
      }
    };

    handleDecline();
  }, [token, declineWorkspace]);

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
          <h1 className="font-display text-3xl text-foreground">Workspace invitation declined</h1>
          <Link href="/dashboard" className="mt-8 font-semibold text-muted-foreground transition-colors hover:text-accent">
            Back to dashboard
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center animate-in zoom-in duration-300">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-xl bg-red-500/10">
            <X size={40} className="text-red-500" />
          </div>
          <h1 className="font-display text-3xl text-foreground">Cannot decline workspace invitation</h1>
          <p className="mt-3 max-w-md rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorMsg}
          </p>
          <Link href="/dashboard" className="mt-8 font-semibold text-muted-foreground transition-colors hover:text-accent">
            Back to dashboard
          </Link>
        </div>
      )}
      </div>
    </div>
  );
}
