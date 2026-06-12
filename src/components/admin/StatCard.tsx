import Link from "next/link";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

const toneClasses: Record<string, string> = {
  moss: "bg-moss-100 text-moss-600",
  amber: "bg-amber-100 text-amber-600",
  clay: "bg-clay-100 text-clay-600",
  lichen: "bg-lichen-100 text-lichen-600",
  neutral: "bg-bone-200 text-bark-500",
};

export function StatCard({
  href,
  icon,
  value,
  label,
  tone = "moss",
}: {
  href?: string;
  icon: IconName;
  value: React.ReactNode;
  label: string;
  tone?: "moss" | "amber" | "clay" | "lichen" | "neutral";
}) {
  const inner = (
    <>
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          toneClasses[tone]
        )}
      >
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-semibold text-bark-800 sm:text-2xl">
          {value}
        </div>
        <div className="truncate text-xs font-medium uppercase tracking-wide text-bark-400">
          {label}
        </div>
      </div>
    </>
  );

  const classes =
    "flex items-center gap-3 rounded-xl border border-bone-300 bg-bone-50 p-4 shadow-sm transition-colors";

  if (href) {
    return (
      <Link href={href} className={cn(classes, "hover:border-moss-300")}>
        {inner}
      </Link>
    );
  }
  return <div className={classes}>{inner}</div>;
}
