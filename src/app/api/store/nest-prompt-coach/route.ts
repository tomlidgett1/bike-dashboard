import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import {
  applyPromptCoachProposals,
  runPromptCoachChat,
  undoPromptCoachChange,
  type PromptCoachChatMessage,
  type PromptCoachProposal,
  type PromptCoachUndoSnapshot,
} from "@/lib/nest/prompt-coach";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseChatHistory(raw: unknown): PromptCoachChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const role = row.role === "user" || row.role === "assistant" ? row.role : null;
      const text =
        typeof row.text === "string"
          ? row.text
          : typeof row.content === "string"
            ? row.content
            : "";
      if (!role || !text.trim()) return null;
      return { role, text: text.trim() };
    })
    .filter((item): item is PromptCoachChatMessage => Boolean(item));
}

function parseProposals(raw: unknown): PromptCoachProposal[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is PromptCoachProposal => {
    if (!item || typeof item !== "object") return false;
    const row = item as PromptCoachProposal;
    return (
      typeof row.id === "string" &&
      (row.target === "config" || row.target === "knowledge") &&
      (row.operation === "add" ||
        row.operation === "append" ||
        row.operation === "replace" ||
        row.operation === "delete") &&
      (row.status === "ready" || row.status === "contradiction" || row.status === "duplicate") &&
      typeof row.summary === "string"
    );
  });
}

function parseUndoSnapshot(raw: unknown): PromptCoachUndoSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as PromptCoachUndoSnapshot;
  if (typeof row.proposalId !== "string") return null;
  if (row.target !== "config" && row.target !== "knowledge") return null;
  if (
    row.operationApplied !== "add" &&
    row.operationApplied !== "append" &&
    row.operationApplied !== "replace" &&
    row.operationApplied !== "delete"
  ) {
    return null;
  }
  return row;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    if (!isNestMessagingConfigured()) {
      return json({ error: "Nest messaging is not configured yet." }, 503);
    }

    const brandKey = resolveStoreNestBrandKey(auth.profile);
    if (!brandKey) {
      return json({ error: "Could not resolve Nest brand for this store." }, 400);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const action = typeof body.action === "string" ? body.action : "chat";

    if (action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json({ error: "message is required" }, 400);

      const result = await runPromptCoachChat({
        brandKey,
        message,
        chatHistory: parseChatHistory(body.chatHistory ?? body.history),
      });

      return json({
        reply: result.reply,
        followUp: result.followUp,
        proposals: result.proposals,
      });
    }

    if (action === "apply") {
      const proposals = parseProposals(body.proposals);
      if (proposals.length === 0) {
        return json({ error: "proposals are required" }, 400);
      }

      const force = body.force === true;
      const result = await applyPromptCoachProposals({
        brandKey,
        proposals,
        force,
      });

      const allOk = result.applied.every((item) => item.ok);
      const successSummaries = result.applied
        .filter((item) => item.ok)
        .map((item) => item.summary);
      const reply =
        successSummaries.length > 0
          ? successSummaries.join(" · ")
          : "Nothing was applied.";

      return json({
        ok: allOk,
        reply,
        applied: result.applied,
      });
    }

    if (action === "undo") {
      const undo = parseUndoSnapshot(body.undo);
      if (!undo) return json({ error: "undo snapshot is required" }, 400);

      const result = await undoPromptCoachChange({ brandKey, undo });
      return json({
        ok: result.ok,
        reply: result.summary,
        error: result.error,
      });
    }

    return json({ error: "Unknown action. Use chat, apply, or undo." }, 400);
  } catch (error) {
    console.error("[nest-prompt-coach]", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not run Nest Prompt Coach.",
      },
      500,
    );
  }
}
