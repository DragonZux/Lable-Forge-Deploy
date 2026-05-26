"use client"

import React, { ReactNode, useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import { useNotificationStream } from '@/hooks/useNotifications'
import { useToast } from '@/components/ui/Toast'
import { usePathname } from 'next/navigation'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { newNotification } = useNotificationStream()
  const toast = useToast()
  const pathname = usePathname()

  useEffect(() => {
    if (/\/projects\/[^/]+\/annotate(?:\/)?$/.test(pathname || '')) {
      setCollapsed(true)
    }
  }, [pathname])

  useEffect(() => {
    if (newNotification) {
      const message = `${newNotification.title}: ${newNotification.body}`
      if (newNotification.type.includes('declined') || newNotification.type.includes('rejected')) {
        toast.warning(message)
      } else if (newNotification.type.includes('accepted') || newNotification.type.includes('approved')) {
        toast.success(message)
      } else {
        toast.info(message)
      }
    }
  }, [newNotification, toast])

  return (
    <div className="h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} />

      {/* Main Content */}
      <main
        className={[
          "h-screen overflow-auto bg-transparent transition-[margin] duration-300 ease-out",
          collapsed ? "ml-20" : "ml-64",
        ].join(" ")}
      >
        {children}
      </main>
    </div>
  )
}
