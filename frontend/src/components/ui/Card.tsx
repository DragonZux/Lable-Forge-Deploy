"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "featured";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = "default", className, children, ...props }, ref) => {
    const variants = {
      default: cn(
        "rounded-xl border border-border bg-card shadow-sm transition-all duration-300"
      ),
      elevated: cn(
        "rounded-xl border border-border bg-card shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-xl"
      ),
      featured: cn(
        "rounded-xl bg-gradient-to-br from-accent via-accent-secondary to-accent p-[2px] shadow-accent"
      ),
    };

    return (
      <div ref={ref} className={cn(variants[variant], className)} {...props}>
        {variant === "featured" ? (
          <div className="h-full w-full rounded-[10px] bg-card">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    );
  }
);

Card.displayName = "Card";
