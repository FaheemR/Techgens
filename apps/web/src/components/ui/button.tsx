import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "warning" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg font-semibold hover:bg-accent-hover",
  secondary: "border border-border bg-surface-3 text-fg hover:border-border-strong hover:bg-surface-hover",
  outline: "border border-border-strong text-fg hover:bg-white/5",
  ghost: "text-muted hover:bg-white/5 hover:text-fg",
  danger: "bg-danger text-white font-semibold hover:bg-danger-strong",
  success: "bg-emerald-400 text-emerald-950 font-semibold hover:bg-emerald-300",
  warning: "bg-amber-400 text-amber-950 font-semibold hover:bg-amber-300",
  link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg]:size-3.5",
  sm: "h-8 gap-1.5 rounded-md px-3 text-sm",
  md: "h-9 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-base",
  icon: "size-9 rounded-lg",
  "icon-sm": "size-7 rounded-md [&_svg]:size-3.5",
};

export function buttonVariants({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string | undefined } = {}): string {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonVariants({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
