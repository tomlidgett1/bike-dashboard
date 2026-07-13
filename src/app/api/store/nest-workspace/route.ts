import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listNestContentRevisions } from "@/lib/nest/nest-content-revisions";
import { loadNestWorkspaceContext } from "@/lib/nest/nest-workspace-context";
import {
  analyseNestWorkspaceDraft,
  createNestWorkspaceKnowledge,
  deleteNestWorkspaceKnowledge,
  restoreNestWorkspaceRevision,
  updateNestWorkspaceConfig,
  updateNestWorkspaceKnowledge,
} from "@/lib/nest/nest-workspace-mutations";
import { requireStoreNestAccess } from "@/lib/nest/store-nest-access";
import { NEST_EDITABLE_CONFIG_FIELDS } from "@/lib/nest/nest-workspace-types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const productSchema = z.enum([
  "nest_chat",
  "phone_assistant",
  "nest_outbound",
]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("analyse"),
    title: z.string().max(200),
    content: z.string().min(1).max(50_000),
    excludeSourceId: z.string().max(200).nullish(),
  }),
  z.object({
    action: z.literal("config.update"),
    field: z.enum(NEST_EDITABLE_CONFIG_FIELDS),
    value: z.string().max(50_000),
    expectedUpdatedAt: z.string().min(1),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("knowledge.create"),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(100_000),
    assignedProducts: z.array(productSchema).min(1),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("knowledge.update"),
    itemId: z.string().uuid(),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(100_000),
    assignedProducts: z.array(productSchema).min(1),
    expectedUpdatedAt: z.string().min(1),
    force: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("knowledge.delete"),
    itemId: z.string().uuid(),
    expectedUpdatedAt: z.string().min(1),
  }),
  z.object({
    action: z.literal("revision.restore"),
    revisionId: z.string().uuid(),
  }),
]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorStatus(message: string): number {
  if (/changed since|reload and review/i.test(message)) return 409;
  if (/not found/i.test(message)) return 404;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireStoreNestAccess();
    if ("error" in access) return access.error;
    const view = request.nextUrl.searchParams.get("view");
    if (view === "history") {
      const revisions = await listNestContentRevisions(access.brandKey);
      return json({ revisions });
    }
    const context = await loadNestWorkspaceContext(access.brandKey);
    return json({ context });
  } catch (error) {
    console.error("[store/nest-workspace] GET failed:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load the Nest workspace.",
      },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireStoreNestAccess();
    if ("error" in access) return access.error;

    const raw = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        {
          error: "Invalid Nest workspace request.",
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const actor = {
      brandKey: access.brandKey,
      actorUserId: access.actorUserId,
      actorRole: access.role,
    };
    const body = parsed.data;

    if (body.action === "analyse") {
      const analysis = await analyseNestWorkspaceDraft({
        brandKey: access.brandKey,
        title: body.title,
        content: body.content,
        excludeSourceId: body.excludeSourceId,
      });
      return json({ analysis });
    }

    if (body.action === "config.update") {
      const result = await updateNestWorkspaceConfig({
        ...actor,
        field: body.field,
        value: body.value,
        expectedUpdatedAt: body.expectedUpdatedAt,
        force: body.force,
      });
      return result.ok
        ? json({ ok: true, result: result.value })
        : json({ ok: false, conflict: result.conflict }, 409);
    }

    if (body.action === "knowledge.create") {
      const result = await createNestWorkspaceKnowledge({
        ...actor,
        title: body.title,
        content: body.content,
        assignedProducts: body.assignedProducts,
        force: body.force,
      });
      return result.ok
        ? json({ ok: true, item: result.value })
        : json({ ok: false, conflict: result.conflict }, 409);
    }

    if (body.action === "knowledge.update") {
      const result = await updateNestWorkspaceKnowledge({
        ...actor,
        itemId: body.itemId,
        title: body.title,
        content: body.content,
        assignedProducts: body.assignedProducts,
        expectedUpdatedAt: body.expectedUpdatedAt,
        force: body.force,
      });
      return result.ok
        ? json({ ok: true, item: result.value })
        : json({ ok: false, conflict: result.conflict }, 409);
    }

    if (body.action === "knowledge.delete") {
      const item = await deleteNestWorkspaceKnowledge({
        ...actor,
        itemId: body.itemId,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return json({ ok: true, item });
    }

    await restoreNestWorkspaceRevision({
      ...actor,
      revisionId: body.revisionId,
    });
    return json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update Nest.";
    console.error("[store/nest-workspace] POST failed:", error);
    return json({ error: message }, errorStatus(message));
  }
}
