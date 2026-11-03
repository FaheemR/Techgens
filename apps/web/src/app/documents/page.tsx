import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentsView } from "@/components/documents/documents-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentsView />
    </Suspense>
  );
}
