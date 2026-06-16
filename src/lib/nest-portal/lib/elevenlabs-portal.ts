/** Normalise ElevenLabs ConvAI agent payloads for the brand portal Voice Agent tab. */

export type PortalElevenLabsAgentSummary = {
  agentId: string
  name: string
  createdAtUnix: number | null
  updatedAtUnix: number | null
  archived: boolean
}

export type PortalElevenLabsVoiceOption = {
  voiceId: string
  name: string
  category: string | null
  previewUrl: string | null
}

/** ElevenLabs tool-call background sound. `null`/`'none'` = silent. */
export type ElevenLabsToolCallSound =
  | 'none'
  | 'typing'
  | 'elevator1'
  | 'elevator2'
  | 'elevator3'
  | 'elevator4'

/** When the background sound should play during tool execution. */
export type ElevenLabsToolCallSoundBehavior = 'auto' | 'always'

/** Built-in ambient loop for the entire conversation (`conversation.background_music`). */
export type ElevenLabsBackgroundMusicPreset =
  | 'office1'
  | 'office2'
  | 'restaurant'
  | 'city'
  | 'typing'
  | 'elevator1'
  | 'elevator2'
  | 'elevator3'
  | 'elevator4'

export type PortalElevenLabsBackgroundMusic = {
  enabled: boolean
  preset: ElevenLabsBackgroundMusicPreset
  volume: number
  crossfadeLoop: boolean
}

export type PortalElevenLabsAgentTool = {
  name: string
  type: string
  description: string
  url: string | null
  /** ElevenLabs "Tool Call Sound" — ambient audio played during tool execution. */
  toolCallSound: ElevenLabsToolCallSound
  /** `auto` = With pre-speech, `always` = Always play. */
  toolCallSoundBehavior: ElevenLabsToolCallSoundBehavior
}

export type PortalElevenLabsAgentDetail = PortalElevenLabsAgentSummary & {
  systemPrompt: string
  firstMessage: string
  language: string
  llm: string
  temperature: number | null
  maxTokens: number | null
  timezone: string | null
  tts: {
    modelId: string | null
    voiceId: string | null
    stability: number | null
    speed: number | null
    similarityBoost: number | null
    optimizeStreamingLatency: number | null
    agentOutputAudioFormat: string | null
    expressiveMode: boolean | null
  }
  turn: {
    turnTimeout: number | null
    turnEagerness: string | null
    speculativeTurn: boolean | null
    turnModel: string | null
    initialWaitTime: number | null
  }
  asr: {
    provider: string | null
    userInputAudioFormat: string | null
    quality: string | null
  }
  conversation: {
    maxDurationSeconds: number | null
    textOnly: boolean | null
    /** Ambient audio mixed under the whole call (ElevenLabs `background_music`). */
    backgroundMusic: PortalElevenLabsBackgroundMusic
  }
  tools: PortalElevenLabsAgentTool[]
  /** Raw embedded tool objects from `conversation_config.agent.prompt.tools` — preserved for round-trip PATCH. */
  rawTools: Array<Record<string, unknown>>
  phoneNumbers: Array<{ phoneNumberId: string; label: string; phoneNumber: string | null }>
  overrides: Record<string, unknown>
}

/** ElevenLabs conversational agent numeric bounds (see agent conversation_config docs). */
export const ELEVENLABS_AGENT_NUMERIC_BOUNDS = {
  temperature: { min: 0, max: 1, step: 0.05, default: 0.7, label: 'Temperature' },
  stability: { min: 0, max: 1, step: 0.05, default: 0.5, label: 'Stability' },
  similarityBoost: { min: 0, max: 1, step: 0.05, default: 0.8, label: 'Similarity boost' },
  speed: { min: 0.7, max: 1.2, step: 0.05, default: 1, label: 'Speed' },
  optimizeStreamingLatency: {
    min: 0,
    max: 4,
    step: 1,
    default: 3,
    label: 'Streaming latency optimiser',
  },
} as const

export type ElevenLabsNumericParamKey = keyof typeof ELEVENLABS_AGENT_NUMERIC_BOUNDS

/** Agent ConvAI TTS model families (ElevenLabs OpenAPI `TTSModelFamily`). */
export type ElevenLabsTtsModelFamily = 'flash' | 'turbo' | 'multilingual' | 'v3_conversational'

/** TTS voice sliders (excludes LLM `temperature`). */
export type ElevenLabsTtsUiParamKey = 'stability' | 'similarityBoost' | 'speed' | 'optimizeStreamingLatency'

