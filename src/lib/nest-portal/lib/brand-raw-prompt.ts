import {
  DEFAULT_BUSINESS_TIMEZONE,
  OPENING_SCHEDULE_DAYS,
  formatMinuteOfDay,
  formatScheduleDays,
  normaliseBusinessTimezone,
  normaliseOpeningSchedule,
  formatTradingHoursFromSchedule,
  type OpeningSchedule,
  type OpeningScheduleDay,
  type OpeningScheduleRule,
} from './opening-schedule'

const DEFAULT_STYLE_TEMPLATE = 'warm_local'

const STYLE_TEMPLATE_LABELS: Record<string, string> = {
  warm_local: 'Warm & local',
  professional_calm: 'Professional & calm',
  energetic_fun: 'Energetic & fun',
  concise_direct: 'Concise & direct',
  caring_supportive: 'Caring & supportive',
}

const DAY_ALIASES: Record<string, OpeningScheduleDay> = {
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
}

type RawPromptSectionKey =
  | 'business_name'
  | 'opening_message'
  | 'opening_message_schedule'
  | 'contact_details'
  | 'hours'
  | 'pricing'
  | 'services_products'
  | 'booking_enquiries'
  | 'policies'
  | 'voice_and_tone'
  | 'topics_to_avoid'
  | 'human_handoff'
  | 'extra_knowledge'

const RAW_PROMPT_SECTION_TITLES: Record<RawPromptSectionKey, string> = {
  business_name: 'Business name',
  opening_message: 'Opening message',
  opening_message_schedule: 'Opening message schedule',
  contact_details: 'Contact details',
  hours: 'Hours',
  pricing: 'Pricing',
  services_products: 'Services and products',
  booking_enquiries: 'Booking and enquiries',
  policies: 'Policies',
  voice_and_tone: 'Voice and tone',
  topics_to_avoid: 'Topics to avoid',
  human_handoff: 'Human handoff',
  extra_knowledge: 'Extra knowledge',
}

/** Sections stored in the portal raw editor (business facts only). */
const RAW_PROMPT_BUSINESS_SECTION_ORDER: RawPromptSectionKey[] = [
  'business_name',
  'opening_message',
  'opening_message_schedule',
  'contact_details',
  'hours',
  'pricing',
  'services_products',
  'booking_enquiries',
  'policies',
  'extra_knowledge',
]

/** Voice / guardrails — assembled at runtime from structured fields, not stored in business_raw_prompt. */
const RAW_PROMPT_PERSONALITY_SECTION_ORDER = [
  'voice_and_tone',
  'topics_to_avoid',
  'human_handoff',
] as const satisfies readonly RawPromptSectionKey[]

const RAW_PROMPT_SECTION_ORDER: RawPromptSectionKey[] = [
  ...RAW_PROMPT_BUSINESS_SECTION_ORDER,
  ...RAW_PROMPT_PERSONALITY_SECTION_ORDER,
]

const RAW_PROMPT_SECTION_LOOKUP = new Map<string, RawPromptSectionKey>(
  RAW_PROMPT_SECTION_ORDER.map((key) => [normaliseLabel(RAW_PROMPT_SECTION_TITLES[key]), key]),
)

const BUSINESS_VIEW_HEADING = 'Business view'

const STYLE_TEMPLATE_LOOKUP = new Map<string, string>(
  Object.entries(STYLE_TEMPLATE_LABELS).flatMap(([id, label]) => [
    [normaliseLabel(id), id],
    [normaliseLabel(label), id],
  ]),
)

export const BUSINESS_RAW_PROMPT_SCHEDULE_EXAMPLE = 'Mon, Tue, Wed | 9:00am-5:00pm | Hey there, how can we help?'

export type BusinessRawPromptConfig = {
  business_display_name: string
  opening_line: string
  business_timezone: string
  opening_schedule: OpeningSchedule
  contact_text: string
  hours_text: string
  prices_text: string
  services_products_text: string
  booking_info_text: string
  policies_text: string
  style_template: string
  style_notes: string
  topics_to_avoid: string
  escalation_text: string
  extra_knowledge: string
}

function normaliseLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim()
    : ''
}

function cleanLine(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

function trimSectionContent(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^\s*\n+|\n+\s*$/g, '').trim()
}

function buildSection(title: string, content: string): string {
  const trimmed = trimSectionContent(content)
  return trimmed ? `## ${title}\n${trimmed}` : `## ${title}`
}

