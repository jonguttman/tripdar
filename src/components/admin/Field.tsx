"use client";

import { cn } from "./cn";

const controlClasses =
  "w-full rounded-lg border border-bone-300 bg-bone-50 px-3.5 text-base text-bark-800 placeholder:text-bark-300 transition-colors focus:border-moss-500 focus:outline-2 focus:outline-moss-500/30 disabled:opacity-50 sm:text-sm";

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-bark-700">
          {label}
          {required && <span className="text-clay-600"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-bark-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs text-clay-600">{error}</span>
      )}
    </label>
  );
}

export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, "min-h-11", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClasses, "min-h-11", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(controlClasses, "min-h-24 py-2.5", className)} {...rest} />
  );
}
