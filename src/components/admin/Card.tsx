import { cn } from "./cn";

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-bone-300 bg-bone-50 shadow-sm",
        padded && "p-4 sm:p-5",
        className
      )}
    >
      {children}
    </div>
  );
}
