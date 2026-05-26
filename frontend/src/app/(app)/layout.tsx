'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import AppShell from '@/components/layout/AppShell'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isCheckingAuth } = useAuth()

  useEffect(() => {
    // Redirect to login if not authenticated and not loading
    if (!isCheckingAuth && !user) {
      const query = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : ''
      const next = `${pathname}${query ? `?${query}` : ''}`
      router.push(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [user, isCheckingAuth, router, pathname])

  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  )
}
