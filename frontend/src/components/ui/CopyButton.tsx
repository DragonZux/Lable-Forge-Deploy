"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";

interface CopyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text: string;
  label?: string;
  successMessage?: string;
  variant?: "default" | "ghost";
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      text,
      label = "Copy",
      successMessage = "Copied!",
      variant = "default",
      className,
      ...props
    },
    ref
  ) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    const baseClasses = cn(
      "inline-flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-sm",
      variant === "ghost"
        ? "text-accent hover:bg-accent/10"
        : "bg-accent/10 text-accent hover:bg-accent/20"
    );

    return (
      <button
        ref={ref}
        onClick={handleCopy}
        className={cn(baseClasses, className)}
        {...props}
      >
        {isCopied ? (
          <>
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            {successMessage}
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {label}
          </>
        )}
      </button>
    );
  }
);

CopyButton.displayName = "CopyButton";
