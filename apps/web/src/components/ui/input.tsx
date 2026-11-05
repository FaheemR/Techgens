"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useMemo,
  type AriaAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// The control border is the only boundary of a field, so it uses the ≥ 3:1 `control` token (WCAG 1.4.11).
const FIELD_BASE =
  "w-full rounded-lg border border-control bg-field text-sm text-fg placeholder:text-subtle transition-colors " +
  "hover:border-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rose-400";

interface FieldState {
  /** Id of the control the field labels (`htmlFor`). */
  controlId: string;
  describedBy: string | undefined;
  required: boolean;
  invalid: boolean;
}

const FieldContext = createContext<FieldState | null>(null);

type ControlAria = Pick<AriaAttributes, "aria-describedby" | "aria-invalid" | "aria-required">;

/** Accessibility state a `Field` passes to its control: required, invalid, and its hint or error as description. */
function fieldAria(
  field: FieldState | null,
  props: ControlAria & { id?: string | undefined; required?: boolean | undefined },
): ControlAria {
  if (!field || !props.id || props.id !== field.controlId) return {};
  const describedBy = [props["aria-describedby"], field.describedBy].filter(Boolean).join(" ");
  return {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    "aria-required": props["aria-required"] ?? (field.required && !props.required ? true : undefined),
  };
}

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const field = useContext(FieldContext);
  return (
    <input
      ref={ref}
      className={cn(FIELD_BASE, "h-9 px-3", className)}
      data-autofocus={props.autoFocus || undefined}
      {...props}
      {...fieldAria(field, props)}
    />
  );
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const field = useContext(FieldContext);
  return (
    <textarea
      ref={ref}
      className={cn(FIELD_BASE, "min-h-20 px-3 py-2 leading-relaxed", className)}
      data-autofocus={props.autoFocus || undefined}
      {...props}
      {...fieldAria(field, props)}
    />
  );
}

export function Select({
  className,
  children,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  const field = useContext(FieldContext);
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className={cn(FIELD_BASE, "h-9 cursor-pointer appearance-none pl-3 pr-8")}
        data-autofocus={props.autoFocus || undefined}
        {...props}
        {...fieldAria(field, props)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
      />
    </div>
  );
}

/**
 * Wires a custom control nested inside a `Field` (e.g. a native `<input>` within a chip editor) to the field's
 * required/invalid state and hint/error text. Input, Textarea and Select do this on their own.
 */
export function FieldControl({ children }: { children: ReactElement<ControlAria & { id?: string }> }) {
  const field = useContext(FieldContext);
  return cloneElement(children, fieldAria(field, children.props));
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const showError = Boolean(error);
  const showHint = !showError && Boolean(hint);
  const describedBy = showError ? errorId : showHint ? hintId : undefined;
  const state = useMemo<FieldState>(
    () => ({ controlId: htmlFor, describedBy, required: Boolean(required), invalid: showError }),
    [htmlFor, describedBy, required, showError],
  );

  // A plain native control as the direct child (e.g. <input id={htmlFor}>) can't read the context: wire it here.
  const content =
    isValidElement<ControlAria & { id?: string; required?: boolean }>(children) &&
    typeof children.type === "string"
      ? cloneElement(children, fieldAria(state, children.props))
      : children;

  return (
    <FieldContext.Provider value={state}>
      <div className={cn("space-y-1.5", className)}>
        <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-rose-300">
              *
            </span>
          ) : null}
        </label>
        {content}
        {showError ? (
          <p id={errorId} role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        ) : showHint ? (
          <p id={hintId} className="text-xs text-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