function createEmptyConfig(): BusinessRawPromptConfig {
  return {
    business_display_name: '',
    opening_line: '',
    business_timezone: DEFAULT_BUSINESS_TIMEZONE,
    opening_schedule: { enabled: false, rules: [] },
    contact_text: '',
    hours_text: '',
    prices_text: '',
    services_products_text: '',
    booking_info_text: '',
    policies_text: '',
    style_template: DEFAULT_STYLE_TEMPLATE,
    style_notes: '',
    topics_to_avoid: '',
    escalation_text: '',
    extra_knowledge: '',
  }
}

function getStyleTemplateId(value: string): string | null {
  const match = STYLE_TEMPLATE_LOOKUP.get(normaliseLabel(value))
  return match ?? null
}

export function getBusinessPromptStyleLabel(styleTemplate: string): string {
  const key = cleanText(styleTemplate)
  return STYLE_TEMPLATE_LABELS[key] ?? STYLE_TEMPLATE_LABELS[DEFAULT_STYLE_TEMPLATE]
}

function getScheduleLines(schedule: OpeningSchedule, openingLineFallback: string): string[] {
  if (!schedule.enabled) return []
  const fallback = cleanText(openingLineFallback)
  return schedule.rules
    .filter((rule) => rule.days.length > 0 && rule.endMinute > rule.startMinute)
    .map((rule) => {
      const msg = cleanText(rule.message) || fallback
      if (!msg) return null
      return `- ${formatScheduleDays(rule.days)} | ${formatMinuteOfDay(rule.startMinute)}-${formatMinuteOfDay(rule.endMinute)} | ${cleanLine(msg)}`
    })
    .filter((line): line is string => Boolean(line))
}

export function hasBusinessRawPromptSeedContent(config: Partial<BusinessRawPromptConfig>): boolean {
  const schedule = normaliseOpeningSchedule(config.opening_schedule)
  if (schedule.enabled && schedule.rules.some((rule) => rule.days.length > 0 && rule.endMinute > rule.startMinute)) {
    return true
  }
  if (cleanText(config.business_display_name).length > 0) return true
  if (cleanText(config.opening_line).length > 0) return true
  if (cleanText(config.contact_text).length > 0) return true
  if (cleanText(config.hours_text).length > 0) return true
  if (cleanText(config.prices_text).length > 0) return true
  if (cleanText(config.services_products_text).length > 0) return true
  if (cleanText(config.booking_info_text).length > 0) return true
  if (cleanText(config.policies_text).length > 0) return true
  if (cleanText(config.extra_knowledge).length > 0) return true
  return false
}

/** Voice / guardrails markdown (runtime only — not stored in business_raw_prompt). */
export function buildChatbotPersonalityMarkdown(configLike: Partial<BusinessRawPromptConfig>): string {
  const config: BusinessRawPromptConfig = {
    ...createEmptyConfig(),
    ...configLike,
    style_template: cleanText(configLike.style_template) || DEFAULT_STYLE_TEMPLATE,
  }

  const voiceLines = [`Style preset: ${getBusinessPromptStyleLabel(config.style_template)}`]
  if (cleanText(config.style_notes)) {
    voiceLines.push('', cleanText(config.style_notes))
  }

  const personalitySections = {
    voice_and_tone: voiceLines.join('\n'),
    topics_to_avoid: cleanText(config.topics_to_avoid),
    human_handoff: cleanText(config.escalation_text),
  }

  const body = RAW_PROMPT_PERSONALITY_SECTION_ORDER.map((key) =>
    buildSection(RAW_PROMPT_SECTION_TITLES[key], personalitySections[key]),
  )
    .join('\n\n')
    .trim()

  return body
}

