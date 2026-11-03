import type { Metadata } from "next";
import { InitiativeDocumentTitle } from "@/components/common/document-title";
import { InitiativeDetailView } from "@/components/initiatives/initiative-detail";

export const metadata: Metadata = { title: "Initiative" };

export default async function InitiativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <InitiativeDocumentTitle id={id} />
      <InitiativeDetailView id={id} />
    </>
  );
}
