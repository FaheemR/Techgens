"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { OctagonPause, RefreshCw, ServerCrash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL, isUnreachable } from "@/lib/api";
import { liveEvents } from "@/lib/events";
import { useSystem } from "@/lib/queries";
import { usePauseMutation } from "./pause-toggle";

/** Global banners: orchestrator unreachable, agents paused. Also refreshes everything when the API comes back. */
export function SystemBanners() {
  const system = useSystem();
  const queryClient = useQueryClient();
  const resume = usePauseMutation();
  const wasDown = useRef(false);
  const down = system.isError && isUnreachable(system.error);

  useEffect(() => {
    if (down) {
      wasDown.current = true;
      return;
    }
    if (system.isSuccess && wasDown.current) {
      wasDown.current = false;
      void queryClient.invalidateQueries();
      liveEvents.reconnectNow();
    }
  }, [down, system.isSuccess, queryClient]);

  return (
    <>
      {down ? (
        <div
          role="alert"
          className="border-b border-amber-400/25 bg-amber-400/[0.08] px-4 py-2.5 sm:px-6 lg:px-8"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <ServerCrash aria-hidden className="size-4 shrink-0 text-amber-300" />
            <p className="min-w-0 flex-1 text-amber-100">
              <span className="font-semibold">Orchestrator unreachable at {API_URL}.</span>{" "}
              <span className="text-amber-100/80">
                Start it with <code className="rounded bg-black/30 px-1 font-mono text-xs">pnpm dev</code> (or
                set <code className="rounded bg-black/30 px-1 font-mono text-xs">NEXT_PUBLIC_API_URL</code>).
                Retrying automatically…
              </span>
            </p>
            <Button
              variant="outline"
              size="xs"
              className="border-amber-400/40 text-amber-100 hover:bg-amber-400/10"
              onClick={() => void system.refetch()}
              loading={system.isFetching}
            >
              {system.isFetching ? null : <RefreshCw />}
              Retry now
            </Button>
          </div>
        </div>
      ) : null}
      {system.data?.paused ? (
        <div
          role="status"
          className="border-b border-rose-400/25 bg-rose-500/[0.08] px-4 py-2.5 sm:px-6 lg:px-8"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <OctagonPause aria-hidden className="size-4 shrink-0 text-rose-300" />
            <p className="min-w-0 flex-1 text-rose-100">
              <span className="font-semibold">All agents are paused.</span>{" "}
              <span className="text-rose-100/80">
                Running work is suspended and no new jobs will start until you resume.
              </span>
            </p>
            <Button
              variant="success"
              size="xs"
              onClick={() => resume.mutate(false)}
              loading={resume.isPending}
            >
              Resume agents
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
