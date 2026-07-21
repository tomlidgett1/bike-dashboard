import {
  authConfigsForToolkits,
  getComposioClient,
  getComposioUserId,
  resolveComposioCallbackUrl,
} from '@/lib/composio/client'

export interface ComposioConnectedAccount {
  id: string
  toolkit: string
  label: string
  status: string
  email_address?: string | null
  alias?: string | null
}

export interface ComposioToolSummary {
  slug: string
  name: string
  toolkit: string
  description: string
  risk: 'read' | 'write'
  inputParameters?: unknown
  outputParameters?: unknown
  hasFullSchema?: boolean
}

function normaliseToolkit(value: Record<string, unknown>): string {
  const toolkit = value.toolkit as Record<string, unknown> | undefined
  return String(
    value.toolkit_slug ??
      toolkit?.slug ??
      value.appName ??
      value.name ??
      'unknown',
  ).toLowerCase()
}

function pickAccountString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractAccountEmail(account: Record<string, unknown>): string | null {
  const state = account.state as Record<string, unknown> | undefined
  const data = account.data as Record<string, unknown> | undefined
  const params = account.params as Record<string, unknown> | undefined
  const member = account.member as Record<string, unknown> | undefined
  return pickAccountString(
    account.alias,
    member?.email,
    state?.email,
    state?.user_email,
    state?.emailAddress,
    state?.email_address,
    data?.email,
    params?.email,
  )
}

function normaliseConnectedAccount(value: Record<string, unknown>): ComposioConnectedAccount {
  const email = extractAccountEmail(value)
  const alias = pickAccountString(value.alias)
  const toolkit = normaliseToolkit(value)
  const label = email ?? alias ?? normaliseLabel(value)
  return {
    id: String(value.id ?? ''),
    toolkit,
    label,
    status: normaliseStatus(value),
    email_address: email,
    alias,
  }
}

function normaliseLabel(value: Record<string, unknown>): string {
  const toolkit = value.toolkit as Record<string, unknown> | undefined
  return String(toolkit?.name ?? value.appName ?? value.name ?? normaliseToolkit(value))
}

function normaliseStatus(value: Record<string, unknown>): string {
  return String(value.status ?? 'ACTIVE').toUpperCase()
}

export function inferComposioToolRisk(tool: Record<string, unknown>): 'read' | 'write' {
  const slug = String(tool.slug ?? '').toUpperCase()
  const description = String(tool.description ?? '').toLowerCase()

  const writeSlug =
    /(CREATE|UPDATE|DELETE|SEND|POST|WRITE|PATCH|UPSERT|REMOVE|CANCEL|ARCHIVE|REPLY|COMMENT|BOOK|SCHEDULE|INVITE|ADD_)/.test(
      slug,
    )
  const writeDescription =
    /\b(create|update|delete|send|post|write|patch|upsert|remove|cancel|archive|reply|comment|book|schedule|invite|add)\b/.test(
      description,
    )

  return writeSlug || writeDescription ? 'write' : 'read'
}

export function composioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/invalid api key|10401|unauthorized/i.test(message)) {
    return 'Composio API key is invalid or expired. Update COMPOSIO_API_KEY in server env.'
  }
  if (/not connected|no active connection|connected account|auth|401|403|token|expired|reconnect/i.test(message)) {
    return message
  }
  return message
}

export async function listConnectedAccounts(userId: string): Promise<ComposioConnectedAccount[]> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(userId)
  const response = await composio.connectedAccounts.list({ userIds: [composioUserId] })
  const items = (
    (response as { items?: unknown[] }).items ??
    (response as { data?: unknown[] }).data ??
    []
  ) as unknown[]

  return items
    .map((item) => item as Record<string, unknown>)
    .map((account) => normaliseConnectedAccount(account))
    .filter((account) => account.id.length > 0)
}

export async function listConnectedAccountsSafe(
  userId: string,
): Promise<{ accounts: ComposioConnectedAccount[]; error?: string }> {
  try {
    const accounts = await listConnectedAccounts(userId)
    return { accounts }
  } catch (error) {
    return { accounts: [], error: composioErrorMessage(error) }
  }
}

