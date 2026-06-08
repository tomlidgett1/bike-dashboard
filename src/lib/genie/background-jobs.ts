import OpenAI from 'openai'

const GENIE_BACKGROUND_MODEL = 'gpt-5.5'
const MAX_BACKGROUND_CONTEXT_CHARS = 18_000

export type GenieBackgroundJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface GenieBackgroundMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GenieBackgroundStartResult {
  response_id: string | null
  status: GenieBackgroundJobStatus
  result: Record<string, unknown> | null
  error_message: string | null
}

function compactBackgroundText(value: unknown, maxLength = 1_000): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function compactBackgroundMessages(messages: GenieBackgroundMessage[]): string {
  const compacted = messages.slice(-24).map(message => ({
    role: message.role,
    content: compactBackgroundText(message.content, 1_200),
  }))
  const json = JSON.stringify(compacted, null, 2)
  if (json.length <= MAX_BACKGROUND_CONTEXT_CHARS) return json
  return json.slice(-MAX_BACKGROUND_CONTEXT_CHARS)
}

function extractResponseText(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const record = response as Record<string, unknown>
  if (typeof record.output_text === 'string') return record.output_text
  const output = Array.isArray(record.output) ? record.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const itemRecord = item as Record<string, unknown>
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const partRecord = part as Record<string, unknown>
      if (typeof partRecord.text === 'string') chunks.push(partRecord.text)
    }
  }
  return chunks.join('\n').trim()
}

function normalizeResponseStatus(status: unknown): GenieBackgroundJobStatus {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'incomplete') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  return 'running'
}

export async function startGenieBackgroundResponse(args: {
  storeName: string
  prompt: string
  messages: GenieBackgroundMessage[]
  route?: string | null
}): Promise<GenieBackgroundStartResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      response_id: null,
      status: 'queued',
      result: null,
      error_message: 'OPENAI_API_KEY is not configured, so the background response could not be started.',
    }
  }

  const client = new OpenAI()
  const response = await client.responses.create({
    model: GENIE_BACKGROUND_MODEL,
    background: true,
    store: true,
    input: [
      {
        role: 'system',
        content: [
          `You are the Yellow Jersey Genie background analyst for "${args.storeName}".`,
          'Produce a complete bike-store-quality report from the supplied conversation context and prompt.',
          'If private store data is missing, state exactly what must be fetched in Genie before the report can be final.',
          'For cycling compatibility or product standards, prefer official manufacturer/service/technical sources and mark unsupported claims as unverified.',
          'Use concise Markdown with executive findings, evidence, recommendations, and caveats.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Route: ${args.route ?? 'background_analysis'}`,
          `Prompt: ${args.prompt}`,
          'Recent Genie conversation context:',
          compactBackgroundMessages(args.messages),
        ].join('\n\n'),
      },
    ],
    reasoning: { effort: 'medium', summary: 'auto' },
    text: { verbosity: 'medium' },
  })

  return {
    response_id: response.id,
    status: normalizeResponseStatus(response.status),
    result: extractResponseText(response) ? { text: extractResponseText(response), response } : { response },
    error_message: null,
  }
}

export async function retrieveGenieBackgroundResponse(responseId: string): Promise<GenieBackgroundStartResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      response_id: responseId,
      status: 'running',
      result: null,
      error_message: 'OPENAI_API_KEY is not configured, so the background response could not be refreshed.',
    }
  }

  const client = new OpenAI()
  const response = await client.responses.retrieve(responseId)
  const text = extractResponseText(response)
  const status = normalizeResponseStatus(response.status)
  return {
    response_id: response.id,
    status,
    result: text ? { text, response } : { response },
    error_message: status === 'failed' ? 'Background response failed or was incomplete.' : null,
  }
}

export async function cancelGenieBackgroundResponse(responseId: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return
  const client = new OpenAI()
  await client.responses.cancel(responseId).catch(() => undefined)
}
