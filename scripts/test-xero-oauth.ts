/**
 * Xero OAuth confirmation test.
 * Hits Xero's live authorize endpoint with the EXACT production DEFAULT_SCOPES
 * to confirm the full set is accepted (no "Requested wrong apps scopes").
 *
 * Run: npx tsx scripts/test-xero-oauth.ts
 */
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { XERO_CONFIG, getXeroCredentials, buildXeroAuthUrl } from '../src/lib/services/xero/config'

const { clientId, redirectUri } = getXeroCredentials()

async function main() {
  console.log('=== Xero OAuth confirmation (full production scope set) ===')
  console.log('clientId:', clientId.slice(0, 6) + '…' + clientId.slice(-4))
  console.log('redirectUri:', redirectUri)
  console.log('scope count:', XERO_CONFIG.DEFAULT_SCOPES.length)

  const res = await fetch(buildXeroAuthUrl('confirm-' + Date.now()), {
    redirect: 'manual',
    headers: { 'User-Agent': 'yj-xero-confirm' },
  })
  const location = res.headers.get('location') || ''

  let error = ''
  if (location) {
    try { error = new URL(location).searchParams.get('error') || '' } catch { /* relative = login page */ }
  }

  if (error) {
    const desc = (() => { try { return decodeURIComponent(new URL(location).searchParams.get('error_description') || error) } catch { return error } })()
    console.error(`\n✗ FAIL — Xero rejected: ${desc}`)
    process.exit(2)
  }

  const accepted = res.status === 200 || (res.status >= 300 && res.status < 400 && !location.includes('error='))
  if (accepted) {
    console.log('\n✓ PASS — Xero accepted the client, redirect, and all', XERO_CONFIG.DEFAULT_SCOPES.length, 'scopes.')
    console.log('  The Connect Xero button will now reach the consent screen (after redeploy).')
    process.exit(0)
  }
  console.warn(`\n⚠ INCONCLUSIVE — HTTP ${res.status}, location: ${location}`)
  process.exit(3)
}

main().catch(err => { console.error('Test threw:', err); process.exit(1) })
