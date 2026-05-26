"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";

interface Tab {
  id: string;
  label: string | React.ReactNode;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ tabs, defaultTab, onChange }, ref) => {
    const [activeTab, setActiveTab] = useState(
      defaultTab || tabs[0]?.id || ""
    );

    const handleTabChange = (tabId: string) => {
      setActiveTab(tabId);
      onChange?.(tabId);
    };

    return (
      <div ref={ref} className="w-full">
        {/* Tab headers */}
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "min-h-11 shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all -mb-[2px] focus-ring",
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {tabs.find((tab) => tab.id === activeTab)?.content}
        </div>
      </div>
    );
  }
);

Tabs.displayName = "Tabs";
