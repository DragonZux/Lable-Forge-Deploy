"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  const defaultIcon = (
    <svg
      className="w-16 h-16 text-muted-foreground/30"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );

  const buttonClass = "inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-secondary px-6 text-sm font-semibold text-accent-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-accent";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 py-12 text-center",
        className
      )}
    >
      <div className="mb-4">{icon || defaultIcon}</div>
      <h3 className="mb-2 font-display text-2xl leading-tight text-foreground">{title}</h3>
      {description && (
        <p className="text-muted-foreground mb-6 max-w-md">{description}</p>
      )}
      {action && (
        <>
          {action.href ? (
            <Link href={action.href} className={buttonClass}>
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className={buttonClass}
            >
              {action.label}
            </button>
          )}
        </>
      )}
    </div>
  );
};

EmptyState.displayName = "EmptyState";