const TTS_PARAM_BY_FAMILY: Record<ElevenLabsTtsModelFamily, readonly ElevenLabsTtsUiParamKey[]> = {
  // Flash models ignore stability/similarity for speed (ElevenLabs voice-settings reference).
  flash: ['speed', 'optimizeStreamingLatency'],
  turbo: ['stability', 'similarityBoost', 'speed', 'optimizeStreamingLatency'],
  multilingual: ['stability', 'similarityBoost', 'speed'],
  v3_conversational: ['stability', 'similarityBoost', 'speed'],
}

const ALL_TTS_UI_PARAMS: readonly ElevenLabsTtsUiParamKey[] = [
  'stability',
  'similarityBoost',
  'speed',
  'optimizeStreamingLatency',
]

export function resolveElevenLabsTtsModelFamily(
  modelId: string | null | undefined,
): ElevenLabsTtsModelFamily | null {
  const id = (modelId || '').trim()
  if (!id) return null
  if (id === 'eleven_v3_conversational') return 'v3_conversational'
  if (id === 'eleven_multilingual_v2') return 'multilingual'
  if (id.startsWith('eleven_flash')) return 'flash'
  if (id.startsWith('eleven_turbo')) return 'turbo'
  return null
}

export function visibleTtsParamsForModel(
  modelId: string | null | undefined,
): ReadonlySet<ElevenLabsTtsUiParamKey> {
  const family = resolveElevenLabsTtsModelFamily(modelId)
  if (!family) return new Set(ALL_TTS_UI_PARAMS)
  return new Set(TTS_PARAM_BY_FAMILY[family])
}

export function ttsModelSupportsParam(
  modelId: string | null | undefined,
  param: ElevenLabsTtsUiParamKey,
): boolean {
  return visibleTtsParamsForModel(modelId).has(param)
}

export function filterTtsPatchForModel(
  patch: PortalElevenLabsAgentPatch,
  modelId: string | null | undefined,
): PortalElevenLabsAgentPatch {
  const visible = visibleTtsParamsForModel(modelId)
  const out = { ...patch }
  if (!visible.has('stability')) delete out.stability
  if (!visible.has('similarityBoost')) delete out.similarityBoost
  if (!visible.has('speed')) delete out.speed
  if (!visible.has('optimizeStreamingLatency')) delete out.optimizeStreamingLatency
  return out
}

export const ELEVENLABS_TTS_MODEL_LABELS: Record<string, string> = {
  eleven_v3_conversational: 'Eleven v3 Conversational',
  eleven_multilingual_v2: 'Multilingual v2',
  eleven_turbo_v2_5: 'Turbo v2.5',
  eleven_turbo_v2: 'Turbo v2',
  eleven_flash_v2_5: 'Flash v2.5',
  eleven_flash_v2: 'Flash v2',
}

export function clampElevenLabsNumeric(
  key: ElevenLabsNumericParamKey,
  value: number,
): number {
  const { min, max, step } = ELEVENLABS_AGENT_NUMERIC_BOUNDS[key]
  const stepped = Math.round(value / step) * step
  const clamped = Math.min(max, Math.max(min, stepped))
  return Number(clamped.toFixed(step < 1 ? 2 : 0))
}

export function resolveElevenLabsNumeric(
  key: ElevenLabsNumericParamKey,
  value: number | null | undefined,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampElevenLabsNumeric(key, value)
  }
  return ELEVENLABS_AGENT_NUMERIC_BOUNDS[key].default
}