/** Portal + DB: everything the business owns about facts (100% business content). */
export function buildBusinessViewPrompt(configLike: Partial<BusinessRawPromptConfig>): string {
  const config: BusinessRawPromptConfig = {
    ...createEmptyConfig(),
    ...configLike,
    business_timezone: normaliseBusinessTimezone(configLike.business_timezone),
    opening_schedule: normaliseOpeningSchedule(configLike.opening_schedule),
    style_template: cleanText(configLike.style_template) || DEFAULT_STYLE_TEMPLATE,
  }

  const scheduleLines = [
    `Business timezone: ${config.business_timezone}`,
    ...getScheduleLines(config.opening_schedule, cleanText(config.opening_line)),
  ]

  const hoursFromText = cleanText(config.hours_text)
  const hoursFromSchedule = formatTradingHoursFromSchedule(config.opening_schedule)
  const hoursCombined =
    hoursFromText && hoursFromSchedule
      ? `${hoursFromText}\n\n${hoursFromSchedule}`
      : hoursFromText || hoursFromSchedule

  const sections: Record<RawPromptSectionKey, string> = {
    business_name: cleanText(config.business_display_name),
    opening_message: cleanText(config.opening_line),
    opening_message_schedule: scheduleLines.join('\n'),
    contact_details: cleanText(config.contact_text),
    hours: hoursCombined,
    pricing: cleanText(config.prices_text),
    services_products: cleanText(config.services_products_text),
    booking_enquiries: cleanText(config.booking_info_text),
    policies: cleanText(config.policies_text),
    voice_and_tone: '',
    topics_to_avoid: '',
    human_handoff: '',
    extra_knowledge: cleanText(config.extra_knowledge),
  }

  const inner = RAW_PROMPT_BUSINESS_SECTION_ORDER.map((key) =>
    buildSection(RAW_PROMPT_SECTION_TITLES[key], sections[key]),
  )
    .join('\n\n')
    .trim()

  return `## ${BUSINESS_VIEW_HEADING}\n\n${inner}`.trim()
}

/** @deprecated Use buildBusinessViewPrompt — kept as alias for imports. */
export function buildBusinessRawPrompt(configLike: Partial<BusinessRawPromptConfig>): string {
  return buildBusinessViewPrompt(configLike)
}

export function pickBusinessFieldsFromParsed(parsed: BusinessRawPromptConfig): Partial<BusinessRawPromptConfig> {
  return {
    business_display_name: parsed.business_display_name,
    opening_line: parsed.opening_line,
    business_timezone: parsed.business_timezone,
    opening_schedule: parsed.opening_schedule,
    contact_text: parsed.contact_text,
    hours_text: parsed.hours_text,
    prices_text: parsed.prices_text,
    services_products_text: parsed.services_products_text,
    booking_info_text: parsed.booking_info_text,
    policies_text: parsed.policies_text,
    extra_knowledge: parsed.extra_knowledge,
  }
}

function stripLeadingBusinessViewHeading(text: string): string {
  return text.replace(/^\s*##\s+Business view\s*(?:\n+|$)/i, '')
}

function parseSections(text: string): {
  sections: Partial<Record<RawPromptSectionKey, string>>
  preamble: string
} {
  const sections: Partial<Record<RawPromptSectionKey, string>> = {}
  const preamble: string[] = []
  let currentKey: RawPromptSectionKey | null = null
  let buffer: string[] = []

  const flush = () => {
    if (currentKey) {
      sections[currentKey] = trimSectionContent(buffer.join('\n'))
    } else if (buffer.length > 0) {
      preamble.push(trimSectionContent(buffer.join('\n')))
    }
    buffer = []
  }

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line.trim())
    const nextKey = headingMatch
      ? RAW_PROMPT_SECTION_LOOKUP.get(normaliseLabel(headingMatch[1] ?? '')) ?? null
      : null

    if (nextKey) {
      flush()
      currentKey = nextKey
      continue
    }

    buffer.push(line)
  }

  flush()
  return {
    sections,
    preamble: preamble.filter(Boolean).join('\n\n').trim(),
  }
}

function parseScheduleDays(raw: string): OpeningScheduleDay[] {
  const normalised = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalised) return []
  if (normalised === 'every day') return [...OPENING_SCHEDULE_DAYS]

  const out: OpeningScheduleDay[] = []
  const seen = new Set<OpeningScheduleDay>()

  for (const token of raw.split(',')) {
    const key = DAY_ALIASES[normaliseLabel(token)]
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }

  return out
}

function parseTimeLabel(raw: string): number | null {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!match) return null

  let hour = Number(match[1])
  const minute = Number(match[2] ?? '0')
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null
  }

  if (hour === 12) hour = 0
  if (match[3] === 'pm') hour += 12
  return hour * 60 + minute
}

function parseTimeRange(raw: string): { startMinute: number; endMinute: number } | null {
  const parts = raw.split('-')
  if (parts.length !== 2) return null

  const startMinute = parseTimeLabel(parts[0] ?? '')
  const endMinute = parseTimeLabel(parts[1] ?? '')
  if (startMinute == null || endMinute == null || startMinute >= endMinute) return null
  return { startMinute, endMinute }
}

