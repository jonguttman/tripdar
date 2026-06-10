import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "leaf",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-bone-300 bg-bone-100/60 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-bone-200 text-bark-400">
        <Icon name={icon} size={24} />
      </div>
      <div>
        <p className="font-medium text-bark-700">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-bark-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
