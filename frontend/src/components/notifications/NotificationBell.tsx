'use client';

import React, { useState } from 'react';
import { Bell } from 'tabler-icons-react';
import { useUnreadCount } from '@/hooks/useNotifications';
import { NotificationDropdown } from './NotificationDropdown';

export function NotificationBell() {
  const { count } = useUnreadCount();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-accent focus-ring"
        id="notification-bell"
      >
        <Bell size={24} />
        {count > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-2">
            <NotificationDropdown onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
