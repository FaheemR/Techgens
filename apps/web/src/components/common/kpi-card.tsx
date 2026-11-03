import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { TONE_TEXT, type Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "accent",
  href,
  highlight = false,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
  highlight?: boolean;
  children?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-subtle">{label}</p>
        <Icon aria-hidden className={cn("size-4", TONE_TEXT[tone])} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</p>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
      {href ? (
        <ArrowUpRight
          aria-hidden
          className="absolute bottom-3 right-3 size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        />
      ) : null}
    </>
  );
  const className = cn(
    "group relative block rounded-xl border bg-surface/90 p-4 transition-colors",
    highlight ? "border-amber-400/35 bg-amber-400/[0.04]" : "border-border",
    href && "hover:border-border-strong hover:bg-surface-2",
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
