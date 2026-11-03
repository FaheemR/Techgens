"use client";

import { useState, useSyncExternalStore } from "react";

/**
 * Screen-reader announcements through live regions that already exist when a message arrives (regions inserted
 * together with their text are announced unreliably). The app-wide regions are mounted once by the ToastProvider;
 * every open modal dialog mounts its own pair, because a modal makes everything outside it inert — and silent.
 */

export type Politeness = "polite" | "assertive";

interface Announcement {
  id: number;
  text: string;
  politeness: Politeness;
  at: number;
}

const EMPTY: readonly Announcement[] = [];
let announcements: readonly Announcement[] = EMPTY;
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announce `text` to assistive technology without moving focus. */
export function announce(text: string, politeness: Politeness = "polite"): void {
  const message = text.trim();
  if (!message || typeof window === "undefined") return;
  // Wait a beat so a dialog that is closing in the same update is gone (and the page regions are live again).
  window.setTimeout(() => {
    const item: Announcement = { id: nextId++, text: message, politeness, at: Date.now() };
    announcements = [...announcements, item].slice(-6);
    emit();
    window.setTimeout(() => {
      announcements = announcements.filter((a) => a.id !== item.id);
      emit();
    }, 7_000);
  }, 120);
}

/** A polite and an assertive live region that render announcements made after they mounted. */
export function LiveAnnouncer() {
  const items = useSyncExternalStore(
    subscribe,
    () => announcements,
    () => EMPTY,
  );
  const [mountedAt] = useState(() => Date.now());
  const fresh = items.filter((a) => a.at >= mountedAt);
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {fresh
          .filter((a) => a.politeness === "polite")
          .map((a) => (
            <p key={a.id}>{a.text}</p>
          ))}
      </div>
      <div aria-live="assertive" className="sr-only">
        {fresh
          .filter((a) => a.politeness === "assertive")
          .map((a) => (
            <p key={a.id}>{a.text}</p>
          ))}
      </div>
    </>
  );
}
