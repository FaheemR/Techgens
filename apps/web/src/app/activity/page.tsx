import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityView } from "@/components/activity/activity-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityView />
    </Suspense>
  );
}
