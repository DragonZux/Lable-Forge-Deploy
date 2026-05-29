'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Database,
  FileSearch,
  Gauge,
  Images,
  Layers,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useProjectHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/cn'

type CheckTone = 'success' | 'warning' | 'danger'

type AuditCategory =
  | 'duplicate_images'
  | 'small_boxes'
  | 'large_boxes'
  | 'out_of_bounds'
  | 'unused_classes'
  | 'class_split_imbalance'

type AuditCheck = {
  id: AuditCategory
  label: string
  description: string
  count: number
  tone: CheckTone
}

const splitColors: Record<string, string> = {
  train: 'bg-blue-500',
  valid: 'bg-violet-500',
  test: 'bg-emerald-500',
  unassigned: 'bg-slate-400',
}

export default function HealthCheckPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params?.projectId || ''
  const { health, isLoading, error, fetchHealth } = useProjectHealth(projectId)
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchHealth(true)
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const auditChecks = useMemo<AuditCheck[]>(() => {
    if (!health?.validation) return []
    const isClassification = health.project_type === 'classification'

    const checks: AuditCheck[] = [
      {
        id: 'duplicate_images',
        label: 'Duplicate images',
        description: 'Same filename and dimensions registered more than once.',
        count: health.validation.duplicate_images.length,
        tone: health.validation.duplicate_images.length > 0 ? 'warning' : 'success',
      },
    ]

    if (!isClassification) {
      checks.push(
        {
          id: 'small_boxes',
          label: 'Tiny boxes',
          description: 'Annotations that may be too small to train reliably.',
          count: health.validation.small_boxes.length,
          tone: health.validation.small_boxes.length > 0 ? 'warning' : 'success',
        },
        {
          id: 'large_boxes',
          label: 'Oversized boxes',
          description: 'Boxes covering most of the image area.',
          count: health.validation.large_boxes.length,
          tone: health.validation.large_boxes.length > 0 ? 'warning' : 'success',
        },
        {
          id: 'out_of_bounds',
          label: 'Out of bounds',
          description: 'Coordinates drawn outside the image boundary.',
          count: health.validation.out_of_bounds_annotations.length,
          tone: health.validation.out_of_bounds_annotations.length > 0 ? 'danger' : 'success',
        }
      )
    }

    checks.push(
      {
        id: 'unused_classes',
        label: 'Unused classes',
        description: 'Classes defined in settings but not used in labels.',
        count: health.validation.unused_classes.length,
        tone: health.validation.unused_classes.length > 0 ? 'warning' : 'success',
      },
      {
        id: 'class_split_imbalance',
        label: 'Split gaps',
        description: 'Classes missing from one or more dataset splits.',
        count: health.validation.class_split_imbalance.length,
        tone: health.validation.class_split_imbalance.length > 0 ? 'warning' : 'success',
      }
    )

    return checks
  }, [health])

  const score = useMemo(() => {
    if (!health) return 0
    const validation = health.validation
    const isClassification = health.project_type === 'classification'
    const duplicateCount = validation?.duplicate_images.length || 0
    const smallBoxes = isClassification ? 0 : (validation?.small_boxes.length || 0)
    const largeBoxes = isClassification ? 0 : (validation?.large_boxes.length || 0)
    const outOfBounds = isClassification ? 0 : (validation?.out_of_bounds_annotations.length || 0)
    const unusedClasses = validation?.unused_classes.length || 0
    const splitGaps = validation?.class_split_imbalance.length || 0
    const unannotatedPenalty = Math.max(0, 100 - (health.summary.annotated_percent || 0)) * 0.15

    const deductions =
      duplicateCount * 4 +
      smallBoxes * 0.5 +
      largeBoxes * 0.3 +
      outOfBounds * 15 +
      unusedClasses * 5 +
      splitGaps * 4 +
      unannotatedPenalty

    return Math.max(0, Math.min(100, 100 - Math.round(deductions)))
  }, [health])

  const rating = getRating(score)
  const issueCount = auditChecks.reduce((total, item) => total + item.count, 0)
  const criticalCount = auditChecks.filter((item) => item.tone === 'danger').reduce((total, item) => total + item.count, 0)

  if (isLoading && !health) {
    return <HealthSkeleton />
  }

  if (!health) {
    return (
      <div className="page-shell flex min-h-[65vh] items-center justify-center">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Health report unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {error || 'The project health report could not be loaded right now.'}
          </p>
          <Button onClick={() => fetchHealth()} className="mt-6">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  const totalImages = Math.max(health.summary.total_images, 1)
  const splitEntries = Object.entries(health.split_distribution)
  const classMax = Math.max(...health.class_balance.map((item) => item.count), 1)
  const selectedCheck = selectedCategory ? auditChecks.find((item) => item.id === selectedCategory) : null

  return (
    <div className="page-shell space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-emerald-500 to-amber-500" />
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px] lg:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <SectionLabel label="Project Health" />
              <StatusBadge label={rating.label} tone={rating.tone} />
            </div>
            <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              Dataset quality overview
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review annotation coverage, split balance, class distribution, and validation risks before producing a new dataset version or training run.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Open issues" value={issueCount.toLocaleString()} tone={issueCount ? 'warning' : 'success'} />
              <HeroMetric label="Critical issues" value={criticalCount.toLocaleString()} tone={criticalCount ? 'danger' : 'success'} />
              <HeroMetric label="Annotated coverage" value={`${health.summary.annotated_percent}%`} tone={health.summary.annotated_percent >= 80 ? 'success' : 'warning'} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Integrity Score</p>
                <p className={cn('mt-1 text-sm font-semibold', rating.text)}>{rating.message}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                Refresh
              </Button>
            </div>
            <ScoreRing score={score} tone={rating.tone} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Images"
          value={health.summary.total_images.toLocaleString()}
          description="Images registered in this project"
          icon={<Images className="h-5 w-5" />}
        />
        <MetricCard
          label="Annotated Images"
          value={health.summary.annotated_images.toLocaleString()}
          description={`${health.summary.annotated_percent}% of the dataset has labels`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        {health.project_type === 'classification' ? (
          <>
            <MetricCard
              label="Unannotated Images"
              value={health.images_without_annotations.toLocaleString()}
              description="Images that need classification"
              icon={<AlertCircle className="h-5 w-5" />}
            />
            <MetricCard
              label="Total Classes"
              value={health.class_balance.length.toString()}
              description="Active classification classes"
              icon={<Tags className="h-5 w-5" />}
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Total Annotations"
              value={health.summary.total_annotations.toLocaleString()}
              description="Labels saved across all images"
              icon={<Layers className="h-5 w-5" />}
            />
            <MetricCard
              label="Annotation Density"
              value={health.summary.avg_annotations_per_image.toFixed(2)}
              description="Average labels per image"
              icon={<Activity className="h-5 w-5" />}
            />
          </>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Validation Checks" icon={<ShieldCheck className="h-5 w-5" />} action={`${auditChecks.length} checks`}>
          <div className="grid gap-3 md:grid-cols-2">
            {auditChecks.map((check) => (
              <button
                key={check.id}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === check.id ? null : check.id)}
                className={cn(
                  'group rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                  selectedCategory === check.id
                    ? 'border-accent bg-accent/10 ring-2 ring-accent/20'
                    : 'border-border bg-background hover:border-accent/30'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={check.tone} />
                      <p className="text-sm font-bold text-foreground">{check.label}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{check.description}</p>
                  </div>
                  <span className={cn('rounded-lg px-2.5 py-1 text-sm font-black', countToneClass(check.tone))}>
                    {check.count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Dataset Splits" icon={<Database className="h-5 w-5" />}>
          <div className="space-y-5">
            <div className="flex h-4 overflow-hidden rounded-full bg-muted">
              {splitEntries.map(([split, count]) => {
                const width = (count / totalImages) * 100
                if (width <= 0) return null
                return (
                  <div
                    key={split}
                    className={cn('h-full', splitColors[split])}
                    style={{ width: `${width}%` }}
                    title={`${split}: ${Math.round(width)}%`}
                  />
                )
              })}
            </div>

            <div className="space-y-3">
              {splitEntries.map(([split, count]) => {
                const percentage = Math.round((count / totalImages) * 100)
                return (
                  <SplitRow
                    key={split}
                    split={split}
                    count={count}
                    percentage={percentage}
                  />
                )
              })}
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Class Distribution" icon={<Tags className="h-5 w-5" />} action={`${health.class_balance.length} classes`}>
          {health.class_balance.length === 0 ? (
            <EmptyPanel
              icon={<BarChart3 className="h-8 w-8" />}
              title="No annotation classes yet"
              description="Start annotating images to see class balance and dataset coverage."
            />
          ) : (
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {health.class_balance.map((item) => (
                <DistributionRow
                  key={item.name}
                  label={item.name}
                  value={item.count}
                  meta={`${item.percentage}%`}
                  percentage={(item.count / classMax) * 100}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Image Size Distribution" icon={<SlidersHorizontal className="h-5 w-5" />} action={`${health.image_size_distribution.length} buckets`}>
          {health.image_size_distribution.length === 0 ? (
            <EmptyPanel
              icon={<Gauge className="h-8 w-8" />}
              title="No size data"
              description="Upload images to inspect size distribution and dataset consistency."
            />
          ) : (
            <div className="space-y-3">
              {health.image_size_distribution.map((item) => (
                <DistributionRow
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  meta={`${Math.round((item.count / totalImages) * 100)}%`}
                  percentage={(item.count / totalImages) * 100}
                />
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Audit Details" icon={<FileSearch className="h-5 w-5" />} action={selectedCheck?.label || 'Select a check'}>
          <AnimatePresence mode="wait">
            {selectedCategory ? (
              <motion.div
                key={selectedCategory}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <AuditDetails category={selectedCategory} projectId={projectId} health={health} />
              </motion.div>
            ) : (
              <EmptyPanel
                icon={<CircleAlert className="h-8 w-8" />}
                title="Select a validation check"
                description="Choose any check above to see the affected images, classes, and suggested next actions."
              />
            )}
          </AnimatePresence>
        </Panel>

        <Panel title="Recommended Actions" icon={<AlertTriangle className="h-5 w-5" />}>
          <ActionList
            projectId={projectId}
            score={score}
            issueCount={issueCount}
            criticalCount={criticalCount}
            annotatedPercent={health.summary.annotated_percent}
            projectType={health.project_type}
          />
        </Panel>
      </section>
    </div>
  )
}

function getRating(score: number) {
  if (score >= 90) {
    return {
      label: 'Excellent',
      message: 'Ready for training',
      tone: 'success' as CheckTone,
      text: 'text-emerald-600',
    }
  }
  if (score >= 70) {
    return {
      label: 'Healthy',
      message: 'Minor cleanup recommended',
      tone: 'success' as CheckTone,
      text: 'text-blue-600',
    }
  }
  if (score >= 50) {
    return {
      label: 'Needs Review',
      message: 'Resolve warnings before training',
      tone: 'warning' as CheckTone,
      text: 'text-amber-600',
    }
  }
  return {
    label: 'Critical',
    message: 'Fix blocking issues first',
    tone: 'danger' as CheckTone,
    text: 'text-red-600',
  }
}

function ScoreRing({ score, tone }: { score: number; tone: CheckTone }) {
  const circumference = 2 * Math.PI * 44
  const offset = circumference - (score / 100) * circumference
  const stroke = tone === 'danger' ? '#ef4444' : tone === 'warning' ? '#f59e0b' : '#10b981'

  return (
    <div className="mt-6 flex items-center justify-center">
      <div className="relative h-44 w-44">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="44" fill="none" stroke="rgb(var(--muted))" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="44"
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-4xl font-black text-foreground">{score}</p>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">of 100</p>
        </div>
      </div>
    </div>
  )
}

function HeroMetric({ label, value, tone }: { label: string; value: string; tone: CheckTone }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-2xl font-black', toneTextClass(tone))}>{value}</p>
    </div>
  )
}

function MetricCard({ label, value, description, icon }: { label: string; value: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          {icon}
        </div>
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

function Panel({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
            {icon}
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-foreground">{title}</h2>
        </div>
        {action && (
          <span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {action}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function SplitRow({ split, count, percentage }: { split: string; count: number; percentage: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('h-3 w-3 rounded-full', splitColors[split])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold capitalize text-foreground">{split === 'valid' ? 'validation' : split}</p>
          <p className="font-mono text-xs font-bold text-muted-foreground">{count.toLocaleString()} / {percentage}%</p>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full', splitColors[split])} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </div>
  )
}

function DistributionRow({ label, value, meta, percentage }: { label: string; value: number; meta: string; percentage: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-semibold text-foreground">{label}</p>
        <p className="shrink-0 font-mono text-xs font-bold text-muted-foreground">{value.toLocaleString()} / {meta}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, Math.min(100, percentage))}%` }}
          transition={{ duration: 0.5 }}
          className="h-full rounded-full bg-accent"
        />
      </div>
    </div>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: CheckTone }) {
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold', badgeToneClass(tone))}>
      <StatusDot tone={tone} />
      {label}
    </span>
  )
}

function StatusDot({ tone }: { tone: CheckTone }) {
  return <span className={cn('h-2 w-2 rounded-full', tone === 'danger' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500')} />
}

function EmptyPanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/60 p-8 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  )
}

function AuditDetails({ category, projectId, health }: { category: AuditCategory; projectId: string; health: NonNullable<ReturnType<typeof useProjectHealth>['health']> }) {
  const rows = getAuditRows(category, health)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-bold text-foreground">No problems found</p>
            <p className="mt-1 text-xs text-muted-foreground">This validation check passed for the current dataset.</p>
          </div>
        </div>
      </div>
    )
  }

  if (category === 'unused_classes') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row, index) => (
          <div key={index} className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm font-bold text-foreground">{row.name || row.class_name || row.class_id}</p>
            <Link href={`/projects/${projectId}/settings`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
              Open class settings <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    )
  }

  if (category === 'class_split_imbalance') {
    return (
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/70 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3 text-center">Train</th>
              <th className="px-4 py-3 text-center">Valid</th>
              <th className="px-4 py-3 text-center">Test</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-4 py-3 font-semibold text-foreground">{row.class_name}</td>
                <td className="px-4 py-3 text-center font-mono">{row.split_counts?.train || 0}</td>
                <td className="px-4 py-3 text-center font-mono">{row.split_counts?.valid || 0}</td>
                <td className="px-4 py-3 text-center font-mono">{row.split_counts?.test || 0}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/projects/${projectId}/dataset`} className="text-xs font-bold text-accent hover:underline">
                    Rebalance
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/70 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Image</th>
            <th className="px-4 py-3">Class</th>
            <th className="px-4 py-3 text-center">Metric</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {rows.map((row, index) => (
            <tr key={index}>
              <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-foreground">
                {row.filename || row.image_id || 'Unknown image'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.class_name || 'N/A'}</td>
              <td className="px-4 py-3 text-center font-mono text-xs">
                {row.area_percent !== undefined ? `${row.area_percent}%` : row.count ? `${row.count} copies` : 'Flagged'}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/projects/${projectId}/annotate${row.image_id ? `?image=${row.image_id}` : ''}`}
                  className="text-xs font-bold text-accent hover:underline"
                >
                  Inspect
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getAuditRows(category: AuditCategory, health: NonNullable<ReturnType<typeof useProjectHealth>['health']>) {
  switch (category) {
    case 'duplicate_images':
      return health.validation?.duplicate_images || []
    case 'small_boxes':
      return health.validation?.small_boxes || []
    case 'large_boxes':
      return health.validation?.large_boxes || []
    case 'out_of_bounds':
      return health.validation?.out_of_bounds_annotations || []
    case 'unused_classes':
      return health.validation?.unused_classes || []
    case 'class_split_imbalance':
      return health.validation?.class_split_imbalance || []
    default:
      return []
  }
}

function ActionList({
  projectId,
  score,
  issueCount,
  criticalCount,
  annotatedPercent,
  projectType,
}: {
  projectId: string
  score: number
  issueCount: number
  criticalCount: number
  annotatedPercent: number
  projectType?: string
}) {
  const isClassification = projectType === 'classification'
  const actions = [
    {
      icon: criticalCount > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />,
      title: criticalCount > 0 ? 'Fix critical annotation errors' : 'Critical checks passed',
      description:
        criticalCount > 0
          ? isClassification
            ? 'Fix any invalid classes or duplicate images before training.'
            : 'Start with out-of-bounds coordinates before training.'
          : 'No blocking validation errors were found.',
      href: `/projects/${projectId}/annotate`,
      tone: criticalCount > 0 ? 'danger' : 'success',
    },
    {
      icon: <Images className="h-4 w-4" />,
      title: annotatedPercent < 80 ? 'Increase annotation coverage' : 'Coverage is in good shape',
      description: annotatedPercent < 80 ? 'Label more images to improve training reliability.' : 'Most images already have annotations.',
      href: `/projects/${projectId}/annotate`,
      tone: annotatedPercent < 80 ? 'warning' : 'success',
    },
    {
      icon: <Database className="h-4 w-4" />,
      title: issueCount > 0 ? 'Review dataset split balance' : 'Prepare a dataset version',
      description: issueCount > 0 ? 'Resolve split gaps and duplicate records before export.' : 'The dataset is ready for version generation.',
      href: `/projects/${projectId}/dataset`,
      tone: issueCount > 0 ? 'warning' : 'success',
    },
  ]

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <Link
          key={action.title}
          href={action.href}
          className="flex gap-3 rounded-xl border border-border bg-background p-4 transition hover:border-accent/30 hover:shadow-sm"
        >
          <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', countToneClass(action.tone as CheckTone))}>
            {action.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">{action.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current readiness</p>
        <p className="mt-2 text-sm font-semibold text-foreground">
          {score >= 80 ? 'This dataset is close to training-ready.' : 'This dataset needs cleanup before training.'}
        </p>
      </div>
    </div>
  )
}

function HealthSkeleton() {
  return (
    <div className="page-shell space-y-6">
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}

function badgeToneClass(tone: CheckTone) {
  if (tone === 'danger') return 'border-red-500/20 bg-red-500/10 text-red-600'
  if (tone === 'warning') return 'border-amber-500/20 bg-amber-500/10 text-amber-600'
  return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
}

function countToneClass(tone: CheckTone) {
  if (tone === 'danger') return 'bg-red-500/10 text-red-600'
  if (tone === 'warning') return 'bg-amber-500/10 text-amber-600'
  return 'bg-emerald-500/10 text-emerald-600'
}

function toneTextClass(tone: CheckTone) {
  if (tone === 'danger') return 'text-red-600'
  if (tone === 'warning') return 'text-amber-600'
  return 'text-emerald-600'
}
