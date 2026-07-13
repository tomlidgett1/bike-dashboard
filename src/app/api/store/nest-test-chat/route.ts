import { NextRequest, NextResponse } from "next/server";
import {
  runNestProductionTestTurn,
  runNestTestChatLocal,
} from "@/lib/nest/nest-test-chat";
import type { PromptCoachChatMessage } from "@/lib/nest/prompt-coach-types";
import { requireStoreNestAccess } from "@/lib/nest/store-nest-access";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseHistory(
  value: unknown,
): PromptCoachChatMessage[] {
  if (!Array.isArray(value)) return [];
  const history: PromptCoachChatMessage[] = [];
  for (const item of value.slice(-12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as { role?: unknown; text?: unknown };
    const role =
      row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : null;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!role || !text) continue;
    history.push({ role, text: text.slice(0, 1000) });
  }
  return history;
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireStoreNestAccess();
    if ("error" in access) return access.error;
    const brandKey = access.brandKey;

    let body: { message?: unknown; chatId?: unknown; history?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return json({ error: "message is required." }, 400);
    }

    const existingChatId =
      typeof body.chatId === "string" && body.chatId.trim() ? body.chatId.trim() : "";
    const chatId = existingChatId || `portal-test#${brandKey}#${Date.now()}`;

    if (existingChatId && !existingChatId.startsWith(`portal-test#${brandKey}`)) {
      return json({ error: "Invalid test chat." }, 400);
    }

    const history = parseHistory(body.history);

    try {
      const result = await runNestProductionTestTurn({
        brandKey,
        chatId,
        message,
      });

      return json({
        chatId,
        reply: result.reply,
        brand: result.brand,
        trace: result.trace,
        mode: "production",
      });
    } catch (productionError) {
      console.warn(
        "[store/nest-test-chat] production path unavailable, using local test:",
        productionError instanceof Error ? productionError.message : productionError,
      );

      const local = await runNestTestChatLocal({
        brandKey,
        message,
        chatHistory: history,
      });

      return json({
        chatId,
        reply: local.reply,
        brand: local.brand,
        trace: local.trace,
        mode: "local",
      });
    }
  } catch (error) {
    console.error("[store/nest-test-chat] POST failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Could not test Nest.",
      },
      500,
    );
  }
}
