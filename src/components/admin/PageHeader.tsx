import { cn } from "./cn";

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Primary actions; stack full-width below the title on mobile. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl text-bark-800">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-bark-400">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {actions}
        </div>
      )}
    </div>
  );
}
