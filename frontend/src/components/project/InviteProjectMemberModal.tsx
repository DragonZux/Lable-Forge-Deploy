'use client';

import React, { useState } from 'react';
import { useSendInvitation } from '@/hooks/useInvitations';
import { Mail, MessageSquare, Shield, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Modal, Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

interface Props {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

const ROLES = [
  { id: 'admin', label: 'Admin', desc: 'Full control over project and members' },
  { id: 'annotator', label: 'Annotator', desc: 'Can upload images and annotate' },
  { id: 'reviewer', label: 'Reviewer', desc: 'Can review datasets, health, training, and model tests' },
  { id: 'viewer', label: 'Viewer', desc: 'Can view project data only' },
];

export function InviteProjectMemberModal({ projectId, projectName, isOpen, onClose }: Props) {
  const { sendProjectInvite } = useSendInvitation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('annotator');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter an email address');

    try {
      setLoading(true);
      await sendProjectInvite(projectId, { email, role, message });
      setSuccess(true);
      toast.success(`Invitation sent to ${email}`);
      setTimeout(() => {
        setSuccess(false);
        setEmail('');
        onClose();
      }, 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite to Project"
      size="lg"
    >
      <div className="space-y-6 pt-2">
        <p className="text-muted-foreground text-sm">
          Invite collaborator to project <span className="text-accent font-semibold">{projectName}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-2">
              <Mail size={14} className="text-accent" /> Email Address
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="h-12"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-2">
              <Shield size={14} className="text-accent" /> Role
            </label>
            <div className="grid grid-cols-1 gap-3">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "flex flex-col p-4 rounded-xl border transition-all text-left",
                    role === r.id 
                      ? "bg-accent/5 border-accent ring-1 ring-accent" 
                      : "bg-muted/20 border-border hover:border-accent/30 hover:bg-muted/40"
                  )}
                >
                  <span className={cn(
                    "text-sm font-semibold",
                    role === r.id ? "text-accent" : "text-foreground"
                  )}>
                    {r.label}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1 flex items-center gap-2">
              <MessageSquare size={14} className="text-accent" /> Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hi, join us on this project..."
              rows={3}
              className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none placeholder:text-muted-foreground/50 text-sm"
            />
          </div>

          <Button
            type="submit"
            isLoading={loading}
            className="w-full h-14"
          >
            {success ? (
              <><Check size={20} /> Invitation Sent</>
            ) : (
              'Send Invitation'
            )}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
