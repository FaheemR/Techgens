"use client";

import { useDocumentTitle } from "@/lib/hooks";
import { useApprovals, useInitiative } from "@/lib/queries";

/** Tab title for an initiative page: "{title} · Initiatives · Techgens" (shares the page's initiative query). */
export function InitiativeDocumentTitle({ id }: { id: string }) {
  const initiative = useInitiative(id);
  useDocumentTitle(initiative.data ? `${initiative.data.title} · Initiatives · Techgens` : null);
  return null;
}

/** Tab title for the inbox: "(2) Approvals · Techgens" while decisions are pending. */
export function ApprovalsDocumentTitle() {
  const pending = useApprovals("pending");
  const count = pending.data?.length;
  useDocumentTitle(
    count === undefined ? null : count > 0 ? `(${count}) Approvals · Techgens` : "Approvals · Techgens",
  );
  return null;
}
