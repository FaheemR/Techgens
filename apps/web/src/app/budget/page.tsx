import type { Metadata } from "next";
import { Suspense } from "react";
import { BudgetView } from "@/components/budget/budget-view";
import { PageSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Budget" };

export default function BudgetPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BudgetView />
    </Suspense>
  );
}
