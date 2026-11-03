import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import { ApprovalsDocumentTitle } from "@/components/common/document-title";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApprovalsDocumentTitle />
      <ApprovalsView />
    </Suspense>
  );
}
