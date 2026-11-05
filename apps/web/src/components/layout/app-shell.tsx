"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/ui/dialog";
import { Wordmark } from "./logo";
import { NavLinks, Sidebar } from "./sidebar";
import { SystemBanners } from "./system-banners";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[300] rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <Sheet open={navOpen} onClose={() => setNavOpen(false)} title={<Wordmark />} side="left" width="sm">
        <NavLinks collapsible={false} onNavigate={() => setNavOpen(false)} />
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <SystemBanners />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
