import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  getNestContentRevision,
  recordNestContentRevision,
} from "@/lib/nest/nest-content-revisions";
import {
  analyseNestContentDraft,
} from "@/lib/nest/nest-knowledge-conflicts";
import {
  loadNestWorkspaceContext,
  nestContextConflictEntries,
} from "@/lib/nest/nest-workspace-context";
import {
  NEST_EDITABLE_CONFIG_FIELDS,
  type NestConflictAnalysis,
  type NestEditableConfigField,
  type NestRevisionSource,
  type NestWorkspaceKnowledgeItem,
} from "@/lib/nest/nest-workspace-types";
import { writeNestBusinessFact } from "@/lib/nest/nest-business-write";
import type { BrandKnowledgeProduct } from "@/lib/nest-portal/lib/brand-knowledge";

type MutationActor = {
  brandKey: string;
  actorUserId: string;
  actorRole: string;
};

export type NestMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: NestConflictAnalysis };

function requiresExplicitReview(analysis: NestConflictAnalysis): boolean {
  return (
    analysis.status === "contradiction" || analysis.status === "duplicate"
  );
}

export function isNestEditableConfigField(
  value: unknown,
): value is NestEditableConfigField {
  return (
    typeof value === "string" &&
    (NEST_EDITABLE_CONFIG_FIELDS as readonly string[]).includes(value)
  );
}

export async function analyseNestWorkspaceDraft(args: {
  brandKey: string;
  title: string;
  content: string;
  excludeSourceId?: string | null;
}): Promise<NestConflictAnalysis> {
  const context = await loadNestWorkspaceContext(args.brandKey);
  return analyseNestContentDraft({
    title: args.title,
    content: args.content,
    entries: nestContextConflictEntries(context),
    excludeSourceId: args.excludeSourceId,
  });
}

export async function updateNestWorkspaceConfig(args: MutationActor & {
  field: NestEditableConfigField;
  value: string;
  expectedUpdatedAt: string;
  force?: boolean;
  source?: NestRevisionSource;
}): Promise<NestMutationResult<{ updatedAt: string; value: string }>> {
  const context = await loadNestWorkspaceContext(args.brandKey);
  const field = context.fields.find((item) => item.key === args.field);
  if (!field) throw new Error("Nest setting not found.");
  if (context.configUpdatedAt !== args.expectedUpdatedAt) {
    throw new Error(
      "This Nest setting changed since you opened it. Reload and review the latest version.",
    );
  }

  const analysis = await analyseNestContentDraft({
    title: field.label,
    content: args.value,
    entries: nestContextConflictEntries(context),
    excludeSourceId: `config:${args.field}`,
  });
  if (!args.force && requiresExplicitReview(analysis)) {
    return { ok: false, conflict: analysis };
  }

  const write = await writeNestBusinessFact({
    brandKey: args.brandKey,
    field: args.field,
    value: args.value.trim(),
    currentFieldValue: field.value,
    currentExtraKnowledge: context.fields.find(
      (item) => item.key === "extra_knowledge",
    )?.value,
    expectedUpdatedAt: args.expectedUpdatedAt,
  });

  const next = await loadNestWorkspaceContext(args.brandKey);
  const nextField = next.fields.find((item) => item.key === args.field);
  await recordNestContentRevision({
    brandKey: args.brandKey,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    source: args.source ?? "manual",
    targetType: "config",
    targetKey: args.field,
    operation: "update",
    beforeValue: {
      field: args.field,
      value: field.value,
      updatedAt: context.configUpdatedAt,
    },
    afterValue: {
      field: args.field,
      value: nextField?.value ?? args.value.trim(),
      updatedAt: next.configUpdatedAt,
    },
  });
  if (
    write.extraKnowledgeUpdated &&
    write.previousExtraKnowledge !== null &&
    write.extraKnowledgeValue !== null
  ) {
    await recordNestContentRevision({
      brandKey: args.brandKey,
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      source: args.source ?? "manual",
      targetType: "config",
      targetKey: "extra_knowledge",
      operation: "update",
      beforeValue: {
        field: "extra_knowledge",
        value: write.previousExtraKnowledge,
      },
      afterValue: {
        field: "extra_knowledge",
        value: write.extraKnowledgeValue,
      },
      metadata: { reason: "booking_conflict_scrub" },
    });
  }
  return {
    ok: true,
    value: {
      value: nextField?.value ?? args.value.trim(),
      updatedAt: next.configUpdatedAt,
    },
  };
}