export function getActiveConnection(
  accounts: ComposioConnectedAccount[],
  toolkit: string,
): ComposioConnectedAccount | null {
  return listActiveConnections(accounts, toolkit)[0] ?? null
}

export function listActiveConnections(
  accounts: ComposioConnectedAccount[],
  toolkit: string,
): ComposioConnectedAccount[] {
  const slug = toolkit.trim().toLowerCase()
  return accounts.filter((account) => account.toolkit === slug && account.status === 'ACTIVE')
}

async function resolveAuthConfigId(toolkitSlug: string): Promise<string | null> {
  const authConfigs = authConfigsForToolkits([toolkitSlug])
  if (authConfigs) {
    const direct = authConfigs[toolkitSlug] ?? authConfigs[toolkitSlug.replace(/_/g, '')]
    if (direct) return direct
  }

  const composio = getComposioClient()
  const listed = await composio.authConfigs.list({ toolkit: toolkitSlug, limit: 1 })
  const items = (listed as { items?: Array<{ id?: string }> }).items ?? []
  return items[0]?.id ?? null
}

export async function mintToolkitConnectLink(
  userId: string,
  toolkit: string,
  options?: { allowMultiple?: boolean; alias?: string; callbackUrl?: string },
): Promise<{ toolkit: string; url: string }> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(userId)
  const toolkitSlug = toolkit.trim().toLowerCase()
  const authConfigId = await resolveAuthConfigId(toolkitSlug)
  const callbackUrl = options?.callbackUrl?.trim() || resolveComposioCallbackUrl()

  if (authConfigId) {
    const connectionRequest = await composio.connectedAccounts.link(composioUserId, authConfigId, {
      callbackUrl,
      allowMultiple: options?.allowMultiple ?? true,
      ...(options?.alias ? { alias: options.alias } : {}),
    })
    if (!connectionRequest.redirectUrl) {
      throw new Error(`Composio did not return a redirect URL for ${toolkitSlug}.`)
    }
    return { toolkit: toolkitSlug, url: connectionRequest.redirectUrl }
  }

  const authConfigs = authConfigsForToolkits([toolkitSlug])
  const session = await composio.create(composioUserId, {
    toolkits: [toolkitSlug] as never,
    manageConnections: true,
    ...(authConfigs ? { authConfigs } : {}),
  })
  const connectionRequest = await session.authorize(toolkitSlug, {
    callbackUrl,
    ...(options?.alias ? { alias: options.alias } : {}),
  })
  if (!connectionRequest.redirectUrl) {
    throw new Error(`Composio did not return a redirect URL for ${toolkitSlug}.`)
  }
  return { toolkit: toolkitSlug, url: connectionRequest.redirectUrl }
}

export async function searchComposioSessionTools(args: {
  userId: string
  query: string
  toolkits?: string[]
  limit?: number
}): Promise<{
  sessionId: string | null
  items: ComposioToolSummary[]
  total: number
  toolkitConnectionStatuses: unknown[]
  nextStepsGuidance: unknown[]
  executionGuidance?: string
  knownPitfalls?: string[]
  recommendedPlanSteps?: string[]
}> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(args.userId)
  const authConfigs = authConfigsForToolkits(args.toolkits ?? [])
  const session = await composio.create(composioUserId, {
    ...(args.toolkits?.length ? { toolkits: args.toolkits as never } : {}),
    manageConnections: true,
    ...(authConfigs ? { authConfigs } : {}),
  })
  const search = await session.search({
    query: args.query,
    ...(args.toolkits?.length ? { toolkits: args.toolkits } : {}),
  } as never)

  const schemas = (search.toolSchemas ?? {}) as Record<string, {
    toolSlug?: string
    toolkit?: string
    description?: string
    inputSchema?: Record<string, unknown>
    outputSchema?: Record<string, unknown>
    hasFullSchema?: boolean
  }>

  const orderedSlugs: string[] = []
  const primaryResult = search.results?.[0] as Record<string, unknown> | undefined

  for (const result of search.results ?? []) {
    for (const slug of result.primaryToolSlugs ?? []) {
      if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug)
    }
    for (const slug of result.relatedToolSlugs ?? []) {
      if (!orderedSlugs.includes(slug)) orderedSlugs.push(slug)
    }
  }

  const items = orderedSlugs
    .map((slug) => {
      const schema = schemas[slug] ?? {}
      return {
        slug,
        name: slug,
        toolkit: String(schema.toolkit ?? slug.split('_')[0]?.toLowerCase() ?? 'unknown').toLowerCase(),
        description: String(schema.description ?? ''),
        risk: inferComposioToolRisk({ slug, description: schema.description ?? '' }),
        inputParameters: schema.inputSchema ?? {},
        outputParameters: schema.outputSchema ?? {},
        hasFullSchema: schema.hasFullSchema ?? false,
      }
    })
    .slice(0, args.limit ?? 12)

  return {
    sessionId: search.session?.id ?? null,
    items,
    total: items.length,
    toolkitConnectionStatuses: search.toolkitConnectionStatuses ?? [],
    nextStepsGuidance: search.nextStepsGuidance ?? [],
    executionGuidance: typeof primaryResult?.executionGuidance === 'string'
      ? primaryResult.executionGuidance
      : undefined,
    knownPitfalls: Array.isArray(primaryResult?.knownPitfalls)
      ? primaryResult.knownPitfalls.map(String)
      : undefined,
    recommendedPlanSteps: Array.isArray(primaryResult?.recommendedPlanSteps)
      ? primaryResult.recommendedPlanSteps.map(String)
      : undefined,
  }
}

