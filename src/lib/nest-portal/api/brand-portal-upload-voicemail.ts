/**
 * POST /api/brand-portal-upload-voicemail
 *
 * Accepts a multipart/form-data upload with a single "file" field (MP3, max 5 MB).
 * Uploads to Supabase Storage bucket "brand-voicemail-audio" under
 * `{brand_key}/greeting.mp3`, then saves the public URL to
 * `nest_brand_chat_config.voicemail_audio_url`.
 *
 * Auth: `Authorization: Bearer <session id>` (same as brand-portal-config / login).
 * Legacy: `x-portal-token` is accepted as a fallback for the same session id.
 */
import type { VercelRequest, VercelResponse } from '@/lib/nest-portal/vercel-adapter'
import { createClient } from '@supabase/supabase-js'
import { pickServerEnv } from '../lib/server-env'

const BUCKET = 'brand-voicemail-audio'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/mpeg3'])

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-portal-token, content-type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })

  const supabaseUrl = pickServerEnv([
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'PUBLIC_SUPABASE_URL',
  ])
  const supabaseKey = pickServerEnv(['SUPABASE_SECRET_KEY', 'NEW_SUPABASE_SECRET_KEY'])
  if (!supabaseUrl || !supabaseKey) {
    return json(res, 500, {
      error: 'server_misconfigured',
      detail: 'Missing SUPABASE_URL or SUPABASE_SECRET_KEY for voicemail upload.',
    })
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Auth: same session row as /api/brand-portal-login (nest_brand_portal_sessions.id)
  const bearer = String(req.headers.authorization ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  const legacyHeader = (req.headers['x-portal-token'] as string | undefined)?.trim()
  const sessionId = bearer || legacyHeader || ''
  if (!sessionId) return json(res, 401, { error: 'Unauthorized' })

  const { data: sessRow, error: sessErr } = await supabase
    .from('nest_brand_portal_sessions')
    .select('brand_key, expires_at')
    .eq('id', sessionId)
    .maybeSingle()
  if (sessErr || !sessRow?.brand_key || !sessRow.expires_at) {
    return json(res, 401, { error: 'Unauthorized' })
  }
  if (new Date(sessRow.expires_at).getTime() < Date.now()) {
    return json(res, 401, { error: 'Unauthorized' })
  }
  const brandKey: string = sessRow.brand_key

  // Parse multipart body using Vercel's built-in body parsing is off for multipart.
  // We read the raw body and extract the file using a simple boundary parser.
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return json(res, 400, { error: 'expected_multipart' })
  }

  // Read the raw body
  const chunks: Buffer[] = []
  let totalBytes = 0
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_BYTES) {
        reject(new Error('file_too_large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', resolve)
    req.on('error', reject)
  }).catch((err: Error) => {
    if (err.message === 'file_too_large') {
      json(res, 413, { error: 'file_too_large', maxBytes: MAX_BYTES })
      return
    }
    throw err
  })
  if (res.headersSent) return

  const rawBody = Buffer.concat(chunks)

  // Extract boundary from Content-Type
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/)
  if (!boundaryMatch) return json(res, 400, { error: 'no_boundary' })
  const boundary = boundaryMatch[1] ?? boundaryMatch[2]

  // Find the "file" part
  const bodyStr = rawBody.toString('binary')
  const partSep = `--${boundary}`
  const parts = bodyStr.split(partSep)

  let fileBuffer: Buffer | null = null
  let fileMime = 'audio/mpeg'

  for (const part of parts) {
    if (!part.includes('name="file"')) continue
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue
    const headers = part.slice(0, headerEnd)
    const mimeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i)
    if (mimeMatch) fileMime = mimeMatch[1].trim().toLowerCase()
    // The data starts after the double CRLF and ends before the trailing CRLF
    const dataStr = part.slice(headerEnd + 4).replace(/\r\n$/, '')
    fileBuffer = Buffer.from(dataStr, 'binary')
    break
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return json(res, 400, { error: 'no_file_in_payload' })
  }
  if (!ALLOWED_MIME.has(fileMime) && !fileMime.includes('mpeg') && !fileMime.includes('mp3')) {
    return json(res, 415, { error: 'unsupported_media_type', received: fileMime })
  }

  // Ensure the bucket exists (public)
  const { data: buckets } = await supabase.storage.listBuckets()
  const bucketExists = (buckets ?? []).some((b) => b.name === BUCKET)
  if (!bucketExists) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
    })
    if (createErr && !createErr.message.includes('already exists')) {
      console.error('[upload-voicemail] bucket create error:', createErr.message)
      return json(res, 500, { error: 'bucket_create_failed' })
    }
  }

  // Upload to storage
  const storagePath = `${brandKey}/greeting.mp3`
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (uploadErr) {
    console.error('[upload-voicemail] upload error:', uploadErr.message)
    return json(res, 500, { error: 'upload_failed', detail: uploadErr.message })
  }

  // Get the public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  // Save to brand config
  const { error: updateErr } = await supabase
    .from('nest_brand_chat_config')
    .update({ voicemail_audio_url: publicUrl })
    .eq('brand_key', brandKey)

  if (updateErr) {
    console.error('[upload-voicemail] config update error:', updateErr.message)
    return json(res, 500, { error: 'config_update_failed' })
  }

  return json(res, 200, { ok: true, url: publicUrl })
}

export const config = {
  api: {
    bodyParser: false, // We parse the raw body ourselves
  },
}
