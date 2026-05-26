"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useProjects, useCreateProject, useDeleteProject } from "@/hooks/useProjects";
import ProjectCard from "@/components/project/ProjectCard";
import CreateProjectModal from "@/components/project/CreateProjectModal";
import { InviteMemberModal } from "@/components/workspace/InviteMemberModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useToast } from "@/components/ui/Toast";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { ProjectCreate, Workspace, WorkspaceInvitationResponse } from "@/types";
import {
  Plus,
  Search,
  FolderOpen,
  Loader2,
  Layers3,
  Images,
  UserPlus,
  Users,
  Crown,
  ShieldCheck,
  UserRound,
  Mail,
  Trash2,
  Eye,
  Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const roleMeta = {
  owner: {
    label: "Owner",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300 dark:bg-amber-500/5",
    icon: Crown,
  },
  admin: {
    label: "Admin",
    className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300 dark:bg-violet-500/5",
    icon: ShieldCheck,
  },
  member: {
    label: "Member",
    className: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300 dark:bg-blue-500/5",
    icon: UserRound,
  },
  viewer: {
    label: "Viewer",
    className: "bg-muted text-muted-foreground border-border",
    icon: Eye,
  },
};

function getInitials(name?: string, email?: string) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { currentWorkspace, setCurrentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const toast = useToast();
  const { projects, isLoading: projectsLoading, refetch } = useProjects(
    currentWorkspace?.id || ""
  );
  const { mutate: createProject, isLoading: isCreating } = useCreateProject();
  const { mutate: deleteProject } = useDeleteProject();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitationResponse[]>([]);
  const [isCancellingInvite, setIsCancellingInvite] = useState<string | null>(null);

  const userRole = useMemo(() => {
    if (!currentWorkspace || !user) return "viewer";
    const member = currentWorkspace.members?.find((workspaceMember) => workspaceMember.user_id === user.id);
    return member?.role || "viewer";
  }, [currentWorkspace, user]);

  const isGuest = currentWorkspace
    ? !currentWorkspace.members?.some((workspaceMember) => workspaceMember.user_id === user?.id)
    : false;
  const currentWorkspaceId = currentWorkspace?.id;
  const canInvite = userRole === "owner" || userRole === "admin";
  const canCreate = userRole === "owner" || userRole === "admin" || userRole === "member";
  const canManageWorkspaceMembers = userRole === "owner" || userRole === "admin";

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const workspaceMembers = useMemo(() => {
    return currentWorkspace?.members || [];
  }, [currentWorkspace]);

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.images += project.image_count || 0;
        acc.annotations += project.annotation_count || 0;
        return acc;
      },
      { images: 0, annotations: 0 }
    );
  }, [projects]);

  const handleCreateProject = async (payload: ProjectCreate) => {
    if (!currentWorkspace) {
      throw new Error("No workspace selected");
    }

    const newProject = await createProject(currentWorkspace.id, payload);
    await refetch();
    return newProject;
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProject(projectId);
    await refetch();
  };

  const handleUpdateWorkspaceRole = async (userId: string, role: "admin" | "member" | "viewer") => {
    if (!currentWorkspace) return;

    setUpdatingMemberId(userId);
    try {
      await apiPatch(`/workspaces/${currentWorkspace.id}/members/${userId}`, { role });
      const updatedWorkspace = await apiGet<Workspace>(`/workspaces/${currentWorkspace.id}`);
      setCurrentWorkspace(updatedWorkspace);
      toast.success("Workspace member role updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update member role");
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveWorkspaceMember = async (userId: string, memberName: string) => {
    if (!currentWorkspace) return;
    if (!window.confirm(`Remove ${memberName} from this workspace?`)) return;

    setRemovingMemberId(userId);
    try {
      await apiDelete(`/workspaces/${currentWorkspace.id}/members/${userId}`);
      const updatedWorkspace = await apiGet<Workspace>(`/workspaces/${currentWorkspace.id}`);
      setCurrentWorkspace(updatedWorkspace);
      toast.success("Workspace member removed");
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove workspace member");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const fetchPendingInvitations = useCallback(async () => {
    if (!currentWorkspaceId || !canManageWorkspaceMembers) {
      setPendingInvitations([]);
      return;
    }
    try {
      const data = await apiGet<WorkspaceInvitationResponse[]>(
        `/workspaces/${currentWorkspaceId}/invitations`,
        { status: "pending" }
      );
      setPendingInvitations(data);
    } catch (error) {
      console.error("Failed to load pending workspace invitations:", error);
      setPendingInvitations([]);
    }
  }, [currentWorkspaceId, canManageWorkspaceMembers]);

  const handleCancelWorkspaceInvitation = async (invitationId: string) => {
    if (!currentWorkspace?.id) return;
    if (!window.confirm("Are you sure you want to cancel this invitation?")) return;

    setIsCancellingInvite(invitationId);
    try {
      await apiDelete(`/workspaces/${currentWorkspace.id}/invitations/${invitationId}`);
      toast.success("Invitation cancelled");
      fetchPendingInvitations();
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel invitation");
    } finally {
      setIsCancellingInvite(null);
    }
  };

  useEffect(() => {
    fetchPendingInvitations();
  }, [fetchPendingInvitations]);

  if (workspaceLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="font-medium text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-2xl font-semibold text-foreground">No workspace selected</h2>
        <p className="max-w-sm text-muted-foreground">
          Please select a workspace from the sidebar to manage your projects.
        </p>
      </div>
    );
  }

  const stats = [
    { label: "Projects", value: projects.length, icon: FolderOpen },
    { label: "Images", value: totals.images, icon: Images },
    { label: "Annotations", value: totals.annotations, icon: Layers3 },
    { label: "Members", value: workspaceMembers.length + pendingInvitations.length, icon: Users },
  ];

  return (
    <main className="page-shell max-w-7xl">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <SectionLabel label="Workspace" />
              <div className="min-w-0">
                <h1 className="break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
                  {currentWorkspace.name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-medium capitalize">
                    <Activity className="h-3.5 w-3.5 text-accent" />
                    {userRole}
                  </span>
                  <span>{projects.length} projects</span>
                  <span className="hidden sm:inline">/</span>
                  <span>{workspaceMembers.length} active members</span>
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto">
              <Button
                onClick={() => setIsModalOpen(true)}
                className="h-11 w-full lg:w-auto"
                disabled={!canCreate}
                title={!canCreate ? "You need to be a formal member to create a project." : ""}
              >
                <Plus className="h-4 w-4" />
                Create Project
              </Button>
              <Button
                onClick={() => setIsInviteModalOpen(true)}
                variant="secondary"
                className="h-11 w-full lg:w-auto"
                disabled={!canInvite}
                title={!canInvite ? "Only workspace administrators can invite members." : ""}
              >
                <UserPlus className="h-4 w-4 text-violet-500" />
                Invite
              </Button>
            </div>
          </div>

          {isGuest && (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <Eye className="mt-0.5 h-4 w-4 shrink-0" />
              <p>You are viewing this workspace in read-only mode. Accept the invitation to start working.</p>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
              </div>
            );
          })}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Projects</h2>
                  <p className="text-sm text-muted-foreground">
                    {filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"} visible
                  </p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-11 rounded-xl border-border bg-background pl-10"
                  />
                </div>
              </div>
            </div>

            {projectsLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-56 animate-pulse rounded-2xl border border-border bg-card shadow-sm" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background">
                  <FolderOpen className="h-7 w-7 text-accent" />
                </div>
                <h2 className="text-xl font-semibold text-foreground">No projects found</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  {searchTerm
                    ? `No projects matching "${searchTerm}".`
                    : "Create your first project to start building annotation datasets."}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (searchTerm) {
                      setSearchTerm("");
                      return;
                    }
                    setIsModalOpen(true);
                  }}
                  className="mt-6"
                  disabled={!searchTerm && !canCreate}
                >
                  {searchTerm ? (
                    <>
                      <Search className="h-4 w-4" />
                      Clear Search
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Project
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDeleteProject}
                    isReadOnly={!canManageWorkspaceMembers}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Users className="h-5 w-5 text-accent" />
                    Members
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {workspaceMembers.length} active, {pendingInvitations.length} pending
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsInviteModalOpen(true)}
                  disabled={!canInvite}
                  title={!canInvite ? "Only workspace admins can invite members" : ""}
                >
                  <UserPlus className="h-4 w-4" />
                  Invite
                </Button>
              </div>

              {workspaceMembers.length === 0 && pendingInvitations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
                  <Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">No members found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workspaceMembers.map((member) => {
                    const meta = roleMeta[member.role as keyof typeof roleMeta] || roleMeta.viewer;
                    const RoleIcon = meta.icon;
                    const displayName = member.full_name || member.email || "Unknown member";

                    return (
                      <div key={member.user_id} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold text-foreground">
                          {getInitials(member.full_name, member.email)}
                          {member.role === "owner" && (
                            <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 p-0.5 text-white">
                              <Crown className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email || "Email unavailable"}</p>
                        </div>

                        {canManageWorkspaceMembers && member.user_id !== user?.id && member.role !== "owner" ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <select
                              value={member.role}
                              onChange={(event) =>
                                handleUpdateWorkspaceRole(
                                  member.user_id,
                                  event.target.value as "admin" | "member" | "viewer"
                                )
                              }
                              disabled={updatingMemberId === member.user_id || removingMemberId === member.user_id}
                              className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
                              title="Edit workspace role"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleRemoveWorkspaceMember(member.user_id, displayName)}
                              disabled={removingMemberId === member.user_id}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-950/20"
                              title="Remove workspace member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${meta.className}`}>
                            <RoleIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {pendingInvitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-3"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-600">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{invitation.invitee_email}</p>
                        <p className="truncate text-xs text-muted-foreground">Invited by {invitation.invited_by_name}</p>
                      </div>
                      <span className="hidden shrink-0 rounded-full border border-amber-500/20 bg-background px-2 py-1 text-xs font-semibold capitalize text-amber-700 dark:text-amber-300 sm:inline-flex">
                        {invitation.role}
                      </span>
                      {canManageWorkspaceMembers && (
                        <button
                          type="button"
                          onClick={() => handleCancelWorkspaceInvitation(invitation.id)}
                          disabled={isCancellingInvite === invitation.id}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-950/20"
                          title="Cancel invitation"
                        >
                          {isCancellingInvite === invitation.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-accent" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateProject}
        isLoading={isCreating}
      />

      <InviteMemberModal
        workspaceId={currentWorkspace.id}
        workspaceName={currentWorkspace.name}
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          fetchPendingInvitations();
        }}
      />
    </main>
  );
}
