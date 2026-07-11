import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_AUDIO_BYTES = 4 * 1024 * 1024 // stay under the Vercel body limit

/**
 * Bias transcription towards bike-workshop vocabulary. gpt-4o-transcribe uses
 * the prompt for domain context the same way Whisper did.
 */
const TRANSCRIPTION_PROMPT =
  'A bike shop mechanic dictating service notes for a customer workorder. ' +
  'Common terms: derailleur, cassette, chainring, bottom bracket, headset, drivetrain, ' +
  'brake pads, rotors, bled brakes, gear cable, jockey wheels, tubeless, sealant, ' +
  'trued wheel, spoke tension, bar tape, Shimano, SRAM, Di2, AXS, 105, Ultegra, GX, ' +
  'torqued, indexed gears, safety check, test ride.'

const FORMAT_MODEL = 'gpt-5.4'

// The transcript is a raw, unstructured spoken brain-dump. This framing is
// shared by both modes: the mechanic thinks out loud — rambling, repeating,
// pausing mid-thought, correcting themselves, jumping between jobs. Pauses,
// filler and the ORDER things were said in carry no meaning. The model must
// DISTILL the whole stream into precise points, not transcribe it line by line.
const DISTILL_CONTEXT = `The text you receive is a bike mechanic thinking out loud while dictating what they did to a customer's bike. It is a raw, messy stream of consciousness: they ramble, repeat themselves, trail off, pause mid-sentence, say "um" and "yeah" and "let me think", correct themselves, and jump back and forth between jobs.

Critically: the pauses, the filler, and the ORDER things were said in mean NOTHING. Sentence breaks and line breaks in the transcript are just where they drew breath — they are NOT point boundaries. Treat the entire transcript as ONE continuous brain-dump to be distilled.

Your job is to DISTILL, never to transcribe:
- Extract only the real substance: work actually done, parts fitted, and findings or recommendations.
- MERGE every mention of the same job or part into a SINGLE point, even when it is scattered across the whole recording. If they circle back to something three times, it is still one point.
- Delete filler, false starts, thinking-out-loud, and anything a later correction supersedes.
- One bullet = one distinct action or finding. A two-minute ramble about one job becomes ONE tight bullet, not many.
- Reorder into a sensible service order: work performed first, recommendations/next-visit items last.
- Write like a mechanic writing up a job card: short past-tense phrases ("Replaced worn chain and cassette", "Bled spongy rear brake"). Australian English. Customer-readable.
- NEVER invent work, parts, prices, or any detail that was not actually said.`

const DISTILL_EXAMPLE = `Example of the distillation expected —
RAW BRAIN-DUMP:
"Okay so this one, um, yeah I did a full service on it. The chain was pretty worn so I replaced the chain. Oh and the cassette, that was, that was shot as well so that's done too. Gears were skipping a bit, indexed them front and rear. Um. Let me think. The rear brake felt a bit spongy so I gave it a bleed. Yeah so chain and cassette both replaced. Front wheel had a slight wobble in it, trued that up. I'd say they'll want new tyres next time, they're getting a bit low but they're alright for now. Took it for a test ride, all good."
DISTILLED NOTES:
- Full service completed
- Replaced worn chain and cassette
- Indexed gears front and rear (were skipping)
- Bled spongy rear brake
- Trued front wheel
- Test ridden — all good
- Recommend new tyres at next service (getting low)`

const FORMAT_INSTRUCTIONS = `You turn a bike mechanic's raw spoken brain-dump into clean service notes that follow a specific template.

${DISTILL_CONTEXT}

Then fit the distilled points into the provided template:
- Follow the template's headings, ordering and style EXACTLY.
- Place each distilled point under the heading it belongs to.
- If a template section has no matching content, omit that section entirely.

${DISTILL_EXAMPLE}

Return ONLY the finished notes in the template's shape — no preamble, no commentary, no code fences.`

const CLEANUP_INSTRUCTIONS = `You turn a bike mechanic's raw spoken brain-dump into a clean, precise set of service notes.

${DISTILL_CONTEXT}

${DISTILL_EXAMPLE}

Return ONLY the finished notes as "- " bullet points — no headings, no preamble, no commentary, no code fences.`

function pickExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('wav')) return 'wav'
  return 'mp3'
}

/**
 * POST /api/workorders/dictate
 *
 * FormData modes:
 * 1. `audio` (+ optional `template`) — transcribe then format
 * 2. `transcript` (+ optional `template`) — re-format an existing transcript
 *    when the mechanic switches note format in the review popup
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Transcription is not configured' }, { status: 500 })
    }

    const form = await request.formData()
    const template = String(form.get('template') ?? '').trim()
    const existingTranscript = String(form.get('transcript') ?? '').trim()
    const audio = form.get('audio')

    let transcript = existingTranscript

    if (!transcript) {
      if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json({ error: 'No audio received' }, { status: 400 })
      }
      if (audio.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: 'Recording too long — keep it under a few minutes' }, { status: 413 })
      }

      const mime = audio.type || 'audio/webm'
      const file = new File([await audio.arrayBuffer()], `dictation.${pickExtension(mime)}`, { type: mime })

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'gpt-4o-transcribe',
        language: 'en',
        prompt: TRANSCRIPTION_PROMPT,
      })

      transcript = transcription.text?.trim() ?? ''
      if (!transcript) {
        return NextResponse.json({ error: "Couldn't hear anything — try again closer to the mic" }, { status: 422 })
      }
    }

    // Collapse the transcript to a single continuous run of text. gpt-4o-transcribe
    // inserts line/sentence breaks where the speaker paused; if those survive, the
    // formatter reads them as point boundaries and emits one bullet per pause. Wiping
    // them forces true distillation from the meaning, not the breath pattern.
    transcript = transcript.replace(/\s+/g, ' ').trim()

    const formatResponse = await openai.responses.create({
      model: FORMAT_MODEL,
      instructions: template ? FORMAT_INSTRUCTIONS : CLEANUP_INSTRUCTIONS,
      input: template
        ? `TEMPLATE:\n${template}\n\nTRANSCRIPT:\n${transcript}`
        : `TRANSCRIPT:\n${transcript}`,
    })

    const note = formatResponse.output_text?.trim() || transcript
    return NextResponse.json({ transcript, note })
  } catch (error) {
    console.error('[workorders/dictate] failed:', error)
    const message = error instanceof Error ? error.message : 'Transcription failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
