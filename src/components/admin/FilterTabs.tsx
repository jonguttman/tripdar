"use client";

import { cn } from "./cn";

export interface FilterTab<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Horizontal pill filter, scrollable on mobile (no wrapping, thumb-sized
 * targets). Used for status filters like pending/approved/rejected.
 */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
              active
                ? "border-moss-600 bg-moss-600 text-bone-50"
                : "border-bone-300 bg-bone-50 text-bark-600 hover:border-moss-300"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-xs font-semibold",
                  active ? "bg-moss-700 text-moss-100" : "bg-bone-200 text-bark-500"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
