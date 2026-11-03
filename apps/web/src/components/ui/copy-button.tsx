"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

export function CopyButton({
  text,
  label = "Copy",
  variant = "secondary",
  size = "sm",
  className,
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_800);
        }
      }}
      aria-live="polite"
    >
      {copied ? <Check className="text-emerald-300" /> : <Copy />}
      {size === "icon" || size === "icon-sm" ? (
        <span className="sr-only">{copied ? "Copied" : label}</span>
      ) : copied ? (
        "Copied"
      ) : (
        label
      )}
    </Button>
  );
}
