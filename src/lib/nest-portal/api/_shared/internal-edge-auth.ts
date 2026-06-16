import { pickEnv } from './server-auth'

export function getInternalEdgeSharedSecret(): string | null {
  return pickEnv([
    'INTERNAL_EDGE_SHARED_SECRET',
    'NEST_INTERNAL_EDGE_SHARED_SECRET',
  ]) ?? null
}

export function internalEdgeJsonHeaders(): Record<string, string> {
  const secret = getInternalEdgeSharedSecret()
  if (!secret) {
    throw new Error('INTERNAL_EDGE_SHARED_SECRET is not configured')
  }

  return {
    'Content-Type': 'application/json',
    'x-internal-secret': secret,
  }
}
