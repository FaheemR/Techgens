"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Shared native <dialog> behaviour: top layer, focus trap, Escape and backdrop click to close. */
function useNativeDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return ref;
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
  const ref = useNativeDialog(open);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] overflow-visible rounded-xl border border-border-strong bg-surface p-0 text-fg shadow-2xl shadow-black/60",
        DIALOG_SIZES[size],
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85dvh] animate-fade-in flex-col">
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
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
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
  const ref = useNativeDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold leading-snug text-fg">
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
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
