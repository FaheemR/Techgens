import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocumentViewer id={id} />
    </Suspense>
  );
}
