"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  description?: string | undefined;
  variant: ToastVariant;
}

interface ToastApi {
  toast: (input: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-400/30 [&_.toast-icon]:text-emerald-300",
  error: "border-rose-400/40 [&_.toast-icon]:text-rose-300",
  info: "border-sky-400/30 [&_.toast-icon]:text-sky-300",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const regionRef = useRef<HTMLElement>(null);

  // Native modal dialogs/sheets live in the top layer and would cover the toasts. Showing the region as a manual
  // popover puts it in the top layer too; re-showing it moves it above any dialog opened since.
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== "function") return;
    const open = region.matches(":popover-open");
    if (toasts.length === 0) {
      if (open) region.hidePopover();
      return;
    }
    if (open) region.hidePopover();
    region.showPopover();
  }, [toasts]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastApi["toast"]>(
    ({ title, description, variant = "info", durationMs }) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-4), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), durationMs ?? (variant === "error" ? 8_000 : 4_500));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) =>
        toast({ title, ...(description ? { description } : {}), variant: "success" }),
      error: (title, description) =>
        toast({ title, ...(description ? { description } : {}), variant: "error" }),
      info: (title, description) =>
        toast({ title, ...(description ? { description } : {}), variant: "info" }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        ref={regionRef}
        popover="manual"
        aria-label="Notifications"
        style={{ inset: "auto 1rem 1rem auto" }}
        className="pointer-events-none fixed z-[200] m-0 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 overflow-visible border-0 bg-transparent p-0 text-fg"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div
              key={t.id}
              role={t.variant === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex animate-fade-in items-start gap-3 rounded-lg border bg-[#0f1724]/95 px-3.5 py-3 shadow-xl shadow-black/50 backdrop-blur",
                STYLES[t.variant],
              )}
            >
              <Icon aria-hidden className="toast-icon mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 break-words text-xs text-muted">{t.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-mr-1 rounded p-0.5 text-subtle hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
