import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { runNestTestChatLocal } from "@/lib/nest/nest-test-chat";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
      return json({ error: "This store is not linked to a Nest brand yet." }, 400);
    }

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

    const history: Array<{ role: "user" | "assistant"; text: string }> = [];
    if (Array.isArray(body.history)) {
      for (const item of body.history) {
        if (!item || typeof item !== "object") continue;
        const row = item as { role?: unknown; text?: unknown };
        const role = row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : null;
        const text = typeof row.text === "string" ? row.text.trim() : "";
        if (!role || !text) continue;
        history.push({ role, text });
      }
    }

    const result = await runNestTestChatLocal({
      brandKey,
      message,
      chatHistory: history,
    });

    return json({
      chatId,
      reply: result.reply,
      brand: result.brand,
      mode: "fast",
    });
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
