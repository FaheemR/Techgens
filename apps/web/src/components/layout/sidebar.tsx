"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountBadge } from "@/components/ui/badge";
import { useApprovals, useCompany, useSystem } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";
import { NAV_GROUPS, isActivePath } from "./nav";

/** Navigation list shared by the desktop sidebar and the mobile drawer. */
export function NavLinks({
  collapsible = true,
  onNavigate,
}: {
  collapsible?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const approvals = useApprovals("pending");
  const pendingApprovals = approvals.data?.length ?? 0;

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              "mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle",
              collapsible && "md:sr-only lg:not-sr-only",
            )}
          >
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const badge = item.badge === "approvals" ? pendingApprovals : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                      collapsible && "md:justify-center md:px-0 lg:justify-start lg:px-3",
                      active ? "bg-accent/10 text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent shadow-[0_0_10px_rgba(34,211,238,0.8)]"
                      />
                    ) : null}
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-[18px] shrink-0",
                        active ? "text-accent" : "text-subtle group-hover:text-muted",
                      )}
                    />
                    <span className={cn("flex-1 truncate", collapsible && "md:sr-only lg:not-sr-only")}>
                      {item.label}
                    </span>
                    {badge > 0 ? (
                      <>
                        <CountBadge
                          count={badge}
                          className={cn(
                            collapsible &&
                              "md:absolute md:right-1 md:top-0.5 md:h-4 md:min-w-4 md:px-1 md:text-[11px] lg:static lg:h-5 lg:min-w-5 lg:px-1.5 lg:text-[11px]",
                          )}
                        />
                        <span className="sr-only">({badge} pending)</span>
                      </>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const company = useCompany();
  const system = useSystem();
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/80 backdrop-blur md:flex md:w-[68px] lg:w-60">
      <div className="flex h-14 items-center border-b border-border px-4 md:justify-center md:px-0 lg:justify-start lg:px-4">
        <Link href="/" className="rounded-lg" aria-label="Techgens Command Center — dashboard">
          <span className="hidden lg:block">
            <Wordmark />
          </span>
          <span className="lg:hidden">
            <Wordmark collapsed />
          </span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        <NavLinks />
      </div>
      <div className="hidden border-t border-border px-4 py-3 lg:block">
        <p className="truncate text-xs font-medium text-fg">{company.data?.name ?? "Your company"}</p>
        <p className="mt-0.5 truncate text-[11px] text-subtle">
          {system.data ? `Techgens v${system.data.version}` : "Self-hosted · AI-staffed"}
        </p>
      </div>
    </aside>
  );
}
