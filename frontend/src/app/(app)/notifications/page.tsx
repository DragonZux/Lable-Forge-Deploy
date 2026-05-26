'use client'

import React, { useState } from 'react'
import { useNotifications, useMarkAsRead } from '@/hooks/useNotifications'
import { NotificationItem } from '@/components/notifications/NotificationItem'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Bell, Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'invitations'>('all')
  const { notifications, loading, refetch } = useNotifications(filter === 'unread')
  const { markAllAsRead } = useMarkAsRead()

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'invitations') return notification.type.includes('invitation')
    return true
  })

  return (
    <div className="page-shell max-w-4xl">
      <div className="page-hero mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="relative z-10">
          <SectionLabel label="Activity Center" className="mb-4" />
          <h1 className="page-title">
            Notifications <span className="gradient-text">Inbox</span>
          </h1>
          <p className="page-subtitle mt-3">Manage project invites, workspace updates, and system activity.</p>
        </div>
        <button
          onClick={async () => {
            await markAllAsRead()
            refetch()
          }}
          className="relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:text-foreground hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <Check size={18} />
          Mark all read
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-px">
        {[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread' },
          { id: 'invitations', label: 'Invitations' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={cn(
              'relative px-4 py-2 text-sm font-medium transition-all',
              filter === tab.id ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {filter === tab.id && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-secondary" />
            )}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden p-0">
        {loading && notifications.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-20 text-center text-muted-foreground">
            <Bell size={48} className="mx-auto mb-4 opacity-20" />
            <p>No notifications in this view.</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              refetch={refetch}
            />
          ))
        )}
      </div>
    </div>
  )
}
