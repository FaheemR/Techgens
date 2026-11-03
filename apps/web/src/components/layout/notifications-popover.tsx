"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationDTO } from "@techgens/core";
import { Bell, BellOff, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useApiMutation } from "@/lib/mutations";
import { qk, useNotifications } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useNotifications();
  const now = useNow(30_000);
  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const markLocal = (predicate: (n: NotificationDTO) => boolean) =>
    queryClient.setQueryData<NotificationDTO[]>(qk.notifications, (list) =>
      list?.map((n) => (predicate(n) && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );

  const markRead = useApiMutation((id: string) => api.post<void>(`/api/notifications/${id}/read`), {
    errorTitle: "Couldn't mark notification as read",
    onSuccess: (_r, id) => markLocal((n) => n.id === id),
    invalidate: [qk.notifications],
  });
  const markAll = useApiMutation(() => api.post<void>("/api/notifications/read-all"), {
    errorTitle: "Couldn't mark notifications as read",
    onSuccess: () => markLocal(() => true),
    invalidate: [qk.notifications],
  });

  function openNotification(n: NotificationDTO) {
    if (!n.readAt) markRead.mutate(n.id);
    if (!n.link) return;
    setOpen(false);
    if (n.link.startsWith("/")) router.push(n.link);
    else window.open(n.link, "_blank", "noopener,noreferrer");
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell />
        {unread > 0 ? (
          <CountBadge
            count={unread}
            tone="danger"
            max={9}
            className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[11px] leading-none"
          />
        ) : null}
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 w-[min(24rem,calc(100vw-1.5rem))] animate-fade-in overflow-hidden rounded-xl border border-border-strong bg-[#0d1522] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">
              Notifications
              {unread > 0 ? (
                <span className="ml-1.5 text-xs font-normal text-muted">{unread} unread</span>
              ) : null}
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => markAll.mutate()}
              disabled={unread === 0}
              loading={markAll.isPending}
            >
              <CheckCheck />
              Mark all read
            </Button>
          </div>
          <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
            {notifications.data === undefined ? (
              notifications.isError ? (
                <ErrorState error={notifications.error} compact className="m-3" />
              ) : (
                <LoadingBlock />
              )
            ) : items.length === 0 ? (
              <EmptyState
                compact
                icon={BellOff}
                title="You're all caught up"
                description="Approvals, budget alerts and incidents show up here."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]",
                        !n.readAt && "bg-accent/[0.04]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.readAt ? "bg-transparent" : "bg-accent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className={cn("text-sm", n.readAt ? "text-muted" : "font-medium text-fg")}>
                            {n.title}
                          </span>
                          <time className="shrink-0 text-xs text-subtle" dateTime={n.createdAt}>
                            {relativeTime(n.createdAt, now)}
                          </time>
                        </span>
                        {n.body ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                        ) : null}
                        {n.link && !n.link.startsWith("/") ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent">
                            <ExternalLink aria-hidden className="size-3" /> Opens in a new tab
                          </span>
                        ) : null}
                        {!n.readAt ? <span className="sr-only">(unread)</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
