import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkBoardView } from "@/components/work/work-board-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Work board" };

export default function WorkPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WorkBoardView />
    </Suspense>
  );
}
