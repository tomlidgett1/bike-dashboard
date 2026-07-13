import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  NestContentRevision,
  NestRevisionOperation,
  NestRevisionSource,
  NestRevisionTargetType,
} from "@/lib/nest/nest-workspace-types";

type RevisionWrite = {
  brandKey: string;
  actorUserId: string;
  actorRole: string;
  source: NestRevisionSource;
  targetType: NestRevisionTargetType;
  targetKey: string;
  operation: NestRevisionOperation;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  restoredFromRevisionId?: string | null;
  metadata?: Record<string, unknown>;
};

function mapRevision(row: Record<string, unknown>): NestContentRevision {
  return {
    id: String(row.id ?? ""),
    brandKey: String(row.brand_key ?? ""),
    actorUserId:
      typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorRole: String(row.actor_role ?? "staff"),
    source: row.source as NestRevisionSource,
    targetType: row.target_type as NestRevisionTargetType,
    targetKey: String(row.target_key ?? ""),
    operation: row.operation as NestRevisionOperation,
    beforeValue:
      row.before_value && typeof row.before_value === "object"
        ? (row.before_value as Record<string, unknown>)
        : null,
    afterValue:
      row.after_value && typeof row.after_value === "object"
        ? (row.after_value as Record<string, unknown>)
        : null,
    restoredFromRevisionId:
      typeof row.restored_from_revision_id === "string"
        ? row.restored_from_revision_id
        : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function recordNestContentRevision(
  input: RevisionWrite,
): Promise<NestContentRevision> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("nest_brand_content_revisions")
    .insert({
      brand_key: input.brandKey,
      actor_user_id: input.actorUserId,
      actor_role: input.actorRole,
      source: input.source,
      target_type: input.targetType,
      target_key: input.targetKey,
      operation: input.operation,
      before_value: input.beforeValue,
      after_value: input.afterValue,
      restored_from_revision_id: input.restoredFromRevisionId ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "42P01" || error?.message?.includes("nest_brand_content_revisions")) {
      console.warn("[nest-content-revisions] history table unavailable:", error.message);
      return {
        id: "",
        brandKey: input.brandKey,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        source: input.source,
        targetType: input.targetType,
        targetKey: input.targetKey,
        operation: input.operation,
        beforeValue: input.beforeValue,
        afterValue: input.afterValue,
        restoredFromRevisionId: input.restoredFromRevisionId ?? null,
        createdAt: new Date().toISOString(),
      };
    }
    throw new Error(error?.message ?? "Could not record Nest change history.");
  }
  return mapRevision(data as Record<string, unknown>);
}

export async function listNestContentRevisions(
  brandKey: string,
  limit = 100,
): Promise<NestContentRevision[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("nest_brand_content_revisions")
    .select("*")
    .eq("brand_key", brandKey)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (error) {
    if (error.code === "42P01") return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRevision(row as Record<string, unknown>));
}

export async function getNestContentRevision(
  brandKey: string,
  revisionId: string,
): Promise<NestContentRevision | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("nest_brand_content_revisions")
    .select("*")
    .eq("id", revisionId)
    .eq("brand_key", brandKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapRevision(data as Record<string, unknown>) : null;
}
