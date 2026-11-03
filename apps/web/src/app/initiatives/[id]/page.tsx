import type { Metadata } from "next";
import { InitiativeDetailView } from "@/components/initiatives/initiative-detail";

export const metadata: Metadata = { title: "Initiative" };

export default async function InitiativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InitiativeDetailView id={id} />;
}
