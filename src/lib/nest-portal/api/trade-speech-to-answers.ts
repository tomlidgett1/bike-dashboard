/**
 * POST /api/trade-speech-to-answers
 *
 * Lets a tradie dictate their business details instead of filling the 30-field
 * questionnaire by hand.
 *
 * Pipeline:
 *   1. Accept a raw audio body (audio/webm or audio/mp4, up to ~4 MB).
 *   2. Forward it to OpenAI Whisper for transcription.
 *   3. Send the transcript to GPT with a strict JSON schema matching the
 *      tradie questionnaire shape (`QuestionnaireAnswers`).
 *   4. Return the extracted answers so the client can pre-fill the form and
 *      let the tradie review/tweak before submitting.
 *
 * No auth — this runs BEFORE the tradie has a session. Protected by the
 * 4 MB Vercel body limit plus the OpenAI spend guard.
 */

import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { pickServerEnv } from '../lib/server-env'

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB — Vercel function body limit is 4.5 MB

const ALLOWED_MIME = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'audio/m4a',
]

function pickExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('wav')) return 'wav'
  return 'mp3'
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

async function transcribe(
  audio: Buffer,
  mime: string,
  openaiKey: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ext = pickExtension(mime)
  const filename = `tradie.${ext}`

  // Node 20+ has global File. File in FormData is the most reliable path for
  // OpenAI's multipart parser — it uses the filename extension to detect format.
  // We copy the Buffer into a fresh Uint8Array so the underlying bytes aren't
  // tied to Buffer's shared pool (which has tripped up FormData serialisation).
  const bytes = new Uint8Array(audio.byteLength)
  bytes.set(audio)
  const file = new File([bytes], filename, { type: mime })

  const form = new FormData()
  form.append('file', file)
  form.append('model', 'whisper-1')
  form.append('response_format', 'text')
  form.append('language', 'en')
  // Bias the model towards Australian English + trades terminology.
  form.append(
    'prompt',
    'Australian tradie describing their business. Common words: plumber, electrician, callout fee, hourly rate, hot water, blocked drain, after hours, Melbourne, Sydney, Brisbane, public liability, workcover.',
  )

  console.log(
    `[trade-speech-to-answers] Whisper request: mime=${mime}, bytes=${audio.length}, filename=${filename}`,
  )

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(
      `[trade-speech-to-answers] Whisper ${res.status}: ${detail.slice(0, 500)}`,
    )
    return { ok: false, error: `whisper_${res.status}: ${detail.slice(0, 300)}` }
  }

  const text = (await res.text()).trim()
  if (!text) return { ok: false, error: 'empty_transcript' }
  return { ok: true, text }
}

const EXTRACTION_SYSTEM_PROMPT = `You turn a free-form spoken description of an Australian tradie's business into a clean, structured JSON object that matches the onboarding questionnaire shape.

Rules:
- Only fill a field if the tradie actually said something about it. Leave unclear fields as empty strings.
- Be generous: if they rambled about something that fits a field, pull it out.
- Clean up filler words ("um", "ah", "you know") and repetitions, but don't editorialise. Keep their voice.
- "trade" must be a single short label like "Plumber", "Electrician", "Carpenter" — capitalise properly.
- "tradeDescription" should be one line: e.g. "Residential plumbing — maintenance, hot water, blocked drains".
- "services" should be a short, readable list (newline-separated bullet-friendly text).
- "pricingModel" must be one of: "Fixed quote per job", "Hourly rate", "Callout + hourly", "Depends on the job" — or empty if unclear.
- "afterHours" should be one of: "Yes — same rate", "Yes — premium rate", "Emergency only", "No after-hours" — or empty.
- "insured" should be one of: "Yes — public liability + workcover", "Yes — public liability only", "No", or empty.
- "tone" should be one of: "Friendly", "Blunt", "Warm", "Professional", "Casual Aussie" — or empty.
- Phone numbers: keep however they said them; don't hallucinate digits.
- Business name: use the exact name they said (title case it if they spelled it out casually).
- Don't make up years in business, radius, prices, licence numbers, or anything they didn't mention.
- Return ALL required keys even if empty.`

