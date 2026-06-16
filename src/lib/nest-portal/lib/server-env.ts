import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let cachedFileEnv: Record<string, string> | null = null

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function readEnvFiles(): Record<string, string> {
  if (cachedFileEnv) return cachedFileEnv

  const files = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '.vercel', '.env.development.local'),
    join(process.cwd(), '.env'),
    join(process.cwd(), '../twilio-realtime-voice-test/.env'),
  ]

  const out: Record<string, string> = {}

  for (const file of files) {
    if (!existsSync(file)) continue

    const text = readFileSync(file, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue

      const [, key, rawValue] = match
      if (out[key]) continue
      out[key] = stripWrappingQuotes(rawValue)
    }
  }

  cachedFileEnv = out
  return out
}

export function pickServerEnv(names: string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }

  const fileEnv = readEnvFiles()
  for (const name of names) {
    const v = fileEnv[name]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }

  return undefined
}
