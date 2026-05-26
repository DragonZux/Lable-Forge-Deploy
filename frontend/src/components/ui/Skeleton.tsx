"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "avatar" | "image" | "rect" | "line";
  count?: number;
  height?: string | number;
  width?: string | number;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      variant = "rect",
      count = 1,
      height,
      width,
      className,
      ...props
    },
    ref
  ) => {
    const baseClasses = "animate-pulse rounded bg-gradient-to-r from-muted via-border to-muted";

    const variants = {
      text: cn("h-4 w-full", baseClasses),
      avatar: cn("h-12 w-12 rounded-full", baseClasses),
      image: cn("h-48 w-full rounded-lg", baseClasses),
      rect: cn("h-10 w-full", baseClasses),
      line: cn("h-3 w-full", baseClasses),
    };

    const heightStyle = height
      ? { height: typeof height === "number" ? `${height}px` : height }
      : {};
    const widthStyle = width
      ? { width: typeof width === "number" ? `${width}px` : width }
      : {};

    const skeleton = (
      <div
        ref={ref}
        className={cn(variants[variant], className)}
        style={{ ...heightStyle, ...widthStyle }}
        {...props}
      />
    );

    if (count === 1) return skeleton;

    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(variants[variant], className)}
            style={{ ...heightStyle, ...widthStyle }}
          />
        ))}
      </div>
    );
  }
);

Skeleton.displayName = "Skeleton";
