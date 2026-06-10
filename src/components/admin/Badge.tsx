import { cn } from "./cn";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "moss";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-bone-200 text-bark-600",
  success: "bg-moss-100 text-moss-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-clay-100 text-clay-700",
  info: "bg-lichen-100 text-lichen-700",
  moss: "bg-moss-600 text-bone-50",
};

/** Maps common moderation/status strings to a badge tone. */
export function statusTone(status: string): BadgeTone {
  switch (status.toLowerCase()) {
    case "approved":
    case "active":
    case "ready":
    case "confirmed":
      return "success";
    case "pending":
    case "draft":
      return "warning";
    case "rejected":
    case "revoked":
    case "archived":
    case "inactive":
      return "danger";
    default:
      return "neutral";
  }
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
