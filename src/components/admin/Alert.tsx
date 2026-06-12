import { cn } from "./cn";

type Tone = "success" | "error" | "warning" | "info";

const toneClasses: Record<Tone, string> = {
  success: "border-moss-200 bg-moss-50 text-moss-800",
  error: "border-clay-200 bg-clay-50 text-clay-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-lichen-200 bg-lichen-100/50 text-lichen-700",
};

export function Alert({
  tone = "info",
  className,
  children,
  onDismiss,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        toneClasses[tone],
        className
      )}
    >
      <div className="min-w-0 leading-relaxed">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-2 shrink-0 cursor-pointer p-2 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
