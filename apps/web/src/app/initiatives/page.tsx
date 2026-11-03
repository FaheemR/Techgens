import type { Metadata } from "next";
import { Suspense } from "react";
import { InitiativesView } from "@/components/initiatives/initiatives-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Initiatives" };

export default function InitiativesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InitiativesView />
    </Suspense>
  );
}
