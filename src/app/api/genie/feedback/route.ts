import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reflectAndStoreLessons } from "@/lib/genie/lesson-reflection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Rating = "up" | "down" | "none";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("account_type, bicycle_store, business_name")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: {
    messageId?: unknown;
    conversationId?: unknown;
    rating?: unknown;
    question?: unknown;
    answer?: unknown;
    note?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const ratingRaw = body.rating;
  const rating: Rating = ratingRaw === "up" || ratingRaw === "down" ? ratingRaw : "none";
  if (!messageId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const question = typeof body.question === "string" ? body.question : "";
  const answer = typeof body.answer === "string" ? body.answer : "";
  const note = typeof body.note === "string" ? body.note : null;

  // Clearing a rating removes the row.
  if (rating === "none") {
    await supabase
      .from("genie_message_feedback")
      .delete()
      .eq("user_id", user.id)
      .eq("message_id", messageId);
    return NextResponse.json({ ok: true, rating: "none" });
  }

  const { error } = await supabase.from("genie_message_feedback").upsert(
    {
      user_id: user.id,
      message_id: messageId,
      conversation_id: conversationId,
      rating,
      question: question.slice(0, 4000),
      answer: answer.slice(0, 8000),
      note: note?.slice(0, 1000) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,message_id" },
  );

  if (error) {
    // Likely the migration hasn't been applied yet — don't 500 the UI.
    console.error("[genie/feedback] upsert failed", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  // Learn from the feedback in the background — 👎 to correct, 👍 to reinforce.
  if (question.trim() && answer.trim()) {
    const storeName = profile.business_name || "your store";
    after(async () => {
      try {
        await reflectAndStoreLessons({
          userId: user.id,
          storeName,
          question,
          answer,
          signals: { userFeedback: { rating, note } },
        });
      } catch (reflectionError) {
        console.error("[genie/feedback] reflection failed", reflectionError);
      }
    });
  }

  return NextResponse.json({ ok: true, rating });
}
