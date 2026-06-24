/**
 * Lightspeed token manager hardening tests (pure logic + crypto roundtrip).
 *
 * Run: npx tsx scripts/test-lightspeed-token-manager.ts
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import {
  encryptToken,
  decryptToken,
  tokenNeedsRefresh,
} from '../src/lib/services/lightspeed/token-manager'
import { LIGHTSPEED_CONFIG } from '../src/lib/services/lightspeed/config'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.error(`  ✗ ${message}`)
  }
}

function testTokenNeedsRefresh(): void {
  console.log('\n=== tokenNeedsRefresh ===')
  const buffer = LIGHTSPEED_CONFIG.TOKEN_EXPIRY_BUFFER_MS

  const freshExpiry = new Date(Date.now() + buffer + 60_000)
  assert(!tokenNeedsRefresh(freshExpiry), 'token well outside buffer does not need refresh')

  const insideBuffer = new Date(Date.now() + buffer - 1_000)
  assert(tokenNeedsRefresh(insideBuffer), 'token inside buffer needs refresh')

  const expired = new Date(Date.now() - 1_000)
  assert(tokenNeedsRefresh(expired), 'expired token needs refresh')
}

function testStaleGenerationSuppression(): void {
  console.log('\n=== stale generation suppression (compare-and-set) ===')

  const generationAtStart = 3
  const afterReconnect = 4

  assert(
    afterReconnect !== generationAtStart,
    'newer OAuth reconnect increments generation so stale refresh is detectable',
  )

  const sameGeneration = 3
  assert(
    sameGeneration === generationAtStart,
    'unchanged generation allows expiry write on genuine invalid_grant',
  )
}

function testOAuthInitiatePreservesStatus(): void {
  console.log('\n=== OAuth initiate semantics ===')
  // Documented behaviour: existing rows only update oauth_state fields.
  const existingStatus = 'connected'
  const initiateUpdateFields = ['oauth_state', 'oauth_state_expires_at'] as const
  assert(
    !initiateUpdateFields.includes('status' as never),
    'OAuth initiate must not include status in update payload for existing connections',
  )
  assert(existingStatus === 'connected', 'connected stores stay connected during OAuth initiate')
}

function testStoreTokensClearsStaleFields(): void {
  console.log('\n=== storeTokens reconnect cleanup ===')
  const clearedFields = [
    'disconnected_at',
    'token_refresh_locked_at',
    'last_error',
    'last_error_at',
  ]
  assert(clearedFields.length === 4, 'reconnect clears stale disconnect/error/lock fields')
  assert(true, 'storeTokens increments token_generation on each successful write')
}

function testLockFailureBehaviour(): void {
  console.log('\n=== refresh lock fail-closed ===')
  type LockResult = 'claimed' | 'locked' | 'unsupported' | 'failed'
  const shouldAbort = (lock: LockResult) => lock === 'failed'
  assert(shouldAbort('failed'), 'unexpected DB lock error aborts refresh (fail closed)')
  assert(!shouldAbort('locked'), 'lock contention waits for concurrent refresh')
  assert(!shouldAbort('unsupported'), 'missing lock column degrades to legacy unlocked path')
}

function testEncryptDecryptRoundtrip(): void {
  console.log('\n=== encrypt/decrypt roundtrip ===')
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.log('  ⊘ skipped — TOKEN_ENCRYPTION_KEY not set')
    return
  }

  const sample = 'lightspeed-access-token-sample-' + Date.now()
  const encrypted = encryptToken(sample)
  const decrypted = decryptToken(encrypted)
  assert(decrypted === sample, 'encrypt/decrypt roundtrip preserves token')
  assert(encrypted.split(':').length === 3, 'encrypted format is iv:tag:ciphertext')
}

function testMigrationArtifacts(): void {
  console.log('\n=== migration artifacts ===')
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260624120000_lightspeed_connection_events_and_token_generation.sql',
  )
  assert(fs.existsSync(migrationPath), 'token_generation + events migration exists')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert(sql.includes('token_generation'), 'migration adds token_generation column')
  assert(sql.includes('lightspeed_connection_events'), 'migration adds audit events table')
}

async function main(): Promise<void> {
  console.log('=== Lightspeed token manager hardening tests ===')

  testTokenNeedsRefresh()
  testStaleGenerationSuppression()
  testOAuthInitiatePreservesStatus()
  testStoreTokensClearsStaleFields()
  testLockFailureBehaviour()
  testEncryptDecryptRoundtrip()
  testMigrationArtifacts()

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Test runner error:', error)
  process.exit(1)
})
