"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "./api";

interface ApiMutationOptions<TVars, TResult> {
  /** Query keys (or key roots) to invalidate after success. */
  invalidate?: QueryKey[];
  /** Toast shown on success (string or builder). */
  success?: string | ((result: TResult, vars: TVars) => string);
  /** Prefix for the error toast. */
  errorTitle?: string;
  onSuccess?: (result: TResult, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
}

/** `useMutation` with toast feedback and cache invalidation. */
export function useApiMutation<TVars = void, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: ApiMutationOptions<TVars, TResult> = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<TResult, unknown, TVars>({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      if (options.success) {
        toast.success(
          typeof options.success === "function" ? options.success(result, vars) : options.success,
        );
      }
      options.onSuccess?.(result, vars);
      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error, vars) => {
      toast.error(options.errorTitle ?? "Request failed", errorMessage(error));
      options.onError?.(error, vars);
    },
  });
}
