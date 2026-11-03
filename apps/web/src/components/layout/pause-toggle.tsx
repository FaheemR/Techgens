"use client";

import { Pause, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { SystemInfo } from "@techgens/core";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/mutations";
import { qk, useSystem } from "@/lib/queries";

/** Global kill switch: pause or resume every agent. */
export function usePauseMutation() {
  const queryClient = useQueryClient();
  return useApiMutation(
    (pause: boolean) => api.post<SystemInfo>(pause ? "/api/system/pause" : "/api/system/resume"),
    {
      success: (info) => (info.paused ? "All agents paused" : "Agents resumed"),
      errorTitle: "Couldn't change the agent kill switch",
      onSuccess: (info) => queryClient.setQueryData(qk.system, info),
      invalidate: [qk.dashboard, ["jobs"]],
    },
  );
}

export function PauseToggle() {
  const { data } = useSystem();
  const mutation = usePauseMutation();
  if (!data) return null;
  const paused = data.paused;
  return (
    <Button
      variant={paused ? "success" : "outline"}
      size="sm"
      loading={mutation.isPending}
      onClick={() => mutation.mutate(!paused)}
      aria-pressed={paused}
      className={paused ? undefined : "border-rose-400/40 text-rose-200 hover:bg-rose-500/10"}
      title={paused ? "Resume all agents" : "Pause all agents (global kill switch)"}
    >
      {mutation.isPending ? null : paused ? <Play /> : <Pause />}
      <span className="hidden sm:inline">{paused ? "Resume agents" : "Pause all agents"}</span>
      <span className="sm:hidden">{paused ? "Resume" : "Pause"}</span>
    </Button>
  );
}
