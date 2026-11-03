"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { LiveAnnouncer } from "./live-region";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE = [
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function firstFocusable(root: Element | null): HTMLElement | null {
  for (const el of root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

/**
 * Shared native <dialog> behaviour: top layer, focus trap, Escape and backdrop click to close. showModal() focuses the
 * first focusable element — the header's close button — so focus moves on to the element marked `data-autofocus`, else
 * the first control of the body (forms) or the title (detail sheets, whose first control may be an action such as
 * "Pause agent"), else the first footer button.
 */
function useNativeDialog(open: boolean, initialFocus: "body" | "title") {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        (initialFocus === "title"
          ? el.querySelector<HTMLElement>("[data-dialog-title]")
          : (firstFocusable(el.querySelector("[data-dialog-body]")) ??
            firstFocusable(el.querySelector("[data-dialog-footer]"))));
      target?.focus();
    }
    if (!open && el.open) el.close();
  }, [open, initialFocus]);
  return ref;
}

/**
 * Escape, close and backdrop-click handlers that only react to this dialog's own events: React bubbles a nested
 * dialog's `cancel`/`close` through its parents, which would otherwise close every layer at once.
 */
function dialogEvents(open: boolean, onClose: () => void) {
  return {
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onClose();
    },
    onClose: (event: SyntheticEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget && open) onClose();
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
  };
}

const DIALOG_SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  size = "md",
}: ModalProps & { size?: keyof typeof DIALOG_SIZES }) {
  const ref = useNativeDialog(open, "body");
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      {...dialogEvents(open, onClose)}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] overflow-visible rounded-xl border border-border-strong bg-surface p-0 text-fg shadow-2xl shadow-black/60",
        DIALOG_SIZES[size],
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] animate-fade-in flex-col">
          {/* The page's live regions are inert while this modal is open. */}
          <LiveAnnouncer />
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-fg">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dialog">
              <X />
            </Button>
          </div>
          {children ? (
            <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
          ) : null}
          {footer ? (
            <div
              data-dialog-footer
              className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3"
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** Right-hand drawer for detail views. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  headerExtra,
  width = "md",
  side = "right",
}: ModalProps & { headerExtra?: ReactNode; width?: "sm" | "md" | "lg"; side?: "left" | "right" }) {
  const ref = useNativeDialog(open, "title");
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      {...dialogEvents(open, onClose)}
      className={cn(
        "my-0 h-dvh max-h-none w-full border-border-strong bg-surface p-0 text-fg shadow-2xl shadow-black/70",
        side === "right" ? "ml-auto mr-0 border-l" : "ml-0 mr-auto border-r",
        width === "lg"
          ? "max-w-[min(52rem,100vw)]"
          : width === "sm"
            ? "max-w-[min(18rem,100vw)]"
            : "max-w-[min(40rem,100vw)]",
        className,
      )}
    >
      {open ? (
        <div className={cn("flex h-full flex-col", side === "right" && "animate-slide-in")}>
          <LiveAnnouncer />
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  data-dialog-title
                  tabIndex={-1}
                  className="rounded-sm text-lg font-semibold leading-snug text-fg"
                >
                  {title}
                </h2>
                {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
                <X />
              </Button>
            </div>
            {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** The safe choice, e.g. "Keep budget"; it has focus when the dialog opens. */
  cancelLabel?: string;
  tone?: "danger" | "primary" | "warning";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
