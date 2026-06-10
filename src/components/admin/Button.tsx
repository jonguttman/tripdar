"use client";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-moss-600 text-bone-50 hover:bg-moss-700 active:bg-moss-800 shadow-sm",
  secondary:
    "bg-bone-50 text-bark-700 border border-bone-300 hover:bg-bone-200/60 active:bg-bone-200",
  ghost: "text-bark-600 hover:bg-bone-200/60 active:bg-bone-200",
  danger:
    "bg-clay-600 text-bone-50 hover:bg-clay-700 active:bg-clay-800 shadow-sm",
  "danger-ghost":
    "text-clay-600 border border-clay-200 hover:bg-clay-50 active:bg-clay-100",
};

const sizeClasses: Record<Size, string> = {
  // Keep even compact admin actions at the mobile-friendly 44px target.
  sm: "min-h-11 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-sm gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  full = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss-500",
        variantClasses[variant],
        sizeClasses[size],
        full && "w-full",
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
