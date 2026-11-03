"use client";

import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingBlock } from "@/components/ui/spinner";

/** Renders loading / error / empty / data states of a query consistently. */
export function QueryView<T>({
  query,
  children,
  loading,
  isEmpty,
  empty,
  errorTitle,
  compactError = false,
}: {
  query: UseQueryResult<T, unknown>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  errorTitle?: string;
  compactError?: boolean;
}) {
  if (query.data === undefined) {
    if (query.isError) {
      return (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          compact={compactError}
          {...(errorTitle ? { title: errorTitle } : {})}
        />
      );
    }
    return <>{loading ?? <LoadingBlock />}</>;
  }
  if (isEmpty?.(query.data)) return <>{empty ?? null}</>;
  return <>{children(query.data)}</>;
}
