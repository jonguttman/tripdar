import { cn } from "./cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-9 animate-spin rounded-full border-[3px] border-bone-300 border-t-moss-600",
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-sm text-bark-400">
      <Spinner />
      {label}
    </div>
  );
}