export type PortalElevenLabsAgentPatch = {
  name?: string
  systemPrompt?: string
  firstMessage?: string
  language?: string
  llm?: string
  temperature?: number
  voiceId?: string
  ttsModelId?: string
  stability?: number
  speed?: number
  similarityBoost?: number
  optimizeStreamingLatency?: number
  agentOutputAudioFormat?: string
  /**
   * Full replacement for `conversation_config.agent.prompt.tools` — used to update
   * per-tool background sound settings while preserving all other fields. Build by
   * merging changes onto `detail.rawTools` so we never wipe out other tool config.
   */
  tools?: Array<Record<string, unknown>>
  /** Call-wide ambient loop under `conversation_config.conversation.background_music`. */
  backgroundMusic?: PortalElevenLabsBackgroundMusic
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function summariseElevenLabsAgent(raw: Record<string, unknown>): PortalElevenLabsAgentSummary {
  const meta = asRecord(raw.metadata)
  return {
    agentId: asString(raw.agent_id),
    name: asString(raw.name) || 'Untitled agent',
    createdAtUnix: asNumber(meta.created_at_unix_secs),
    updatedAtUnix: asNumber(meta.updated_at_unix_secs),
    archived: asRecord(raw.platform_settings).archived === true,
  }
}

export function detailElevenLabsAgent(raw: Record<string, unknown>): PortalElevenLabsAgentDetail {
  const summary = summariseElevenLabsAgent(raw)
  const cc = asRecord(raw.conversation_config)
  const agent = asRecord(cc.agent)
  const prompt = asRecord(agent.prompt)
  const tts = asRecord(cc.tts)
  const turn = asRecord(cc.turn)
  const asr = asRecord(cc.asr)
  const conversation = asRecord(cc.conversation)
  const platform = asRecord(raw.platform_settings)
  const overrides = asRecord(platform.overrides)

  const toolsRaw = Array.isArray(prompt.tools) ? prompt.tools : []
  const rawTools: Array<Record<string, unknown>> = toolsRaw.map((row) => asRecord(row))
  const tools: PortalElevenLabsAgentTool[] = rawTools
    .map((t) => {
      const schema = asRecord(t.api_schema)
      const rawSound = asString(t.tool_call_sound).trim()
      const sound: ElevenLabsToolCallSound =
        rawSound === 'typing' ||
        rawSound === 'elevator1' ||
        rawSound === 'elevator2' ||
        rawSound === 'elevator3' ||
        rawSound === 'elevator4'
          ? rawSound
          : 'none'
      const rawBehavior = asString(t.tool_call_sound_behavior).trim()
      const behavior: ElevenLabsToolCallSoundBehavior =
        rawBehavior === 'always' ? 'always' : 'auto'
      return {
        name: asString(t.name) || 'tool',
        type: asString(t.type) || 'unknown',
        description: asString(t.description),
        url: asString(schema.url) || null,
        toolCallSound: sound,
        toolCallSoundBehavior: behavior,
      }
    })
    .filter((t) => t.name)

  const phoneNumbersRaw = Array.isArray(raw.phone_numbers) ? raw.phone_numbers : []
  const phoneNumbers = phoneNumbersRaw.map((row) => {
    const p = asRecord(row)
    return {
      phoneNumberId: asString(p.phone_number_id),
      label: asString(p.label) || asString(p.phone_number) || 'Phone',
      phoneNumber: asString(p.phone_number) || null,
    }
  })

  return {
    ...summary,
    systemPrompt: asString(prompt.prompt),
    firstMessage: asString(agent.first_message),
    language: asString(agent.language) || 'en',
    llm: asString(prompt.llm),
    temperature: asNumber(prompt.temperature),
    maxTokens: asNumber(prompt.max_tokens),
    timezone: asString(prompt.timezone) || null,
    tts: {
      modelId: asString(tts.model_id) || null,
      voiceId: asString(tts.voice_id) || null,
      stability: asNumber(tts.stability),
      speed: asNumber(tts.speed),
      similarityBoost: asNumber(tts.similarity_boost),
      optimizeStreamingLatency: asNumber(tts.optimize_streaming_latency),
      agentOutputAudioFormat: asString(tts.agent_output_audio_format) || null,
      expressiveMode: tts.expressive_mode === true,
    },
    turn: {
      turnTimeout: asNumber(turn.turn_timeout),
      turnEagerness: asString(turn.turn_eagerness) || null,
      speculativeTurn: turn.speculative_turn === true,
      turnModel: asString(turn.turn_model) || null,
      initialWaitTime: asNumber(turn.initial_wait_time),
    },
    asr: {
      provider: asString(asr.provider) || null,
      userInputAudioFormat: asString(asr.user_input_audio_format) || null,
      quality: asString(asr.quality) || null,
    },
    conversation: {
      maxDurationSeconds: asNumber(conversation.max_duration_seconds),
      textOnly: conversation.text_only === true,
      backgroundMusic: parseElevenLabsBackgroundMusic(conversation.background_music),
    },
    tools,
    rawTools,
    phoneNumbers,
    overrides,
  }
}

export function summariseElevenLabsVoice(raw: Record<string, unknown>): PortalElevenLabsVoiceOption {
  return {
    voiceId: asString(raw.voice_id),
    name: asString(raw.name) || asString(raw.voice_id),
    category: asString(raw.category) || null,
    previewUrl: asString(raw.preview_url) || null,
  }
}

export function buildElevenLabsPatchBody(patch: PortalElevenLabsAgentPatch): Record<string, unknown> {
  const effectiveModelId = patch.ttsModelId
  const patchForModel = filterTtsPatchForModel(patch, effectiveModelId)
  const body: Record<string, unknown> = {}
  if (patchForModel.name !== undefined) body.name = patchForModel.name

  const conversationConfig: Record<string, unknown> = {}
  const agent: Record<string, unknown> = {}
  const prompt: Record<string, unknown> = {}
  const tts: Record<string, unknown> = {}

  if (patchForModel.firstMessage !== undefined) agent.first_message = patchForModel.firstMessage
  if (patchForModel.language !== undefined) agent.language = patchForModel.language
  if (patchForModel.systemPrompt !== undefined) prompt.prompt = patchForModel.systemPrompt
  if (patchForModel.llm !== undefined) prompt.llm = patchForModel.llm
  if (patchForModel.temperature !== undefined) {
    prompt.temperature = clampElevenLabsNumeric('temperature', patchForModel.temperature)
  }

  if (patchForModel.tools !== undefined) prompt.tools = patchForModel.tools

  if (Object.keys(prompt).length > 0) agent.prompt = prompt
  if (Object.keys(agent).length > 0) conversationConfig.agent = agent

  if (patchForModel.voiceId !== undefined) tts.voice_id = patchForModel.voiceId
  if (patchForModel.ttsModelId !== undefined) tts.model_id = patchForModel.ttsModelId
  if (patchForModel.stability !== undefined) {
    tts.stability = clampElevenLabsNumeric('stability', patchForModel.stability)
  }
  if (patchForModel.speed !== undefined) {
    tts.speed = clampElevenLabsNumeric('speed', patchForModel.speed)
  }
  if (patchForModel.similarityBoost !== undefined) {
    tts.similarity_boost = clampElevenLabsNumeric('similarityBoost', patchForModel.similarityBoost)
  }
  if (patchForModel.optimizeStreamingLatency !== undefined) {
    tts.optimize_streaming_latency = clampElevenLabsNumeric(
      'optimizeStreamingLatency',
      patchForModel.optimizeStreamingLatency,
    )
  }
  if (patchForModel.agentOutputAudioFormat !== undefined) {
    tts.agent_output_audio_format = patchForModel.agentOutputAudioFormat
  }

  if (Object.keys(tts).length > 0) conversationConfig.tts = tts

  if (patchForModel.backgroundMusic !== undefined) {
    const conv = asRecord(conversationConfig.conversation)
    conv.background_music = buildElevenLabsBackgroundMusicRaw(patchForModel.backgroundMusic)
    conversationConfig.conversation = conv
  }

  if (Object.keys(conversationConfig).length > 0) body.conversation_config = conversationConfig

  return body
}

export const ELEVENLABS_TTS_MODEL_OPTIONS = [
  'eleven_v3_conversational',
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
] as const

/** Short hint shown under TTS model when some sliders are hidden. */
export function ttsModelParamHint(modelId: string | null | undefined): string | null {
  const family = resolveElevenLabsTtsModelFamily(modelId)
  if (!family) return null
  switch (family) {
    case 'flash':
      return 'Flash models use speed and streaming latency only — stability and similarity are not applied.'
    case 'turbo':
      return 'Turbo supports all voice tuning sliders, including streaming latency.'
    case 'multilingual':
      return 'Multilingual v2 does not use the streaming latency optimiser — quality-focused synthesis.'
    case 'v3_conversational':
      return 'v3 Conversational does not use the streaming latency optimiser — tuned for natural dialogue.'
    default:
      return null
  }
}

export const ELEVENLABS_AUDIO_FORMAT_OPTIONS = [
  'ulaw_8000',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_44100',
  'pcm_48000',
] as const

export const ELEVENLABS_TURN_EAGERNESS_OPTIONS = ['patient', 'normal', 'eager'] as const

/* ─── Call-wide background music (entire conversation) ─── */

export const ELEVENLABS_BACKGROUND_MUSIC_PRESET_OPTIONS: ElevenLabsBackgroundMusicPreset[] = [
  'office1',
  'office2',
  'restaurant',
  'city',
  'typing',
  'elevator1',
  'elevator2',
  'elevator3',
  'elevator4',
]

export const ELEVENLABS_BACKGROUND_MUSIC_PRESET_LABELS: Record<
  ElevenLabsBackgroundMusicPreset,
  string
> = {
  office1: 'Office ambience 1',
  office2: 'Office ambience 2',
  restaurant: 'Restaurant',
  city: 'City street',
  typing: 'Keyboard typing',
  elevator1: 'Elevator music 1',
  elevator2: 'Elevator music 2',
  elevator3: 'Elevator music 3',
  elevator4: 'Elevator music 4',
}

export const ELEVENLABS_BACKGROUND_MUSIC_VOLUME_BOUNDS = {
  min: 0.01,
  max: 1,
  step: 0.05,
  default: 0.6,
  label: 'Background volume',
} as const

const BACKGROUND_MUSIC_PRESET_SET = new Set<string>(ELEVENLABS_BACKGROUND_MUSIC_PRESET_OPTIONS)

export function isElevenLabsBackgroundMusicPreset(
  value: string,
): value is ElevenLabsBackgroundMusicPreset {
  return BACKGROUND_MUSIC_PRESET_SET.has(value)
}

export function clampElevenLabsBackgroundMusicVolume(value: number): number {
  const { min, max, step } = ELEVENLABS_BACKGROUND_MUSIC_VOLUME_BOUNDS
  const stepped = Math.round(value / step) * step
  return Number(Math.min(max, Math.max(min, stepped)).toFixed(2))
}

export function resolveElevenLabsBackgroundMusicVolume(
  value: number | null | undefined,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampElevenLabsBackgroundMusicVolume(value)
  }
  return ELEVENLABS_BACKGROUND_MUSIC_VOLUME_BOUNDS.default
}

