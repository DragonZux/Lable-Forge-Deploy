'use client'

import { AnnotationAuditEvent } from '@/types'
import { ChevronDown, Clock, History } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface AuditHistoryPanelProps {
  events: AnnotationAuditEvent[]
  isOpen: boolean
  onToggle: () => void
  maxHeight?: number
}

function formatAction(action: string) {
  const labels: Record<string, string> = {
    annotations_saved: 'Saved annotations',
    annotation_created: 'Created annotation',
    annotation_updated: 'Updated annotation',
    annotation_deleted: 'Deleted annotation',
    image_submitted_for_review: 'Submitted for review',
    image_needs_review: 'Requested changes',
    image_approved: 'Approved image',
    image_rejected: 'Rejected image',
  }

  return labels[action] || action.replace(/_/g, ' ')
}

function actionTone(action: string) {
  if (action.includes('approved')) return 'border-emerald-500 bg-emerald-50'
  if (action.includes('rejected')) return 'border-red-500 bg-red-50'
  if (action.includes('review')) return 'border-amber-500 bg-amber-50'
  if (action.includes('saved') || action.includes('created')) return 'border-accent bg-accent/10'
  return 'border-muted-foreground bg-muted'
}

export default function AuditHistoryPanel({
  events,
  isOpen,
  onToggle,
  maxHeight = 220,
}: AuditHistoryPanelProps) {
  return (
    <div className="flex flex-col border-t border-border/50 bg-muted/5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left outline-none transition-colors hover:bg-muted/10"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Audit History <span className="font-bold text-accent">({events.length})</span>
          </span>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-300',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: maxHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-y-auto border-t border-border/50 bg-background/25 custom-scrollbar"
          >
            <div className="space-y-4 p-5">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 opacity-45">
                  <Clock className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    No audit logs yet
                  </p>
                </div>
              ) : (
                <div className="relative ml-2 space-y-4 border-l border-border/80 pl-4">
                  {events.map((event, index) => (
                    <div key={event.id || index} className="relative text-xs">
                      <div
                        className={cn(
                          'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border shadow-sm',
                          actionTone(event.action)
                        )}
                      />
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="truncate font-bold capitalize tracking-wide text-foreground">
                          {formatAction(event.action)}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                          {event.created_at
                            ? new Date(event.created_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'now'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>by {event.actor_name || 'System'}</span>
                        {event.after?.annotation_count !== undefined && (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-bold">
                            {event.after.annotation_count} shapes
                          </span>
                        )}
                        {event.after?.reviewer_comment && (
                          <span className="line-clamp-1 rounded bg-muted px-1.5 py-0.5">
                            {event.after.reviewer_comment}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
