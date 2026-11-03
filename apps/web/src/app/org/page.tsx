import type { Metadata } from "next";
import { Suspense } from "react";
import { OrgView } from "@/components/org/org-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Org chart" };

export default function OrgPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrgView />
    </Suspense>
  );
}
