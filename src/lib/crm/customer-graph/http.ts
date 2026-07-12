import { NextResponse } from "next/server";
import { isStoreCrmV2Enabled } from "../feature-flags";
import { CrmRepositoryError } from "./repository";
import {
  resolveCrmStoreContext,
  type CrmStoreContext,
} from "./store-context";
import type { ApiErrorCode, JsonValue } from "./types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function crmApiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, JsonValue>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export async function requireCrmContext(): Promise<
  { context: CrmStoreContext } | { error: NextResponse }
> {
  if (!isStoreCrmV2Enabled()) {
    return {
      error: crmApiError(
        "CRM_NOT_AVAILABLE",
        "The customer workspace is currently unavailable.",
        503,
      ),
    };
  }
  const result = await resolveCrmStoreContext();
  if ("error" in result) return result;
  if (!result.context.crmEnabled) {
    return {
      error: crmApiError(
        "CRM_NOT_AVAILABLE",
        "CRM is not enabled for this store.",
        403,
      ),
    };
  }
  return result;
}

export function parseLimit(
  value: string | null,
  options: { fallback: number; maximum: number },
): number | null {
  if (value == null || value === "") return options.fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(options.maximum, parsed);
}

export function crmRouteError(error: unknown, operation: string): NextResponse {
  console.error(`[store/crm/${operation}]`, error);
  if (error instanceof CrmRepositoryError) {
    if (error.operation === "action_conflict") {
      return crmApiError("CONFLICT", error.message, 409);
    }
    if (
      error.operation === "unsupported_action_source" ||
      /cursor is invalid/i.test(error.message)
    ) {
      return crmApiError("INVALID_REQUEST", error.message, 400);
    }
    return crmApiError(
      "DATABASE_ERROR",
      "CRM data could not be loaded. Please try again.",
      500,
      { operation: error.operation },
    );
  }
  if (
    error instanceof Error &&
    /no longer pending|already|expired|updated elsewhere/i.test(error.message)
  ) {
    return crmApiError("CONFLICT", error.message, 409);
  }
  return crmApiError(
    "DATABASE_ERROR",
    error instanceof Error ? error.message : "The CRM request failed.",
    500,
  );
}
