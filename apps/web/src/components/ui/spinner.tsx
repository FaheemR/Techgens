import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <LoaderCircle aria-hidden className={cn("size-4 animate-spin text-current", className)} />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

export function LoadingBlock({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex items-center justify-center gap-2 py-10 text-sm text-muted", className)}
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}
