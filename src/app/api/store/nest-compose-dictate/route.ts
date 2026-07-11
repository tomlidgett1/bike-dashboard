import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

function openAiKey(): string | null {
  const key =
    process.env.OPENAI_API_KEY?.trim() || process.env.NEST_OPENAI_API_KEY?.trim() || "";
  return key || null;
}

function openAiClient(): OpenAI {
  const apiKey = openAiKey();
  if (!apiKey) throw new Error("Dictation is not configured.");
  return new OpenAI({ apiKey });
}

const TRANSCRIPTION_PROMPT =
  "A bike shop staff member dictating a text message to send to a customer. " +
  "Common terms: service, repair, parts, ready for pickup, collection, payment, " +
  "workorder, call us, derailleur, brakes, tyres, tune-up, quote.";

const DISTILL_INSTRUCTIONS = `You turn a bike shop staff member's raw spoken brain-dump into the BODY of a customer text message (SMS/iMessage).

The transcript is messy stream-of-consciousness: rambling, repeating, filler ("um", "yeah", "let me think"), false starts, and corrections. Pauses and line breaks carry no meaning — treat the whole thing as one brain-dump to distil.

Your job is to DISTIL into a clear, polite message body:
- Warm, professional, and concise — suitable for texting a customer
- Australian English spelling; no emoji
- 1–3 short paragraphs OR a few tight sentences (under ~450 characters unless they clearly need more detail)
- Merge repeated points into one; drop filler and thinking-out-loud
- Keep only facts they actually said — NEVER invent prices, dates, parts, promises, or availability
- Plain language; trim internal shop jargon where a customer would not need it
- Do NOT include a greeting (no "Hi …") or sign-off (no "Cheers" / store name) — middle body only

Return ONLY the finished message body — no preamble, labels, or code fences.`;

function pickExtension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  return "mp3";
}

/**
 * POST /api/store/nest-compose-dictate
 *
 * FormData:
 * - `audio` — record then transcribe + distil
 * - `transcript` — re-distil an existing transcript (optional)
 * - `customerName` — optional, for tone context only
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    if (!openAiKey()) {
      return NextResponse.json({ error: "Dictation is not configured." }, { status: 500 });
    }

    const openai = openAiClient();
    const form = await request.formData();
    const existingTranscript = String(form.get("transcript") ?? "").trim();
    const customerName = String(form.get("customerName") ?? "").trim();
    const audio = form.get("audio");

    let transcript = existingTranscript;

    if (!transcript) {
      if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json({ error: "No audio received." }, { status: 400 });
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: "Recording too long — keep it under a couple of minutes." },
          { status: 413 },
        );
      }

      const mime = audio.type || "audio/webm";
      const file = new File(
        [await audio.arrayBuffer()],
        `nest-dictation.${pickExtension(mime)}`,
        { type: mime },
      );

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-transcribe",
        language: "en",
        prompt: TRANSCRIPTION_PROMPT,
      });

      transcript = transcription.text?.trim() ?? "";
      if (!transcript) {
        return NextResponse.json(
          { error: "Couldn't hear anything — try again closer to the mic." },
          { status: 422 },
        );
      }
    }

    transcript = transcript.replace(/\s+/g, " ").trim();

    const audienceLine = customerName
      ? `The message is for customer ${customerName.split(/\s+/)[0] || customerName}.`
      : "The message is for a bike shop customer.";

    const formatResponse = await openai.responses.create({
      model: "gpt-5.4",
      instructions: DISTILL_INSTRUCTIONS,
      input: `${audienceLine}\n\nTRANSCRIPT:\n${transcript}`,
    });

    const body = formatResponse.output_text?.trim() || transcript;

    return NextResponse.json({ transcript, body });
  } catch (error) {
    console.error("[nest-compose-dictate] failed:", error);
    const message = error instanceof Error ? error.message : "Dictation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
