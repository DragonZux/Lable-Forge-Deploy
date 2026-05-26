"use client";

import React from "react";
import { cn } from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-12 w-full rounded-xl border border-border bg-background px-4 shadow-sm",
          "text-foreground placeholder:text-muted-foreground/50",
          "transition-all duration-200 hover:border-accent/30 hover:bg-muted/20",
          "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
