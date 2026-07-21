"use client";

import * as React from "react";
import useSWR from "swr";
import type { SqlResultRow } from "@/lib/genie/lightspeed-sql-visual";
import type { AnalyticsElementQuery } from "@/lib/analytics-studio/types";

export interface ElementDataState {
  rows: SqlResultRow[];
  rowCount: number;
  totalRowCount: number;
  limitApplied: boolean;
  sql: string | null;
  error: string | null;
  isLoading: boolean;
  isValidating: boolean;
}

interface QueryResponse {
  rows: SqlResultRow[];
  rowCount: number;
  totalRowCount?: number;
  limitApplied: boolean;
  sql: string;
}

async function runQuery(key: string): Promise<QueryResponse> {
  const { query } = JSON.parse(key) as { query: AnalyticsElementQuery };
  const response = await fetch("/api/store/analytics/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "Query failed.");
  }
  return data as QueryResponse;
}

/** Debounces the query spec, then fetches rows through the analytics API. */
export function useElementData(query: AnalyticsElementQuery, enabled = true): ElementDataState {
  const key = React.useMemo(() => JSON.stringify({ query }), [query]);
  const [debouncedKey, setDebouncedKey] = React.useState(key);

  React.useEffect(() => {
    if (key === debouncedKey) return;
    const timeout = window.setTimeout(() => setDebouncedKey(key), 450);
    return () => window.clearTimeout(timeout);
  }, [key, debouncedKey]);

  const { data, error, isLoading, isValidating } = useSWR(enabled ? debouncedKey : null, runQuery, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  return {
    rows: data?.rows ?? [],
    rowCount: data?.rowCount ?? 0,
    totalRowCount: data?.totalRowCount ?? data?.rowCount ?? 0,
    limitApplied: data?.limitApplied ?? false,
    sql: data?.sql ?? null,
    error: error instanceof Error ? error.message : error ? "Query failed." : null,
    isLoading: isLoading && !data,
    isValidating,
  };
}
