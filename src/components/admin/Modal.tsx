"use client";

import { useEffect } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * Responsive dialog: bottom sheet on mobile, centered modal on >=sm screens.
 * Closes on overlay click and Escape.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Sticky footer area, typically action buttons. */
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bark-900/50 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-bone-50 shadow-xl animate-sheet-up",
          "sm:max-h-[85dvh] sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-bone-300 px-4 py-3 sm:px-6">
          <h2 className="min-w-0 truncate text-base font-semibold text-bark-800">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-bark-400 hover:bg-bone-200/60 hover:text-bark-600"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-bone-300 bg-bone-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
