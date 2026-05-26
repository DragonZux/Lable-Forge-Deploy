import React, { useState } from "react";
import Link from "next/link";
import { Project } from "@/types";
import { Card } from "@/components/ui/Card";
import {
  MoreVertical,
  Layers,
  Tag,
  Box,
  Square,
  Trash2,
  Edit2,
  Calendar,
  Image as ImageIcon,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { InviteProjectMemberModal } from "./InviteProjectMemberModal";

const projectTypeInfo = {
  "object-detection": {
    icon: <Box className="h-4 w-4" />,
    label: "Detection",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  classification: {
    icon: <Tag className="h-4 w-4" />,
    label: "Classification",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  },
  "instance-segmentation": {
    icon: <Square className="h-4 w-4" />,
    label: "Instance",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  },
  "semantic-segmentation": {
    icon: <Layers className="h-4 w-4" />,
    label: "Semantic",
    className: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  },
};

interface ProjectCardProps {
  project: Project;
  onDelete: (projectId: string) => Promise<void>;
  isReadOnly?: boolean;
}

export default function ProjectCard({ project, onDelete, isReadOnly }: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const handleDelete = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (window.confirm("Are you sure you want to delete this project?")) {
      setIsDeleting(true);
      try {
        await onDelete(project.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const typeKey = project.type as keyof typeof projectTypeInfo;
  const info =
    projectTypeInfo[typeKey] || {
      icon: <Layers className="h-4 w-4" />,
      label: project.type,
      className: "bg-muted text-muted-foreground border-border",
    };

  return (
    <>
      <Link href={`/projects/${project.id}`} className="group block">
        <Card
          className="relative min-h-[224px] overflow-visible border-border/80 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-xl"
          variant="default"
        >
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-accent/[0.035] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="flex h-full flex-col p-4 sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", info.className)}>
                  <span className="shrink-0">{info.icon}</span>
                  <span className="truncate">{info.label}</span>
                </span>
                <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-foreground transition group-hover:text-accent">
                  {project.name}
                </h3>
              </div>

              {!isReadOnly && (
                <div className="relative z-20 shrink-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenuOpen(!menuOpen);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
                    title="Project actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-border bg-card py-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                        >
                          <Edit2 className="h-4 w-4" />
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setMenuOpen(false);
                            setIsInviteModalOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                        >
                          <UserPlus className="h-4 w-4 text-violet-500" />
                          Invite
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4" />
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="relative mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[11px] font-medium">Images</span>
                </div>
                <p className="truncate text-sm font-semibold text-foreground">{project.image_count || 0}</p>
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[11px] font-medium">Labels</span>
                </div>
                <p className="truncate text-sm font-semibold text-foreground">{project.annotation_count || 0}</p>
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[11px] font-medium">Created</span>
                </div>
                <p className="truncate text-sm font-semibold text-foreground">
                  {new Date(project.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </Link>

      <InviteProjectMemberModal
        projectId={project.id}
        projectName={project.name}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </>
  );
}
