import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { storageAdapter } from "@/lib/storageAdapter";
import { ApiError } from "@/lib/apiFetch";

export const persister = createAsyncStoragePersister({
  storage: storageAdapter,
  key: "REACT_QUERY_OFFLINE_CACHE",
  throttleTime: 1000,
});

function shouldRetryOnError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.retriedByClient) {
      return false;
    }
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status >= 400 && status < 500) return false;
  }

  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, 
      staleTime: 1000 * 60 * 5,
      networkMode: 'offlineFirst',
      retry: shouldRetryOnError,
    },
    mutations: {
      networkMode: 'offlineFirst',
    }
  },
});
