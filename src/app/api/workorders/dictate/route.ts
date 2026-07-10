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

const FORMAT_MODEL = 'gpt-5.4-mini'

const FORMAT_INSTRUCTIONS = `You format a bike mechanic's dictated service notes so they can be appended to the customer-facing notes on a workorder.

Rules:
- Rewrite the transcript to follow the provided template EXACTLY — same headings, same ordering, same style.
- Only use information the mechanic actually said. Never invent work, parts, or prices. If a template section has no matching content, omit that section entirely.
- Fix dictation artefacts (um/ah, false starts, mis-hearings that are obvious from bike context) but keep the mechanic's meaning.
- Keep it concise and customer-readable. Australian English.
- Return ONLY the formatted note text — no preamble, no code fences.`

const CLEANUP_INSTRUCTIONS = `You tidy a bike mechanic's dictated service notes so they can be appended to the customer-facing notes on a workorder.

Rules:
- Keep everything the mechanic said, in the order they said it.
- Remove filler words and false starts; fix punctuation and obvious mis-hearings from bike context.
- Break the work into short "- " bullet points, one per job done.
- Never invent work, parts, or prices. Australian English.
- Return ONLY the note text — no preamble, no code fences.`

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
 * FormData: `audio` (recorded blob) + optional `template` (text the note
 * must adhere to). Transcribes with OpenAI's latest transcription model,
 * then reshapes the transcript to the template. Returns the note for the
 * mechanic to review before it is appended to the workorder.
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
    const audio = form.get('audio')
    const template = String(form.get('template') ?? '').trim()

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

    const transcript = transcription.text?.trim()
    if (!transcript) {
      return NextResponse.json({ error: "Couldn't hear anything — try again closer to the mic" }, { status: 422 })
    }

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