export async function getComposioToolSchema(slug: string): Promise<{
  slug: string
  name: string
  description: string
  toolkit: string | null
  risk: 'read' | 'write'
  inputParameters: unknown
}> {
  const composio = getComposioClient()
  const tool = await composio.tools.getRawComposioToolBySlug(slug) as Record<string, unknown>
  const toolkit = (tool.toolkit && typeof tool.toolkit === 'object' && !Array.isArray(tool.toolkit))
    ? tool.toolkit as Record<string, unknown>
    : {}

  return {
    slug: String(tool.slug ?? slug),
    name: String(tool.name ?? slug),
    description: String(tool.description ?? ''),
    toolkit: typeof toolkit.slug === 'string' ? toolkit.slug : null,
    risk: inferComposioToolRisk(tool),
    inputParameters: tool.inputParameters ?? tool.input_parameters ?? {},
  }
}

async function executeComposioToolInternal(args: {
  userId: string
  slug: string
  connectedAccountId?: string
  input: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(args.userId)
  const tool = await composio.tools.getRawComposioToolBySlug(args.slug) as Record<string, unknown>
  const toolkitObj = (tool.toolkit && typeof tool.toolkit === 'object' && !Array.isArray(tool.toolkit))
    ? tool.toolkit as Record<string, unknown>
    : {}
  const toolkit = typeof toolkitObj.slug === 'string' ? toolkitObj.slug : null

  const executeArgs = {
    userId: composioUserId,
    connectedAccountId: args.connectedAccountId,
    arguments: args.input,
    dangerouslySkipVersionCheck: true,
  } as Parameters<typeof composio.tools.execute>[1]

  const result = await composio.tools.execute(args.slug, executeArgs)

  return {
    slug: args.slug,
    toolkit,
    risk: inferComposioToolRisk(tool),
    result,
  }
}

export async function executeComposioReadTool(args: {
  userId: string
  slug: string
  connectedAccountId?: string
  input: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const schema = await getComposioToolSchema(args.slug)
  if (schema.risk === 'write') {
    throw new Error(
      `${args.slug} looks like a mutating tool. Use propose_composio_write for create/update/send actions.`,
    )
  }
  return executeComposioToolInternal(args)
}

export async function executeComposioWriteTool(args: {
  userId: string
  slug: string
  connectedAccountId?: string
  input: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  return executeComposioToolInternal(args)
}

/** Human label for common Composio toolkits shown in connect cards. */
export function composioToolkitLabel(toolkit: string): string {
  const labels: Record<string, string> = {
    gmail: 'Gmail',
    slack: 'Slack',
    notion: 'Notion',
    hubspot: 'HubSpot',
    salesforce: 'Salesforce',
  }
  const slug = toolkit.trim().toLowerCase()
  return labels[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}
