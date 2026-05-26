"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  closeButton?: boolean;
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      children,
      size = "md",
      closeButton = true,
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) {
          onClose();
        }
      };

      if (isOpen) {
        document.addEventListener("keydown", handleEscape);
        document.body.style.overflow = "hidden";
      }

      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "auto";
      };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeClasses = {
      sm: "w-full max-w-sm",
      md: "w-full max-w-md",
      lg: "w-full max-w-lg",
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    };

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div
          ref={ref || modalRef}
          className={cn(
            "max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl",
            "space-y-5 transition-all duration-200",
            sizeClasses[size]
          )}
        >
          {title && (
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl leading-tight text-foreground">{title}</h2>
              {closeButton && (
                <button
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground focus-ring"
                  aria-label="Close modal"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </div>,
      document.body
    );
  }
);

Modal.displayName = "Modal";
