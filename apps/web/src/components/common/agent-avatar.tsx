import { Bot, Crown } from "lucide-react";
import { departmentStyle } from "@/lib/labels";
import { cn, initials } from "@/lib/utils";

export function AgentAvatar({
  name,
  department,
  size = "md",
  className,
  cloud = false,
}: {
  name: string | null | undefined;
  department?: string | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  cloud?: boolean;
}) {
  const style = departmentStyle(department);
  const sizes = {
    xs: "size-5 text-[11px] tracking-tighter",
    sm: "size-6 text-[11px]",
    md: "size-8 text-xs",
    lg: "size-11 text-sm",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-accent-fg",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: style.hex }}
    >
      {initials(name)}
      {cloud ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-surface bg-field">
          <Bot className="size-2.5 text-accent" />
        </span>
      ) : null}
    </span>
  );
}

export function CeoAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-6", md: "size-8", lg: "size-11" } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-amber-300",
        sizes[size],
      )}
    >
      <Crown className="size-1/2 text-amber-950" />
    </span>
  );
}