export async function createNestWorkspaceKnowledge(args: MutationActor & {
  title: string;
  content: string;
  assignedProducts: BrandKnowledgeProduct[];
  force?: boolean;
  source?: NestRevisionSource;
}): Promise<NestMutationResult<NestWorkspaceKnowledgeItem>> {
  const context = await loadNestWorkspaceContext(args.brandKey);
  const analysis = await analyseNestContentDraft({
    title: args.title,
    content: args.content,
    entries: nestContextConflictEntries(context),
  });
  if (!args.force && requiresExplicitReview(analysis)) {
    return { ok: false, conflict: analysis };
  }

  const response = await proxyNestBrandPortalRequest(args.brandKey, {
    method: "POST",
    endpoint: "brand-portal-knowledge",
    body: {
      title: args.title.trim() || "Untitled",
      content_text: args.content.trim(),
      assigned_products: args.assignedProducts,
    },
  });
  const itemId =
    response.item && typeof response.item === "object"
      ? String((response.item as Record<string, unknown>).id ?? "")
      : "";
  const next = await loadNestWorkspaceContext(args.brandKey);
  const item = next.knowledge.find((row) => row.id === itemId);
  if (!item) throw new Error("Nest saved the detail but could not reload it.");

  await recordNestContentRevision({
    brandKey: args.brandKey,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    source: args.source ?? "manual",
    targetType: "knowledge",
    targetKey: item.id,
    operation: "create",
    beforeValue: null,
    afterValue: { ...item },
  });
  return { ok: true, value: item };
}

export async function updateNestWorkspaceKnowledge(args: MutationActor & {
  itemId: string;
  title: string;
  content: string;
  assignedProducts: BrandKnowledgeProduct[];
  expectedUpdatedAt: string;
  force?: boolean;
  source?: NestRevisionSource;
}): Promise<NestMutationResult<NestWorkspaceKnowledgeItem>> {
  const context = await loadNestWorkspaceContext(args.brandKey);
  const existing = context.knowledge.find((item) => item.id === args.itemId);
  if (!existing) throw new Error("Knowledge item not found.");
  if (existing.updatedAt !== args.expectedUpdatedAt) {
    throw new Error(
      "This knowledge item changed since you opened it. Reload and review the latest version.",
    );
  }
  if (existing.legacyFieldKey) {
    throw new Error("Edit this item from its business fact instead.");
  }

  const analysis = await analyseNestContentDraft({
    title: args.title,
    content: args.content,
    entries: nestContextConflictEntries(context),
    excludeSourceId: `knowledge:${args.itemId}`,
  });
  if (!args.force && requiresExplicitReview(analysis)) {
    return { ok: false, conflict: analysis };
  }

  await proxyNestBrandPortalRequest(args.brandKey, {
    method: "PATCH",
    endpoint: "brand-portal-knowledge",
    body: {
      id: args.itemId,
      title: args.title.trim() || "Untitled",
      content_text: args.content.trim(),
      assigned_products: args.assignedProducts,
      expected_updated_at: args.expectedUpdatedAt,
    },
  });
  const next = await loadNestWorkspaceContext(args.brandKey);
  const item = next.knowledge.find((row) => row.id === args.itemId);
  if (!item) throw new Error("Nest updated the detail but could not reload it.");

  await recordNestContentRevision({
    brandKey: args.brandKey,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    source: args.source ?? "manual",
    targetType: "knowledge",
    targetKey: args.itemId,
    operation: "update",
    beforeValue: { ...existing },
    afterValue: { ...item },
  });
  return { ok: true, value: item };
}

