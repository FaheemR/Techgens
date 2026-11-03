"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState error={error} title="Something went wrong on this page" onRetry={retry} />;
}
