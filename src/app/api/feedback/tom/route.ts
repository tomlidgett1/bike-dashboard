import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MIN_FEEDBACK_LENGTH = 10;
const MAX_FEEDBACK_LENGTH = 8000;

function asTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const feedbackText = asTrimmedString(body.feedbackText, MAX_FEEDBACK_LENGTH);
  const pagePath = asTrimmedString(body.pagePath, 500);
  const pageTitle = asTrimmedString(body.pageTitle, 240);
  const pageUrl = asTrimmedString(body.pageUrl, 2000);
  const pageSearch = asTrimmedString(body.pageSearch, 1000);
  const context = asRecord(body.context);

  if (!pagePath) {
    return NextResponse.json({ error: "Page path is required" }, { status: 400 });
  }

  if (!feedbackText || feedbackText.length < MIN_FEEDBACK_LENGTH) {
    return NextResponse.json(
      {
        error: `Feedback must be at least ${MIN_FEEDBACK_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("tom_feedback_submissions")
    .insert({
      user_id: user.id,
      page_path: pagePath,
      page_title: pageTitle,
      page_url: pageUrl,
      page_search: pageSearch,
      feedback_text: feedbackText,
      context: {
        ...context,
        submitted_from: "store_dashboard",
        server_received_at: new Date().toISOString(),
      },
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[tom-feedback] insert failed:", error);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
