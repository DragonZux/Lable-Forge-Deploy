"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useCreateProject } from "@/hooks/useProjects";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ProjectType } from "@/types";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Eye,
  Filter,
  Globe2,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Wand2,
} from "lucide-react";

type UniverseTemplate = {
  id: string;
  name: string;
  type: ProjectType;
  category: "Retail" | "Industrial" | "Medical" | "Mobility" | "Content";
  description: string;
  classes: string[];
  sampleCount: string;
  difficulty: "Starter" | "Standard" | "Advanced";
  estimate: string;
  signal: string;
  palette: string;
  accent: string;
};

const projectTypeLabels: Record<ProjectType, string> = {
  "object-detection": "Object Detection",
  classification: "Classification",
  "instance-segmentation": "Instance Segmentation",
  "semantic-segmentation": "Semantic Segmentation",
};

const templates: UniverseTemplate[] = [
  {
    id: "retail-shelf-audit",
    name: "Retail Shelf Audit",
    type: "object-detection",
    category: "Retail",
    description: "Detect SKUs, empty slots, shelf labels, and misplaced items for store operations.",
    classes: ["SKU", "empty_slot", "price_tag", "misplaced_item"],
    sampleCount: "1.2k image plan",
    difficulty: "Standard",
    estimate: "2-3 annotators",
    signal: "Shelf compliance",
    palette: "from-sky-500/20 via-blue-500/10 to-indigo-500/20",
    accent: "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
  },
  {
    id: "factory-safety-zone",
    name: "Factory Safety Zone",
    type: "instance-segmentation",
    category: "Industrial",
    description: "Mark people, helmets, forklifts, and restricted zones with instance-level precision.",
    classes: ["person", "helmet", "forklift", "restricted_zone"],
    sampleCount: "850 image plan",
    difficulty: "Advanced",
    estimate: "review required",
    signal: "PPE and hazard review",
    palette: "from-amber-500/25 via-orange-500/10 to-stone-500/20",
    accent: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  },
  {
    id: "medical-triage-tags",
    name: "Medical Triage Tags",
    type: "classification",
    category: "Medical",
    description: "Classify image batches by triage level before specialist review.",
    classes: ["normal", "review", "urgent", "exclude"],
    sampleCount: "500 image plan",
    difficulty: "Starter",
    estimate: "1 reviewer",
    signal: "Fast screening",
    palette: "from-emerald-500/20 via-teal-500/10 to-cyan-500/20",
    accent: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  },
  {
    id: "road-scene-parsing",
    name: "Road Scene Parsing",
    type: "semantic-segmentation",
    category: "Mobility",
    description: "Segment lanes, sidewalks, vehicles, signs, and road surface regions for mobility data.",
    classes: ["road", "lane", "sidewalk", "vehicle", "sign"],
    sampleCount: "2k image plan",
    difficulty: "Advanced",
    estimate: "QA heavy",
    signal: "Scene understanding",
    palette: "from-violet-500/20 via-fuchsia-500/10 to-slate-500/20",
    accent: "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  },
  {
    id: "content-quality-review",
    name: "Content Quality Review",
    type: "classification",
    category: "Content",
    description: "Sort uploaded creative assets by quality, policy status, and downstream readiness.",
    classes: ["approved", "needs_edit", "policy_review", "duplicate"],
    sampleCount: "700 image plan",
    difficulty: "Starter",
    estimate: "fast pass",
    signal: "Creative readiness",
    palette: "from-rose-500/20 via-pink-500/10 to-orange-500/15",
    accent: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300",
  },
  {
    id: "warehouse-pallet-count",
    name: "Warehouse Pallet Count",
    type: "object-detection",
    category: "Industrial",
    description: "Detect pallets, cartons, labels, and blocked aisles from warehouse camera captures.",
    classes: ["pallet", "carton", "label", "blocked_aisle"],
    sampleCount: "950 image plan",
    difficulty: "Standard",
    estimate: "batch ready",
    signal: "Inventory visibility",
    palette: "from-cyan-500/20 via-blue-500/10 to-lime-500/15",
    accent: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:text-cyan-300",
  },
];

const categories = ["All", "Retail", "Industrial", "Medical", "Mobility", "Content"] as const;

const categoryCounts = categories.reduce<Record<string, number>>((acc, item) => {
  acc[item] = item === "All" ? templates.length : templates.filter((template) => template.category === item).length;
  return acc;
}, {});

export default function UniversePage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const { mutate: createProject, isLoading: isCreating } = useCreateProject();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  const userRole = useMemo(() => {
    if (!currentWorkspace || !user) return "viewer";
    const member = currentWorkspace.members?.find((item) => item.user_id === user.id);
    return member?.role || "viewer";
  }, [currentWorkspace, user]);

  const canCreate = userRole === "owner" || userRole === "admin" || userRole === "member";

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesCategory = category === "All" || template.category === category;
      const matchesQuery =
        !needle ||
        template.name.toLowerCase().includes(needle) ||
        template.description.toLowerCase().includes(needle) ||
        template.signal.toLowerCase().includes(needle) ||
        template.classes.some((className) => className.toLowerCase().includes(needle));

      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const featuredTemplate = filteredTemplates[0] || templates[0];

  const handleUseTemplate = async (template: UniverseTemplate) => {
    if (!currentWorkspace || !canCreate) return;

    setCreatingTemplateId(template.id);
    try {
      const project = await createProject(currentWorkspace.id, {
        name: template.name,
        type: template.type,
        description: `${template.description} Starter classes: ${template.classes.join(", ")}.`,
      });

      toast.success("Universe template added to your workspace");
      router.push(`/projects/${project.id}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create project from template");
    } finally {
      setCreatingTemplateId(null);
    }
  };

  if (workspaceLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="font-medium text-muted-foreground">Loading universe...</p>
      </div>
    );
  }

  return (
    <main className="page-shell max-w-7xl">
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgb(var(--accent)/0.16),transparent_23rem),radial-gradient(circle_at_88%_10%,rgb(var(--accent-secondary)/0.12),transparent_20rem)]" />
        <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="flex min-h-[390px] flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div className="space-y-5">
              <SectionLabel label="Universe" isPulsing className="bg-background/70 backdrop-blur" />
              <div className="max-w-3xl space-y-4">
                <h1 className="text-2xl font-display leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-6xl">
                  Launch a labeling workflow without starting from zero.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Pick a production-shaped blueprint with class presets, scope guidance, and QA expectations already
                  wired for your workspace.
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricTile icon={<Boxes className="h-5 w-5" />} label="Blueprints" value={templates.length.toString()} />
              <MetricTile icon={<Tag className="h-5 w-5" />} label="Class presets" value="25+" />
              <MetricTile icon={<ImageIcon className="h-5 w-5" />} label="Use cases" value="5" />
              <MetricTile icon={<CheckCircle2 className="h-5 w-5" />} label="Create flow" value="1 click" />
            </div>
          </div>

          <div className="relative border-t border-border bg-muted/30 p-4 sm:p-6 lg:border-l lg:border-t-0">
            <div className="h-full rounded-2xl border border-border bg-background/80 p-4 shadow-sm backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Featured blueprint
                  </p>
                  <h2 className="mt-1 text-xl font-display text-foreground">{featuredTemplate.name}</h2>
                </div>
                <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", featuredTemplate.accent)}>
                  {featuredTemplate.category}
                </span>
              </div>
              <BlueprintPreview template={featuredTemplate} large />
              <div className="mt-4 grid grid-cols-3 gap-2">
                <TemplateFact label="Type" value={projectTypeLabels[featuredTemplate.type]} compact />
                <TemplateFact label="Scope" value={featuredTemplate.sampleCount} compact />
                <TemplateFact label="Effort" value={featuredTemplate.estimate} compact />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sticky top-4 z-20 mb-7 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur-md sm:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-lg">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates, signals, or class names"
              className="h-12 rounded-xl border-border bg-background pl-11 shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition",
                  category === item
                    ? "border-accent bg-accent text-accent-foreground shadow-accent"
                    : "border-border bg-background text-muted-foreground hover:border-accent/30 hover:text-foreground"
                )}
              >
                <span>{item}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    category === item ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {categoryCounts[item]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {!currentWorkspace ? (
        <EmptyUniverse
          icon={<Globe2 className="h-10 w-10 text-accent" />}
          title="Select a workspace first"
          body="Universe templates need a destination workspace before they can create projects."
        />
      ) : filteredTemplates.length === 0 ? (
        <EmptyUniverse
          icon={<Search className="h-10 w-10 text-accent" />}
          title="No matching templates"
          body="Try another category or search for a class name like vehicle, label, road, or review."
        >
          <Button
            variant="secondary"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Clear filters
          </Button>
        </EmptyUniverse>
      ) : (
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {filteredTemplates.map((template, index) => (
            <article
              key={template.id}
              className={cn(
                "group relative flex min-h-[410px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-xl",
                index === 0 && filteredTemplates.length > 1 ? "xl:col-span-2" : ""
              )}
            >
              <BlueprintPreview template={template} large={index === 0 && filteredTemplates.length > 1} />

              <div className="flex flex-1 flex-col justify-between p-5 sm:p-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", template.accent)}>
                          {template.category}
                        </span>
                        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {template.difficulty}
                        </span>
                      </div>
                      <h2 className="text-2xl font-display leading-tight text-foreground">{template.name}</h2>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
                    </div>
                    <TemplateIcon type={template.type} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <TemplateFact label="Type" value={projectTypeLabels[template.type]} />
                    <TemplateFact label="Scope" value={template.sampleCount} />
                    <TemplateFact label="Effort" value={template.estimate} />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Starter classes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {template.classes.map((className) => (
                        <span
                          key={className}
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                        >
                          {className}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-accent" />
                    Creates in {currentWorkspace.name}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                    disabled={!canCreate || isCreating}
                    isLoading={creatingTemplateId === template.id}
                    title={!canCreate ? "You need member access to create projects" : ""}
                  >
                    Use template
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {currentWorkspace && !canCreate && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          <Eye className="h-5 w-5 shrink-0 text-accent" />
          Your current role can browse Universe templates, but cannot create projects in this workspace.
        </div>
      )}
    </main>
  );
}

function MetricTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/75 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">{icon}</div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-display text-foreground">{value}</p>
    </div>
  );
}

function TemplateIcon({ type }: { type: ProjectType }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-accent shadow-sm">
      {type === "classification" ? (
        <Tag className="h-5 w-5" />
      ) : type === "object-detection" ? (
        <Boxes className="h-5 w-5" />
      ) : type === "semantic-segmentation" ? (
        <Layers3 className="h-5 w-5" />
      ) : (
        <Wand2 className="h-5 w-5" />
      )}
    </div>
  );
}

function BlueprintPreview({ template, large = false }: { template: UniverseTemplate; large?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br", template.palette, large ? "h-56" : "h-44")}>
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgb(var(--foreground)/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--foreground)/0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute left-5 top-5 rounded-xl border border-white/30 bg-background/70 px-3 py-2 shadow-sm backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Signal</p>
        <p className="text-sm font-semibold text-foreground">{template.signal}</p>
      </div>
      <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-xl border border-white/30 bg-background/75 px-3 py-2 shadow-sm backdrop-blur">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <span className="text-xs font-semibold text-foreground">QA preset</span>
      </div>
      <PreviewBoxes template={template} />
    </div>
  );
}

function PreviewBoxes({ template }: { template: UniverseTemplate }) {
  if (template.type === "classification") {
    return (
      <div className="absolute left-6 right-6 top-24 grid grid-cols-2 gap-3">
        {template.classes.slice(0, 4).map((item, index) => (
          <div
            key={item}
            className={cn(
              "rounded-xl border bg-background/75 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur",
              index === 0 ? "border-emerald-400/50" : "border-white/30"
            )}
          >
            {item}
          </div>
        ))}
      </div>
    );
  }

  if (template.type === "semantic-segmentation") {
    return (
      <>
        <div className="absolute bottom-0 left-0 h-20 w-2/3 rounded-tr-[4rem] bg-accent/20" />
        <div className="absolute bottom-0 right-0 h-28 w-2/5 rounded-tl-[5rem] bg-foreground/10" />
        <div className="absolute left-[34%] top-[42%] h-16 w-28 -rotate-6 rounded-[2rem] border border-white/50 bg-background/45" />
        <div className="absolute left-[58%] top-[34%] h-10 w-16 rotate-3 rounded-xl border border-white/60 bg-background/60" />
      </>
    );
  }

  return (
    <>
      <div className="absolute left-[18%] top-[42%] h-16 w-24 rounded-xl border-2 border-white/80 bg-background/20 shadow-sm" />
      <div className="absolute left-[52%] top-[32%] h-20 w-28 rounded-xl border-2 border-accent/70 bg-background/20 shadow-sm" />
      <div className="absolute left-[42%] top-[62%] h-12 w-20 rounded-xl border-2 border-emerald-400/70 bg-background/20 shadow-sm" />
      {template.type === "instance-segmentation" && (
        <div className="absolute left-[24%] top-[25%] h-24 w-14 rounded-full border-2 border-amber-300/80 bg-background/20 shadow-sm" />
      )}
    </>
  );
}

function TemplateFact({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background/80", compact ? "p-2.5" : "p-3")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function EmptyUniverse({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">{icon}</div>
      <h2 className="mb-2 text-2xl font-display text-foreground">{title}</h2>
      <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      {children}
    </section>
  );
}