export function parseElevenLabsBackgroundMusic(raw: unknown): PortalElevenLabsBackgroundMusic {
  const row = asRecord(raw)
  const sourceType = asString(row.source_type).trim()
  const sourceId = asString(row.source_id).trim()
  const enabled = sourceType === 'preset' && isElevenLabsBackgroundMusicPreset(sourceId)
  return {
    enabled,
    preset: enabled ? sourceId : 'office1',
    volume: resolveElevenLabsBackgroundMusicVolume(asNumber(row.volume)),
    crossfadeLoop: row.crossfade_loop === true,
  }
}

export function buildElevenLabsBackgroundMusicRaw(
  config: PortalElevenLabsBackgroundMusic,
): Record<string, unknown> {
  const volume = resolveElevenLabsBackgroundMusicVolume(config.volume)
  if (!config.enabled) {
    return {
      source_type: null,
      source_id: null,
      volume,
      crossfade_loop: config.crossfadeLoop,
    }
  }
  const preset = isElevenLabsBackgroundMusicPreset(config.preset)
    ? config.preset
    : 'office1'
  return {
    source_type: 'preset',
    source_id: preset,
    volume,
    crossfade_loop: config.crossfadeLoop,
  }
}

/* ─── Tool Call Sound (background audio during tool execution) ─── */

