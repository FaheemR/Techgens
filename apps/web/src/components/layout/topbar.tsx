"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIndicator, LiveTicker } from "./live-indicator";
import { NotificationsPopover } from "./notifications-popover";
import { PauseToggle } from "./pause-toggle";
import { RuntimePill } from "./runtime-pill";

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>
      <div className="min-w-0 flex-1">
        <LiveTicker />
      </div>
      <div className="flex items-center gap-2">
        <LiveIndicator />
        <span className="hidden sm:block">
          <RuntimePill />
        </span>
        <PauseToggle />
        <NotificationsPopover />
      </div>
    </header>
  );
}
