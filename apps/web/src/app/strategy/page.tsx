import type { Metadata } from "next";
import { Suspense } from "react";
import { StrategyView } from "@/components/strategy/strategy-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Strategy" };

export default function StrategyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StrategyView />
    </Suspense>
  );
}