export const ELEVENLABS_TOOL_CALL_SOUND_OPTIONS: ElevenLabsToolCallSound[] = [
  'none',
  'typing',
  'elevator1',
  'elevator2',
  'elevator3',
  'elevator4',
]

export const ELEVENLABS_TOOL_CALL_SOUND_LABELS: Record<ElevenLabsToolCallSound, string> = {
  none: 'None',
  typing: 'Typing',
  elevator1: 'Elevator music 1',
  elevator2: 'Elevator music 2',
  elevator3: 'Elevator music 3',
  elevator4: 'Elevator music 4',
}

export const ELEVENLABS_TOOL_CALL_SOUND_BEHAVIOR_OPTIONS: ElevenLabsToolCallSoundBehavior[] = [
  'auto',
  'always',
]

export const ELEVENLABS_TOOL_CALL_SOUND_BEHAVIOR_LABELS: Record<
  ElevenLabsToolCallSoundBehavior,
  string
> = {
  auto: 'With pre-speech',
  always: 'Always play',
}

/**
 * Merge a per-tool sound override into a raw tool object for round-trip PATCH.
 * Pass `'none'` to clear the sound (sets `tool_call_sound: null` upstream).
 */
export function applyToolCallSoundToRaw(
  raw: Record<string, unknown>,
  sound: ElevenLabsToolCallSound,
  behavior: ElevenLabsToolCallSoundBehavior,
): Record<string, unknown> {
  return {
    ...raw,
    tool_call_sound: sound === 'none' ? null : sound,
    tool_call_sound_behavior: behavior,
  }
}