function emptyAnswers() {
  return {
    trade: '',
    businessName: '',
    ownerFirstName: '',
    ownerMobile: '',
    yearsOperating: '',
    serviceArea: '',
    travelRadiusKm: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    tradeDescription: '',
    services: '',
    specialties: '',
    pricingModel: '',
    hourlyRate: '',
    calloutFee: '',
    minimumCharge: '',
    priceNotes: '',
    hours: '',
    afterHours: '',
    typicalLeadTime: '',
    licenceNumber: '',
    insured: '',
    guarantees: '',
    paymentMethods: '',
    howToBook: '',
    depositRequired: '',
    cancellationPolicy: '',
    tone: '',
    bannedTopics: '',
    anythingElse: '',
  }
}

const ANSWER_FIELDS = Object.keys(emptyAnswers())

function buildExtractionSchema() {
  const properties: Record<string, { type: string }> = {}
  for (const k of ANSWER_FIELDS) properties[k] = { type: 'string' }
  return {
    type: 'object',
    properties,
    required: ANSWER_FIELDS,
    additionalProperties: false,
  }
}

async function extractAnswers(
  transcript: string,
  openaiKey: string,
): Promise<{ ok: true; answers: Record<string, string> } | { ok: false; error: string }> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      instructions: EXTRACTION_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content:
            `Transcript of the tradie describing their business:\n\n"""\n${transcript}\n"""\n\nExtract the questionnaire answers now.`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'tradie_answers',
          strict: true,
          schema: buildExtractionSchema(),
        },
      },
      store: false,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return { ok: false, error: `extract_${res.status}: ${detail.slice(0, 200)}` }
  }

  const data = await res.json()

  let raw = ''
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    raw = data.output_text
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      const content = item?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string') raw += c.text
        }
      }
    }
  }

  if (!raw.trim()) return { ok: false, error: 'empty_extraction' }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out = emptyAnswers()
    for (const k of ANSWER_FIELDS) {
      const v = parsed[k]
      if (typeof v === 'string') (out as Record<string, string>)[k] = v.trim()
    }
    return { ok: true, answers: out }
  } catch {
    return { ok: false, error: 'bad_json_from_model' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' })
  }

  const openaiKey = pickServerEnv(['OPENAI_API_KEY', 'NEST_OPENAI_API_KEY'])
  if (!openaiKey) {
    return json(res, 500, { error: 'server_missing_openai_key' })
  }

  const contentType = String(req.headers['content-type'] ?? '').toLowerCase()
  const mime = contentType.split(';')[0].trim() || 'audio/webm'
  if (!ALLOWED_MIME.some((m) => mime.startsWith(m))) {
    return json(res, 415, { error: 'unsupported_media_type', received: mime })
  }

  // Collect raw body up to MAX_BYTES.
  const chunks: Buffer[] = []
  let total = 0
  let tooLarge = false
  try {
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > MAX_BYTES) {
          tooLarge = true
          reject(new Error('too_large'))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', resolve)
      req.on('error', reject)
    })
  } catch (err) {
    if (tooLarge) return json(res, 413, { error: 'audio_too_large', maxBytes: MAX_BYTES })
    console.error('[trade-speech-to-answers] body read failed:', (err as Error).message)
    return json(res, 400, { error: 'bad_body' })
  }

  const audio = Buffer.concat(chunks)
  if (audio.length < 1024) {
    return json(res, 400, { error: 'audio_too_short' })
  }

  const transcription = await transcribe(audio, mime, openaiKey)
  if (transcription.ok === false) {
    console.error('[trade-speech-to-answers] transcribe error:', transcription.error)
    return json(res, 502, { error: 'transcription_failed', detail: transcription.error })
  }

  const extraction = await extractAnswers(transcription.text, openaiKey)
  if (extraction.ok === false) {
    console.error('[trade-speech-to-answers] extract error:', extraction.error)
    return json(res, 502, {
      error: 'extraction_failed',
      detail: extraction.error,
      transcript: transcription.text,
    })
  }

  return json(res, 200, {
    ok: true,
    transcript: transcription.text,
    answers: extraction.answers,
  })
}

export const config = {
  api: {
    bodyParser: false,
  },
}
