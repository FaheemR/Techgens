"use client";

import Link from "next/link";
import { FlaskConical, Github, PlugZap } from "lucide-react";
import { useSystem } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Copilot runtime status: connected login, demo mode, or not connected (links to Settings). */
export function RuntimePill() {
  const { data } = useSystem();
  if (!data) return null;
  const { runtime } = data;
  const base =
    "flex h-8 max-w-[18rem] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors";

  if (data.demoMode || runtime.kind === "fake") {
    return (
      <Link
        href="/settings"
        className={cn(base, "border-amber-400/30 bg-amber-400/[0.07] text-amber-200 hover:bg-amber-400/15")}
        title={runtime.message ?? "Agents run on a simulated runtime. Connect GitHub Copilot in Settings."}
      >
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">Demo mode</span>
      </Link>
    );
  }

  if (runtime.authenticated) {
    const login = runtime.login ?? data.github.login;
    return (
      <span
        className={cn(base, "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200")}
        title={runtime.message ?? "GitHub Copilot runtime is ready"}
      >
        <Github aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">
          Copilot
          <span className="hidden xl:inline">{login ? ` · connected as ${login}` : " · connected"}</span>
        </span>
      </span>
    );
  }

  return (
    <Link
      href="/settings"
      className={cn(base, "border-rose-400/30 bg-rose-400/[0.07] text-rose-200 hover:bg-rose-400/15")}
      title={runtime.message ?? "GitHub Copilot is not connected"}
    >
      <PlugZap aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">Not connected</span>
    </Link>
  );
}
