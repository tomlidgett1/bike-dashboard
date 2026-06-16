/** Serialises Lightspeed Retail API calls to stay under ~1 request/second. */
const MIN_GAP_MS = 1_100

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isLightspeedRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('429') || /rate\s*limit/i.test(message)
}

export async function lightspeedThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const waitMs = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt))
    if (waitMs > 0) await sleep(waitMs)
    lastRequestAt = Date.now()
    try {
      return await fn()
    } catch (err) {
      if (!isLightspeedRateLimitError(err)) throw err
      await sleep(2_500)
      lastRequestAt = Date.now()
      return await fn()
    }
  }

  const next = chain.then(run, run) as Promise<T>
  chain = next.catch(() => {})
  return next
}
