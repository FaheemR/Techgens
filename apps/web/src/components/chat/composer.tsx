"use client";

import { useState, type KeyboardEvent, type Ref } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Composer({
  value,
  onValueChange,
  onSend,
  disabled,
  busy,
  placeholder = "Give the Chief of Staff a directive…",
  textareaRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (content: string) => Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const setValue = onValueChange;
  const [sending, setSending] = useState(false);
  const canSend = value.trim().length > 0 && !sending && !disabled;

  async function submit() {
    const content = value.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    setValue("");
    try {
      await onSend(content);
    } catch {
      setValue(content);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="border-t border-border bg-surface/80 p-3"
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border border-border bg-[#0a1019] p-2 transition-colors focus-within:border-accent/60",
          disabled && "opacity-60",
        )}
      >
        <label htmlFor="directive-input" className="sr-only">
          Message to the Chief of Staff
        </label>
        <textarea
          id="directive-input"
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed text-fg outline-none [field-sizing:content] placeholder:text-subtle focus-visible:outline-none"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled={!canSend}
          loading={sending}
          aria-label="Send directive"
        >
          {sending ? null : <SendHorizontal />}
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-subtle">
        <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a
        new line
        {busy ? " · The Chief of Staff is replying…" : ""}
      </p>
    </form>
  );
}
