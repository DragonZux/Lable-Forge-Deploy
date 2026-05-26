'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import { cn } from '@/lib/cn'
import { useProject } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import {
  Upload,
  Edit3,
  Database,
  Activity,
  Zap,
  Rocket,
  Settings,
  ChevronLeft,
  UsersRound,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'

export default function ProjectSidebar() {
  const pathname = usePathname()
  const params = useParams()
  const projectId = params.projectId as string
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    if (/\/projects\/[^/]+\/annotate(?:\/)?$/.test(pathname || '')) {
      setCollapsed(true)
    }
  }, [pathname])

  const { project } = useProject(projectId)
  const { canUpload, canManageProject, canReview, isGuest } = usePermissions(project)

  const isActive = (path: string) => pathname.includes(path)

  const navItems = [
    { label: 'Upload', path: 'upload', icon: <Upload className="w-4 h-4" />, show: canUpload },
    { label: 'Annotate', path: 'annotate', icon: <Edit3 className="w-4 h-4" />, show: true }, // Everyone can see the page, but canvas is locked
    { label: 'Dataset', path: 'dataset', icon: <Database className="w-4 h-4" />, show: true },
    { label: 'Assignments', path: 'assignments', icon: <UsersRound className="w-4 h-4" />, show: canManageProject },
    { label: 'Review', path: 'review', icon: <ClipboardCheck className="w-4 h-4" />, show: canReview },
    { label: 'Health', path: 'health', icon: <Activity className="w-4 h-4" />, show: canReview },
    { label: 'Train', path: 'train', icon: <Zap className="w-4 h-4" />, show: canReview },
    { label: 'Deploy', path: 'deploy', icon: <Rocket className="w-4 h-4" />, show: !isGuest },
    { label: 'Settings', path: 'settings', icon: <Settings className="w-4 h-4" />, show: canManageProject },
  ].filter(item => item.show)

  return (
    <aside
      className={cn(
        "bg-card border-r border-border flex flex-col pt-4 overflow-hidden transition-[width] duration-300 ease-out",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className={cn("mb-5 flex items-center gap-2", collapsed ? "flex-col px-3" : "px-4")}>
        <Link
          href="/dashboard"
          className={cn(
            "flex min-w-0 items-center gap-2 text-xs font-bold text-muted-foreground hover:text-accent transition-colors group",
            collapsed ? "h-10 w-10 justify-center rounded-xl border border-border bg-background" : "h-9 flex-1"
          )}
          title="Back to Dashboard"
        >
          <ChevronLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
          {!collapsed && <span className="truncate">BACK TO DASHBOARD</span>}
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-all hover:border-accent/30 hover:bg-muted/50 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/20 active:scale-95"
          aria-label={collapsed ? "Expand project sidebar" : "Collapse project sidebar"}
          title={collapsed ? "Expand project sidebar" : "Collapse project sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        <div className={cn("mb-2", collapsed ? "sr-only" : "px-3")}>
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
            Project Management
          </span>
        </div>

        {navItems.map((item) => {
          const href = `/projects/${projectId}/${item.path}`
          const active = isActive(item.path)

          return (
            <Link
              key={item.path}
              href={href}
              title={item.label}
              className={cn(
                "flex items-center rounded-xl transition-all duration-200 group relative",
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5",
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <span className={cn("transition-transform group-hover:scale-110", active && "text-accent")}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className={cn("text-sm font-medium", active ? "font-semibold" : "font-medium")}>
                  {item.label}
                </span>
              )}
              {active && (
                <div className="absolute left-0 w-1 h-5 bg-accent rounded-r-full" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Optional: Project Context Footer */}
      <div className={cn("mt-auto border-t border-border bg-muted/10", collapsed ? "p-3" : "p-4")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}>
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-accent" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-[10px] font-bold text-foreground uppercase tracking-wider leading-none mb-1">Status</p>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-medium text-muted-foreground">Local Development</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
