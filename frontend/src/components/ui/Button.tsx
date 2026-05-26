"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const baseClasses = cn(
      "group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-semibold",
      "transition-all duration-200 ease-out active:scale-[0.98]",
      "focus-ring disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50"
    );

    const variants = {
      primary: cn(
        "bg-gradient-to-r from-accent to-accent-secondary text-accent-foreground",
        "shadow-sm hover:-translate-y-0.5 hover:shadow-accent-lg hover:brightness-110"
      ),
      secondary: cn(
        "border border-border bg-background text-foreground shadow-sm",
        "hover:-translate-y-0.5 hover:border-accent/30 hover:bg-muted/70 hover:shadow-md"
      ),
      ghost: cn("text-muted-foreground hover:bg-muted/60 hover:text-foreground"),
      danger: cn(
        "bg-red-600 text-white shadow-sm",
        "hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/20 active:bg-red-800"
      ),
    };

    const sizes = {
      sm: "h-10 px-4 text-sm",
      md: "h-12 px-6 text-base",
      lg: "h-14 px-8 text-base",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseClasses, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
