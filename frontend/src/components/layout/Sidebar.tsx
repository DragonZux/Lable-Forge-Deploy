"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  Globe,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Sun,
  Moon,
  Plus,
  Edit,
  Trash2
} from "lucide-react";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { useUnreadCount } from "@/hooks/useNotifications";
import { Button, Input, Modal, useToast } from "@/components/ui";
import type { Workspace } from "@/types";


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const {
    currentWorkspace,
    workspaces,
    setCurrentWorkspace,
    createWorkspace,
    updateWorkspaceName,
    deleteWorkspace,
  } = useWorkspace();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [workspaceToRename, setWorkspaceToRename] = useState<Workspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isSubmittingWorkspace, setIsSubmittingWorkspace] = useState(false);
  const toast = useToast();

  const handleOpenCreateModal = () => {
    setNewWorkspaceName("");
    setIsCreateModalOpen(true);
    setWorkspaceDropdownOpen(false);
  };

  const getWorkspaceRole = (workspace: Workspace) => {
    const detailedWorkspace = currentWorkspace?.id === workspace.id ? currentWorkspace : workspace;
    return detailedWorkspace.members?.find((member) => member.user_id === user?.id)?.role;
  };

  const canRenameWorkspace = (workspace: Workspace) => {
    const role = getWorkspaceRole(workspace);
    return workspace.owner_id === user?.id || role === "owner" || role === "admin";
  };

  const canDeleteWorkspace = (workspace: Workspace) => {
    const role = getWorkspaceRole(workspace);
    return workspace.owner_id === user?.id || role === "owner";
  };

  const handleOpenRenameModal = (workspace: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkspaceToRename(workspace);
    setNewWorkspaceName(workspace.name);
    setIsRenameModalOpen(true);
    setWorkspaceDropdownOpen(false);
  };

  const handleOpenDeleteModal = (workspace: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkspaceToDelete(workspace);
    setIsDeleteModalOpen(true);
    setWorkspaceDropdownOpen(false);
  };


  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-border bg-card/95 shadow-sm backdrop-blur transition-[width] duration-300 ease-out",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className={cn("py-6", collapsed ? "px-3" : "px-6")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
          <Link href="/dashboard" className="flex items-center gap-3 group min-w-0">
            <div className="relative w-10 h-10 transition-transform group-hover:scale-105 shrink-0">
              <img 
                src="/logo.png" 
                alt="Label Forge" 
                className="w-full h-full object-contain rounded-xl shadow-accent"
              />
            </div>
            {!collapsed && (
              <span className="text-xl font-display text-foreground tracking-tight truncate">
                Label<span className="gradient-text">Forge</span>
              </span>
            )}
          </Link>

          {!collapsed && (
            <button
              onClick={onToggle}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-all hover:border-accent/30 hover:bg-muted/50 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/20 active:scale-95"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={onToggle}
            className="mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-all hover:border-accent/30 hover:bg-muted/50 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/20 active:scale-95"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className={cn("mb-6", collapsed ? "px-3" : "px-4")}>
        <div className="relative">
          <button
            onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
            className={cn(
              "w-full flex items-center rounded-xl border border-border bg-background shadow-sm transition-all hover:border-accent/30 hover:bg-muted/40",
              collapsed ? "justify-center px-2 py-2.5" : "justify-between px-4 py-2.5",
              workspaceDropdownOpen && "ring-2 ring-accent/20 border-accent/30"
            )}
            title={currentWorkspace?.name || "Select workspace"}
          >
            {collapsed ? (
              <span className="text-sm font-semibold text-foreground truncate">
                {currentWorkspace?.name?.charAt(0) || "W"}
              </span>
            ) : (
              <>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground leading-none mb-1">
                    Workspace
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate w-full text-left">
                    {currentWorkspace?.name || "Select workspace"}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform",
                    workspaceDropdownOpen && "rotate-180"
                  )}
                />
              </>
            )}
          </button>

          {workspaceDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWorkspaceDropdownOpen(false)} />
              <div
                className={cn(
                  "absolute top-full z-50 mt-2 rounded-xl border border-border bg-card py-2 shadow-xl animate-in fade-in zoom-in-95 duration-200",
                  collapsed ? "left-0 w-60" : "left-0 right-0"
                )}
              >
                <div className="px-3 py-1 mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1">
                    Your Workspaces
                  </span>
                </div>
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className={cn(
                      "group mx-2 rounded-lg px-2 py-1.5 text-sm transition-colors flex items-center gap-2",
                      currentWorkspace?.id === ws.id
                        ? "text-accent font-medium bg-accent/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <button
                      onClick={() => {
                        setCurrentWorkspace(ws);
                        setWorkspaceDropdownOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left flex items-center gap-2"
                      title={ws.name}
                    >
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          currentWorkspace?.id === ws.id ? "bg-accent" : "bg-transparent"
                        )}
                      />
                      <span className="truncate">{ws.name}</span>
                    </button>
                    <div className="flex items-center gap-1">
                      {canRenameWorkspace(ws) && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenRenameModal(ws, e)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent"
                          title="Rename workspace"
                          aria-label={`Rename ${ws.name}`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDeleteWorkspace(ws) && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenDeleteModal(ws, e)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          title="Delete workspace"
                          aria-label={`Delete ${ws.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="border-t border-border mt-2 pt-2 px-2">
                  <button
                    onClick={handleOpenCreateModal}
                    className="w-full text-left px-3 py-1.5 text-xs text-accent font-semibold hover:bg-accent/5 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Workspace
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <nav className={cn("flex-1 space-y-1.5 overflow-y-auto", collapsed ? "px-3" : "px-4")}>
        {!collapsed && (
          <div className="px-2 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
              Menu
            </span>
          </div>
        )}
        <NavLink
          href="/dashboard"
          icon={<LayoutDashboard className="w-5 h-5" />}
          label="Dashboard"
          active={isActive("/dashboard")}
          collapsed={collapsed}
        />
        <NavLink
          href="/universe"
          icon={<Globe className="w-5 h-5" />}
          label="Universe"
          active={isActive("/universe")}
          collapsed={collapsed}
        />
      </nav>

      <div className={cn("mt-auto border-t border-border bg-muted/10", collapsed ? "p-3" : "p-4")}>
        <div className="flex flex-col gap-2">
          <NotificationNavLink collapsed={collapsed} />

          {/* Theme Toggle Button */}
          <button
            onClick={() => toggleTheme()}
            className={cn(
              "flex items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 group",
              collapsed ? "justify-center p-2" : "gap-3 p-2"
            )}
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent border border-transparent transition-colors">
              {theme === "light" ? (
                <Moon className="w-5 h-5 transition-transform group-hover:rotate-12" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500 transition-transform group-hover:scale-110" />
              )}
            </div>
            {!collapsed && (
              <span className="text-sm font-medium">
                {theme === "light" ? "Dark Mode" : "Light Mode"}
              </span>
            )}
          </button>

          <Link
            href="/settings"
            className={cn(
              "flex items-center rounded-xl hover:bg-muted/50 transition-colors group",
              collapsed ? "justify-center p-2" : "gap-3 p-2"
            )}
            title={user?.full_name || "User"}
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user?.full_name || "User"}
                className="w-10 h-10 rounded-full object-cover shadow-sm border border-border"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center text-accent-foreground text-sm font-bold shadow-sm">
                {user?.full_name?.charAt(0) || "U"}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                  {user?.full_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            )}
          </Link>

          <button
            onClick={() => logout()}
            className={cn(
              "rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all group",
              collapsed ? "flex items-center justify-center p-2" : "flex items-center gap-3 p-2"
            )}
            title="Sign Out"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent border border-transparent group-hover:border-red-100 transition-colors">
              <LogOut className="w-5 h-5" />
            </div>
            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          </button>
        </div>
      </div>
      {/* Create Workspace Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Workspace"
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newWorkspaceName.trim()) return;
            setIsSubmittingWorkspace(true);
            try {
              await createWorkspace(newWorkspaceName.trim());
              toast.success("Workspace created successfully!");
              setIsCreateModalOpen(false);
              setNewWorkspaceName("");
            } catch (error: any) {
              toast.error(error?.message || "Failed to create workspace");
            } finally {
              setIsSubmittingWorkspace(false);
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground block">
              Workspace Name
            </label>
            <Input
              placeholder="Enter workspace name..."
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
              className="h-10 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmittingWorkspace}
              className="h-10 text-sm font-semibold"
            >
              Create
            </Button>
          </div>
        </form>
      </Modal>

      {/* Rename Workspace Modal */}
      <Modal
        isOpen={isRenameModalOpen}
        onClose={() => {
          setIsRenameModalOpen(false);
          setWorkspaceToRename(null);
        }}
        title="Rename Workspace"
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!workspaceToRename || !newWorkspaceName.trim() || newWorkspaceName.trim() === workspaceToRename.name) {
              setIsRenameModalOpen(false);
              setWorkspaceToRename(null);
              return;
            }
            setIsSubmittingWorkspace(true);
            try {
              await updateWorkspaceName(workspaceToRename.id, newWorkspaceName.trim());
              toast.success("Workspace renamed successfully!");
              setIsRenameModalOpen(false);
              setWorkspaceToRename(null);
              setNewWorkspaceName("");
            } catch (error: any) {
              toast.error(error?.message || "Failed to rename workspace");
            } finally {
              setIsSubmittingWorkspace(false);
            }
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground block">
              New Workspace Name
            </label>
            <Input
              placeholder="Enter new name..."
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsRenameModalOpen(false);
                setWorkspaceToRename(null);
              }}
              className="h-10 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isSubmittingWorkspace}
              className="h-10 text-sm font-semibold"
            >
              Update
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Workspace Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setWorkspaceToDelete(null);
        }}
        title="Delete Workspace"
        size="sm"
      >
        <div className="space-y-4 pt-2">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This will permanently delete <span className="font-semibold">{workspaceToDelete?.name}</span> and all projects, images, annotations, dataset versions, and training jobs inside it.
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setWorkspaceToDelete(null);
              }}
              className="h-10 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isSubmittingWorkspace}
              className="h-10 text-sm font-semibold"
              onClick={async () => {
                if (!workspaceToDelete) return;
                setIsSubmittingWorkspace(true);
                try {
                  await deleteWorkspace(workspaceToDelete.id);
                  toast.success("Workspace deleted successfully!");
                  setIsDeleteModalOpen(false);
                  setWorkspaceToDelete(null);
                } catch (error: any) {
                  toast.error(error?.message || "Failed to delete workspace");
                } finally {
                  setIsSubmittingWorkspace(false);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}

interface NavLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  collapsed?: boolean;
}

function NavLink({ href, icon, label, active, disabled, collapsed = false }: NavLinkProps) {
  if (disabled) {
    return (
      <div
        className={cn(
          "flex items-center rounded-xl text-muted-foreground/40 cursor-not-allowed select-none",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"
        )}
        title={label}
      >
        {icon}
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
        {!collapsed && (
          <span className="ml-auto text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded leading-none">
            SOON
          </span>
        )}
      </div>
    );
  }

  return (
    <Link
      href={href}
      title={label}
      className={cn(
              "group relative flex items-center rounded-xl transition-all duration-200",
              collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5",
        active ? "bg-gradient-to-r from-accent/10 to-accent-secondary/10 text-accent shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active && "text-accent")}>{icon}</span>
      {!collapsed && (
        <span className={cn("text-sm font-medium", active ? "font-semibold" : "font-medium")}>{label}</span>
      )}
      {active && !collapsed && <div className="absolute left-0 w-1 h-6 bg-accent rounded-r-full" />}
    </Link>
  );
}

function NotificationNavLink({ collapsed }: { collapsed: boolean }) {
  const { count } = useUnreadCount();
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const active = pathname.startsWith("/notifications");

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notifications"
        className={cn(
          "group relative flex w-full items-center rounded-xl transition-all duration-200",
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5",
          active || isOpen ? "bg-gradient-to-r from-accent/10 to-accent-secondary/10 text-accent shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <span className={cn("transition-transform group-hover:scale-110 relative", (active || isOpen) && "text-accent")}>
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className={cn(
              "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-card",
              collapsed ? "h-3.5 w-3.5 -top-0.5 -right-0.5" : ""
            )}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        {!collapsed && (
          <span className={cn("text-sm font-medium", (active || isOpen) ? "font-semibold" : "font-medium")}>
            Notifications
          </span>
        )}
        {!collapsed && count > 0 && (
          <span className="ml-auto text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={cn(
            "absolute z-50 animate-in fade-in zoom-in-95 duration-150",
            collapsed ? "left-full ml-2 bottom-0" : "left-full ml-2 bottom-0"
          )}>
            <NotificationDropdown onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
