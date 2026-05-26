"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "accent";
  isPulsing?: boolean;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  (
    { variant = "default", isPulsing = false, className, children, ...props },
    ref
  ) => {
    const variants = {
      default: "border border-border bg-muted/70 text-foreground",
      accent: "bg-accent/5 border border-accent/30 text-accent",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm",
          variants[variant],
          className
        )}
        {...props}
      >
        {isPulsing && (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              variant === "accent" ? "bg-accent" : "bg-foreground",
              "animate-pulse-soft"
            )}
          />
        )}
        {children}
      </div>
    );
  }
);

Badge.displayName = "Badge";
