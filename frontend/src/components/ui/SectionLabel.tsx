"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface SectionLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  isPulsing?: boolean;
}

export const SectionLabel = React.forwardRef<HTMLDivElement, SectionLabelProps>(
  ({ label, isPulsing = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 sm:gap-3 sm:px-5 sm:py-2",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full bg-accent",
            isPulsing && "animate-pulse-soft"
          )}
        />
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-accent sm:text-xs sm:tracking-[0.15em]">
          {label}
        </span>
      </div>
    );
  }
);

SectionLabel.displayName = "SectionLabel";
