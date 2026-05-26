'use client';

import React from 'react';
import Link from 'next/link';
import { useNotifications, useMarkAsRead } from '@/hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import { Bell, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: Props) {
  const { notifications, loading, refetch } = useNotifications();
  const { markAllAsRead } = useMarkAsRead();

  return (
    <div className="z-50 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 md:w-96">
      <div className="flex items-center justify-between border-b border-border bg-muted/25 p-4">
        <div className="flex items-center gap-3">
          <div className="icon-gradient h-9 w-9 rounded-xl">
            <Bell className="h-4 w-4" />
          </div>
          <h3 className="font-display text-xl leading-none text-foreground">Notifications</h3>
        </div>
        <button 
          onClick={async () => { 
            try {
              await markAllAsRead(); 
              refetch(); 
            } catch (err) {
              console.error("Failed to mark all as read:", err);
            }
          }}
          className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          Mark all as read
        </button>
      </div>

      <div className="max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-border">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <p className="font-semibold text-foreground">No notifications</p>
            <p className="mt-1 text-sm text-muted-foreground">You are all caught up.</p>
          </div>
        ) : (
          notifications.slice(0, 5).map((notification) => (
            <NotificationItem 
              key={notification.id} 
              notification={notification} 
              onClose={onClose}
              refetch={refetch}
            />
          ))
        )}
      </div>

      <Link 
        href="/notifications" 
        onClick={onClose}
        className="block border-t border-border p-3 text-center text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
      >
        View all
      </Link>
    </div>
  );
}