export async function deleteNestWorkspaceKnowledge(args: MutationActor & {
  itemId: string;
  expectedUpdatedAt: string;
  source?: NestRevisionSource;
}): Promise<NestWorkspaceKnowledgeItem> {
  const context = await loadNestWorkspaceContext(args.brandKey);
  const existing = context.knowledge.find((item) => item.id === args.itemId);
  if (!existing) throw new Error("Knowledge item not found.");
  if (existing.legacyFieldKey) {
    throw new Error("Clear this item from its business fact instead.");
  }
  if (existing.updatedAt !== args.expectedUpdatedAt) {
    throw new Error(
      "This knowledge item changed since you opened it. Reload and review the latest version.",
    );
  }

  await proxyNestBrandPortalRequest(args.brandKey, {
    method: "DELETE",
    endpoint: "brand-portal-knowledge",
    body: {
      id: args.itemId,
      expected_updated_at: args.expectedUpdatedAt,
    },
  });
  await recordNestContentRevision({
    brandKey: args.brandKey,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    source: args.source ?? "manual",
    targetType: "knowledge",
    targetKey: args.itemId,
    operation: "delete",
    beforeValue: { ...existing },
    afterValue: null,
  });
  return existing;
}

export async function restoreNestWorkspaceRevision(args: MutationActor & {
  revisionId: string;
}): Promise<void> {
  const revision = await getNestContentRevision(
    args.brandKey,
    args.revisionId,
  );
  if (!revision) throw new Error("Change history entry not found.");

  const context = await loadNestWorkspaceContext(args.brandKey);
  if (revision.targetType === "config") {
    const field = revision.targetKey;
    if (!isNestEditableConfigField(field)) {
      throw new Error("This setting cannot be restored here.");
    }
    const previousValue =
      typeof revision.beforeValue?.value === "string"
        ? revision.beforeValue.value
        : "";
    const current = context.fields.find((item) => item.key === field);
    await writeNestBusinessFact({
      brandKey: args.brandKey,
      field,
      value: previousValue,
      currentFieldValue: current?.value ?? "",
      expectedUpdatedAt: context.configUpdatedAt,
    });
    await recordNestContentRevision({
      brandKey: args.brandKey,
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      source: "restore",
      targetType: "config",
      targetKey: field,
      operation: "restore",
      beforeValue: current
        ? {
            field,
            value: current.value,
            updatedAt: context.configUpdatedAt,
          }
        : null,
      afterValue: { field, value: previousValue },
      restoredFromRevisionId: revision.id,
    });
    return;
  }

  const before = revision.beforeValue;
  const current = context.knowledge.find(
    (item) => item.id === revision.targetKey,
  );
  if (!before) {
    if (current) {
      await proxyNestBrandPortalRequest(args.brandKey, {
        method: "DELETE",
        endpoint: "brand-portal-knowledge",
        body: { id: current.id, expected_updated_at: current.updatedAt },
      });
    }
  } else if (current) {
    await proxyNestBrandPortalRequest(args.brandKey, {
      method: "PATCH",
      endpoint: "brand-portal-knowledge",
      body: {
        id: current.id,
        title: String(before.title ?? "Untitled"),
        content_text: String(before.content ?? ""),
        assigned_products: before.assignedProducts,
        expected_updated_at: current.updatedAt,
      },
    });
  } else {
    await proxyNestBrandPortalRequest(args.brandKey, {
      method: "POST",
      endpoint: "brand-portal-knowledge",
      body: {
        title: String(before.title ?? "Untitled"),
        content_text: String(before.content ?? ""),
        assigned_products: before.assignedProducts,
      },
    });
  }

  await recordNestContentRevision({
    brandKey: args.brandKey,
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    source: "restore",
    targetType: "knowledge",
    targetKey: revision.targetKey,
    operation: "restore",
    beforeValue: current ? { ...current } : null,
    afterValue: before,
    restoredFromRevisionId: revision.id,
  });
}
