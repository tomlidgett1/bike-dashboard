import { authConfigsForToolkits, getComposioClient, getComposioUserId, resolveComposioCallbackUrl } from '@/lib/composio/client'

type ComposioClient = ReturnType<typeof getComposioClient>
type ComposioToolRouterSession = Awaited<ReturnType<ComposioClient['create']>>

export interface ComposioSessionNotice {
  toolkit: 'gmail'
  session_id: string
  reused: boolean
}

export interface GmailComposioSessionExecutor {
  session_id: string
  reused: boolean
  account_selection_enabled: boolean
  search(query: string): Promise<unknown>
  execute(
    toolSlug: string,
    input: Record<string, unknown>,
    connectedAccountId?: string,
  ): Promise<Record<string, unknown>>
}

const GMAIL_PRELOAD_TOOLS = [
  'GMAIL_FETCH_EMAILS',
  'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
] as const

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

function gmailSessionConfig(connectedAccountIds: string[]) {
  const accountIds = uniq(connectedAccountIds)
  const authConfigs = authConfigsForToolkits(['gmail'])
  const multiAccount = accountIds.length > 1

  return {
    toolkits: ['gmail'],
    manageConnections: {
      enable: true,
      callbackUrl: resolveComposioCallbackUrl(),
    },
    ...(authConfigs ? { authConfigs } : {}),
    ...(accountIds.length > 0 ? { connectedAccounts: { gmail: accountIds } } : {}),
    ...(multiAccount
      ? {
        multiAccount: {
          enable: true,
          maxAccountsPerToolkit: Math.min(10, Math.max(2, accountIds.length)),
          requireExplicitSelection: false,
        },
      }
      : {
        preload: {
          tools: [...GMAIL_PRELOAD_TOOLS],
        },
      }),
  } as const
}

async function createGmailSession(
  composio: ComposioClient,
  composioUserId: string,
  connectedAccountIds: string[],
): Promise<ComposioToolRouterSession> {
  return composio.create(composioUserId, gmailSessionConfig(connectedAccountIds) as never)
}

export async function getOrCreateGmailComposioSession(args: {
  userId: string
  sessionId?: string | null
  connectedAccountIds?: string[]
  onSession?: (notice: ComposioSessionNotice) => void | Promise<void>
}): Promise<GmailComposioSessionExecutor> {
  const composio = getComposioClient()
  const composioUserId = getComposioUserId(args.userId)
  const accountIds = uniq(args.connectedAccountIds ?? [])

  let session: ComposioToolRouterSession
  let reused = false

  if (args.sessionId?.trim()) {
    try {
      session = await composio.use(args.sessionId.trim())
      reused = true
      await session.update(gmailSessionConfig(accountIds) as never).catch((error) => {
        console.warn('[composio] gmail session update failed:', error)
      })
    } catch (error) {
      console.warn('[composio] gmail session reuse failed; creating a new session:', error)
      session = await createGmailSession(composio, composioUserId, accountIds)
    }
  } else {
    session = await createGmailSession(composio, composioUserId, accountIds)
  }

  await args.onSession?.({
    toolkit: 'gmail',
    session_id: session.sessionId,
    reused,
  })

  return {
    session_id: session.sessionId,
    reused,
    account_selection_enabled: accountIds.length > 1,
    async search(query: string) {
      return session.search({ query, toolkits: ['gmail'] })
    },
    async execute(toolSlug: string, input: Record<string, unknown>, connectedAccountId?: string) {
      const result = await session.execute(
        toolSlug,
        input,
        connectedAccountId && accountIds.length > 1 ? ({ account: connectedAccountId } as never) : undefined,
      )
      return result as Record<string, unknown>
    },
  }
}
