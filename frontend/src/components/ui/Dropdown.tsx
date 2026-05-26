"use client";

import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

interface DropdownItem {
  label: string;
  value?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
}

export const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  ({ trigger, items, align = "right" }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener("click", handleClickOutside);
      }

      return () => {
        document.removeEventListener("click", handleClickOutside);
      };
    }, [isOpen]);

    const handleItemClick = (item: DropdownItem) => {
      item.onClick?.();
      setIsOpen(false);
    };

    return (
      <div ref={ref || dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 focus-ring"
        >
          {trigger}
        </button>

        {isOpen && (
          <div
            className={cn(
              "absolute top-full z-40 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-border bg-card py-1.5 shadow-xl",
              align === "left" ? "left-0" : "right-0"
            )}
          >
            {items.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleItemClick(item)}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm font-medium transition-colors",
                  item.variant === "danger"
                    ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    : "text-foreground hover:bg-accent/10 hover:text-accent"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

Dropdown.displayName = "Dropdown";