function parseScheduleRule(line: string, index: number): OpeningScheduleRule | null {
  const match = /^-\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/.exec(line.trim())
  if (!match) return null

  const days = parseScheduleDays(match[1] ?? '')
  const timeRange = parseTimeRange(match[2] ?? '')
  const message = cleanLine(match[3] ?? '')
  if (days.length === 0 || !timeRange || !message) return null

  return {
    id: `raw-prompt-rule-${index + 1}`,
    days,
    startMinute: timeRange.startMinute,
    endMinute: timeRange.endMinute,
    message,
  }
}

function parseOpeningScheduleSection(content: string): Pick<BusinessRawPromptConfig, 'business_timezone' | 'opening_schedule'> {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let businessTimezone = DEFAULT_BUSINESS_TIMEZONE
  const rules: OpeningScheduleRule[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const timezoneMatch = /^business timezone\s*:\s*(.+)$/i.exec(trimmed)
    if (timezoneMatch) {
      businessTimezone = normaliseBusinessTimezone(timezoneMatch[1] ?? '')
      continue
    }

    const rule = parseScheduleRule(trimmed, rules.length)
    if (rule) {
      rules.push(rule)
    }
  }

  return {
    business_timezone: businessTimezone,
    opening_schedule: {
      enabled: rules.length > 0,
      rules,
    },
  }
}

function parseVoiceSection(content: string): Pick<BusinessRawPromptConfig, 'style_template' | 'style_notes'> {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let styleTemplate = DEFAULT_STYLE_TEMPLATE
  const noteLines: string[] = []
  let styleCaptured = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!styleCaptured && trimmed) {
      const presetMatch = /^style preset\s*:\s*(.+)$/i.exec(trimmed)
      if (presetMatch) {
        styleTemplate = getStyleTemplateId(presetMatch[1] ?? '') ?? DEFAULT_STYLE_TEMPLATE
        styleCaptured = true
        continue
      }

      const directMatch = getStyleTemplateId(trimmed)
      if (directMatch) {
        styleTemplate = directMatch
        styleCaptured = true
        continue
      }
    }

    noteLines.push(line)
  }

  return {
    style_template: styleTemplate,
    style_notes: trimSectionContent(noteLines.join('\n')),
  }
}

export function parseBusinessRawPrompt(rawPrompt: string): BusinessRawPromptConfig {
  const trimmedPrompt = trimSectionContent(rawPrompt)
  const empty = createEmptyConfig()
  if (!trimmedPrompt) return empty

  const withoutWrapper = stripLeadingBusinessViewHeading(trimmedPrompt)
  const { sections, preamble } = parseSections(withoutWrapper)
  if (Object.keys(sections).length === 0) {
    return {
      ...empty,
      extra_knowledge: trimmedPrompt,
    }
  }

  const schedule = parseOpeningScheduleSection(sections.opening_message_schedule ?? '')
  const voice =
    sections.voice_and_tone !== undefined && trimSectionContent(sections.voice_and_tone ?? '').length > 0
      ? parseVoiceSection(sections.voice_and_tone ?? '')
      : { style_template: DEFAULT_STYLE_TEMPLATE, style_notes: '' }
  const extraKnowledge = [trimSectionContent(preamble), trimSectionContent(sections.extra_knowledge ?? '')]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return {
    ...empty,
    business_display_name: trimSectionContent(sections.business_name ?? ''),
    opening_line: trimSectionContent(sections.opening_message ?? ''),
    business_timezone: schedule.business_timezone,
    opening_schedule: schedule.opening_schedule,
    contact_text: trimSectionContent(sections.contact_details ?? ''),
    hours_text: trimSectionContent(sections.hours ?? ''),
    prices_text: trimSectionContent(sections.pricing ?? ''),
    services_products_text: trimSectionContent(sections.services_products ?? ''),
    booking_info_text: trimSectionContent(sections.booking_enquiries ?? ''),
    policies_text: trimSectionContent(sections.policies ?? ''),
    style_template: voice.style_template,
    style_notes: voice.style_notes,
    topics_to_avoid:
      sections.topics_to_avoid !== undefined ? trimSectionContent(sections.topics_to_avoid ?? '') : '',
    escalation_text:
      sections.human_handoff !== undefined ? trimSectionContent(sections.human_handoff ?? '') : '',
    extra_knowledge: extraKnowledge,
  }
}
