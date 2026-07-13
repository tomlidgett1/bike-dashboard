import type {
  NestConflictAnalysis,
  NestContentRevision,
  NestWorkspaceContext,
} from "@/lib/nest/nest-workspace-types";

const WORKSPACE_ENDPOINT = "/api/store/nest-workspace";

type ErrorPayload = {
  error?: string;
  conflict?: NestConflictAnalysis;
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export class NestWorkspaceConflictError extends Error {
  conflict: NestConflictAnalysis;

  constructor(conflict: NestConflictAnalysis) {
    super(conflict.summary || "This change needs review.");
    this.name = "NestWorkspaceConflictError";
    this.conflict = conflict;
  }
}

export async function loadNestWorkspace(): Promise<NestWorkspaceContext> {
  const response = await fetch(WORKSPACE_ENDPOINT, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Could not load the Nest knowledge workspace.",
    );
  }
  if (!data.context) {
    throw new Error("Nest returned an incomplete workspace.");
  }
  return data.context as NestWorkspaceContext;
}

export async function loadNestHistory(): Promise<NestContentRevision[]> {
  const response = await fetch(`${WORKSPACE_ENDPOINT}?view=history`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Could not load Nest change history.",
    );
  }
  return Array.isArray(data.revisions)
    ? (data.revisions as NestContentRevision[])
    : [];
}

export async function postNestWorkspace<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(WORKSPACE_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await parseResponse(response)) as ErrorPayload &
    Record<string, unknown>;

  if (response.status === 409 && data.conflict) {
    throw new NestWorkspaceConflictError(data.conflict);
  }
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Could not update Nest.",
    );
  }
  return data as T;
}
