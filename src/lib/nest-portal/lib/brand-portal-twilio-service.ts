/// <reference types="node" />

export const DEFAULT_TWILIO_VOICE_WEBHOOK_URL =
  'https://oypzijwqmkxktvgtsqkp.supabase.co/functions/v1/twilio-voice-webhook'

/**
 * AU number types and their requirements (verified against Twilio API):
 *  - Local: `address_requirements: "local"` → needs `AddressSid` only, no bundle. Voice only.
 *  - TollFree: `address_requirements: "any"` → needs any address. Voice only.
 *  - Mobile: `address_requirements: "any"` → requires approved `BundleSid`. Voice + SMS.
 *  - National: 404 on Twilio AU — does not exist.
 */
export const AUSTRALIAN_TWILIO_NUMBER_TYPES = ['Local', 'TollFree', 'Mobile'] as const

export type TwilioNumberStatus = '' | 'active' | 'error'

export type BrandTwilioPhoneState = {
  twilio_phone_number_e164: string
  twilio_phone_number_sid: string
  twilio_phone_status: TwilioNumberStatus
  twilio_phone_purchased_at: string | null
  twilio_phone_error: string
}

export type ExistingBrandTwilioPhoneState = Partial<BrandTwilioPhoneState> & {
  business_display_name?: string | null
}

export type EnsureBrandTwilioNumberResult = {
  kind: 'existing' | 'purchased'
  state: BrandTwilioPhoneState
}

type FetchLike = typeof fetch

type TwilioCredentials = {
  accountSid: string
  authHeader: string
}

type TwilioAvailablePhoneNumber = {
  phone_number?: string
  friendly_name?: string
  locality?: string
  region?: string
  capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean }
}

type TwilioAvailablePhoneNumbersResponse = {
  available_phone_numbers?: TwilioAvailablePhoneNumber[]
}

type TwilioIncomingPhoneNumberResponse = {
  sid?: string
  phone_number?: string
}

type PersistTwilioState = (
  patch: Partial<BrandTwilioPhoneState>,
) => Promise<BrandTwilioPhoneState>

export function normaliseBrandTwilioPhoneState(
  raw: Partial<BrandTwilioPhoneState> | null | undefined,
): BrandTwilioPhoneState {
  return {
    twilio_phone_number_e164:
      typeof raw?.twilio_phone_number_e164 === 'string'
        ? raw.twilio_phone_number_e164.trim()
        : '',
    twilio_phone_number_sid:
      typeof raw?.twilio_phone_number_sid === 'string'
        ? raw.twilio_phone_number_sid.trim()
        : '',
    twilio_phone_status:
      raw?.twilio_phone_status === 'active' || raw?.twilio_phone_status === 'error'
        ? raw.twilio_phone_status
        : '',
    twilio_phone_purchased_at:
      typeof raw?.twilio_phone_purchased_at === 'string' && raw.twilio_phone_purchased_at.trim()
        ? raw.twilio_phone_purchased_at
        : null,
    twilio_phone_error:
      typeof raw?.twilio_phone_error === 'string'
        ? raw.twilio_phone_error.trim()
        : '',
  }
}

export function buildTwilioAuthHeader(input: {
  accountSid: string
  authToken?: string
  apiKey?: string
  apiSecret?: string
}): string {
  const accountSid = input.accountSid.trim()
  const apiKey = input.apiKey?.trim() || ''
  const apiSecret = input.apiSecret?.trim() || ''
  const authToken = input.authToken?.trim() || ''

  if (apiKey && apiSecret) {
    return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
  }

  if (accountSid && authToken) {
    return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
  }

  throw new Error(
    'Server missing Twilio credentials. Set TWILIO_ACCOUNT_SID plus TWILIO_AUTH_TOKEN or TWILIO_API_KEY and TWILIO_API_SECRET.',
  )
}

function buildTwilioCredentials(input: {
  accountSid: string
  authToken?: string
  apiKey?: string
  apiSecret?: string
}): TwilioCredentials {
  const accountSid = input.accountSid.trim()
  if (!accountSid) {
    throw new Error('Server missing TWILIO_ACCOUNT_SID.')
  }

  return {
    accountSid,
    authHeader: buildTwilioAuthHeader(input),
  }
}

function twilioApiUrl(accountSid: string, path: string): URL {
  const cleanPath = path.replace(/^\/+/, '')
  return new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${cleanPath}`)
}

async function readTwilioErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text()
  const trimmed = text.trim()
  if (!trimmed) return fallback

  try {
    const parsed = JSON.parse(trimmed) as { message?: string; detail?: string }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim()
  } catch {
    // Ignore parse failure and fall back to text.
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed
}

async function twilioRequest<T>(input: {
  credentials: TwilioCredentials
  path: string
  method?: 'GET' | 'POST'
  params?: URLSearchParams
  fetchImpl?: FetchLike
  fallbackError: string
}): Promise<T> {
  const fetchImpl = input.fetchImpl ?? fetch
  const method = input.method ?? 'GET'
  const url = twilioApiUrl(input.credentials.accountSid, input.path)
  const headers: HeadersInit = {
    Authorization: input.credentials.authHeader,
  }

  let body: string | undefined
  if (method === 'GET' && input.params) {
    url.search = input.params.toString()
  } else if (input.params) {
    body = input.params.toString()
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const res = await fetchImpl(url, {
    method,
    headers,
    body,
  })

  if (!res.ok) {
    throw new Error(await readTwilioErrorMessage(res, input.fallbackError))
  }

  return await res.json() as T
}

type AustralianNumberType = (typeof AUSTRALIAN_TWILIO_NUMBER_TYPES)[number]

/**
 * Build the search order based on which credentials are available.
 * Local needs AddressSid; Mobile needs BundleSid; TollFree works with any address.
 */
function buildAustralianSearchTypes(input: {
  addressSid?: string
  bundleSid?: string
}): AustralianNumberType[] {
  const hasAddress = Boolean(input.addressSid?.trim())
  const hasBundle = Boolean(input.bundleSid?.trim())
  const types: AustralianNumberType[] = []
  if (hasAddress) types.push('Local')
  types.push('TollFree')
  if (hasBundle) types.push('Mobile')
  return types
}

export type AvailableAustralianNumber = {
  phone_number: string
  friendly_name: string
  locality: string | null
  region: string | null
  type: string
  capabilities: { voice: boolean; sms: boolean; mms: boolean }
}

async function searchAustralianNumbers(input: {
  credentials: TwilioCredentials
  addressSid?: string
  bundleSid?: string
  limit?: number
  fetchImpl?: FetchLike
}): Promise<AvailableAustralianNumber[]> {
  const order = buildAustralianSearchTypes(input)
  const limit = input.limit ?? 10
  const results: AvailableAustralianNumber[] = []

  for (const type of order) {
    if (results.length >= limit) break
    const params = new URLSearchParams({
      VoiceEnabled: 'true',
      Limit: String(Math.min(limit - results.length, 30)),
    })
    const address = input.addressSid?.trim()
    if (address) params.set('AddressSid', address)
    const bundle = input.bundleSid?.trim()
    if (bundle) params.set('BundleSid', bundle)

    try {
      const data = await twilioRequest<TwilioAvailablePhoneNumbersResponse>({
        credentials: input.credentials,
        path: `AvailablePhoneNumbers/AU/${type}.json`,
        params,
        fetchImpl: input.fetchImpl,
        fallbackError: `Could not search Australian ${type.toLowerCase()} Twilio numbers.`,
      })
      for (const n of data.available_phone_numbers ?? []) {
        const phone = n.phone_number?.trim()
        if (!phone) continue
        results.push({
          phone_number: phone,
          friendly_name: n.friendly_name?.trim() ?? phone,
          locality: n.locality?.trim() || null,
          region: n.region?.trim() || null,
          type,
          capabilities: {
            voice: Boolean(n.capabilities?.voice),
            sms: Boolean(n.capabilities?.SMS),
            mms: Boolean(n.capabilities?.MMS),
          },
        })
      }
    } catch {
      // Type not available — continue to next.
    }
  }

  return results
}

export async function searchAvailableTwilioNumbers(input: {
  accountSid: string
  authToken?: string
  apiKey?: string
  apiSecret?: string
  addressSid?: string
  bundleSid?: string
  limit?: number
  fetchImpl?: FetchLike
}): Promise<AvailableAustralianNumber[]> {
  const credentials = buildTwilioCredentials({
    accountSid: input.accountSid,
    authToken: input.authToken,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
  })
  return searchAustralianNumbers({
    credentials,
    addressSid: input.addressSid,
    bundleSid: input.bundleSid,
    limit: input.limit,
    fetchImpl: input.fetchImpl,
  })
}

async function findFirstAvailableAustralianPhoneNumber(input: {
  credentials: TwilioCredentials
  addressSid?: string
  bundleSid?: string
  fetchImpl?: FetchLike
}): Promise<string> {
  const results = await searchAustralianNumbers({ ...input, limit: 1 })
  if (results.length > 0) return results[0].phone_number
  throw new Error('No Australian Twilio numbers are available right now.')
}

function buildTwilioFriendlyName(brandKey: string, businessName?: string): string {
  const base = businessName?.trim() || brandKey.trim() || 'Nest business'
  return `Nest ${base}`.slice(0, 64)
}

async function purchaseIncomingPhoneNumber(input: {
  credentials: TwilioCredentials
  phoneNumber: string
  brandKey: string
  businessName?: string
  addressSid?: string
  bundleSid?: string
  fetchImpl?: FetchLike
}): Promise<TwilioIncomingPhoneNumberResponse> {
  const params = new URLSearchParams({
    PhoneNumber: input.phoneNumber,
    FriendlyName: buildTwilioFriendlyName(input.brandKey, input.businessName),
  })
  const address = input.addressSid?.trim()
  if (address) params.set('AddressSid', address)
  const bundle = input.bundleSid?.trim()
  if (bundle) params.set('BundleSid', bundle)

  return twilioRequest<TwilioIncomingPhoneNumberResponse>({
    credentials: input.credentials,
    path: 'IncomingPhoneNumbers.json',
    method: 'POST',
    params,
    fetchImpl: input.fetchImpl,
    fallbackError: 'Could not purchase the Twilio number.',
  })
}

async function updateIncomingPhoneNumberWebhook(input: {
  credentials: TwilioCredentials
  phoneSid: string
  voiceWebhookUrl: string
  fetchImpl?: FetchLike
}): Promise<void> {
  await twilioRequest<TwilioIncomingPhoneNumberResponse>({
    credentials: input.credentials,
    path: `IncomingPhoneNumbers/${encodeURIComponent(input.phoneSid)}.json`,
    method: 'POST',
    params: new URLSearchParams({
      VoiceUrl: input.voiceWebhookUrl,
      VoiceMethod: 'POST',
    }),
    fetchImpl: input.fetchImpl,
    fallbackError: 'Could not update the Twilio voice webhook.',
  })
}

async function persistErrorState(
  persist: PersistTwilioState,
  message: string,
): Promise<void> {
  await persist({
    twilio_phone_status: 'error',
    twilio_phone_error: message,
  })
}

function augmentTwilioProvisionError(message: string): string {
  if (
    /AddressSid/i.test(message) &&
    /empty|required|missing/i.test(message)
  ) {
    return `${message} Set TWILIO_ADDRESS_SID to a verified Address SID from the Twilio Console (Phone Numbers → Regulatory Compliance → Addresses), or use a number type that does not require an address.`
  }
  if (/Bundle/i.test(message) && /required|not provided|missing|empty/i.test(message)) {
    return `${message} Create an approved regulatory bundle for Australia (Mobile) in the Twilio Console (Regulatory Compliance) and set TWILIO_BUNDLE_SID to that Bundle SID (starts with BU).`
  }
  return message
}

export async function ensureBrandTwilioNumber(input: {
  brandKey: string
  businessName?: string
  existing?: ExistingBrandTwilioPhoneState | null
  accountSid: string
  authToken?: string
  apiKey?: string
  apiSecret?: string
  addressSid?: string
  bundleSid?: string
  /** If set, skip the search and purchase this specific number. */
  phoneNumber?: string
  voiceWebhookUrl?: string
  fetchImpl?: FetchLike
  persist: PersistTwilioState
}): Promise<EnsureBrandTwilioNumberResult> {
  const credentials = buildTwilioCredentials({
    accountSid: input.accountSid,
    authToken: input.authToken,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
  })
  const existing = normaliseBrandTwilioPhoneState(input.existing)
  const voiceWebhookUrl = (input.voiceWebhookUrl || DEFAULT_TWILIO_VOICE_WEBHOOK_URL).trim()

  if (!voiceWebhookUrl) {
    throw new Error('Twilio voice webhook URL is missing.')
  }

  if (existing.twilio_phone_number_sid && existing.twilio_phone_number_e164) {
    try {
      await updateIncomingPhoneNumberWebhook({
        credentials,
        phoneSid: existing.twilio_phone_number_sid,
        voiceWebhookUrl,
        fetchImpl: input.fetchImpl,
      })
      const state = await input.persist({
        twilio_phone_status: 'active',
        twilio_phone_error: '',
      })
      return {
        kind: 'existing',
        state: normaliseBrandTwilioPhoneState(state),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update the Twilio voice webhook.'
      await persistErrorState(input.persist, message)
      throw new Error(message)
    }
  }

  try {
    const addressSid = input.addressSid?.trim()
    const bundleSid = input.bundleSid?.trim()
    const explicitPhone = input.phoneNumber?.trim()
    const phoneNumber = explicitPhone || await findFirstAvailableAustralianPhoneNumber({
      credentials,
      addressSid: addressSid || undefined,
      bundleSid: bundleSid || undefined,
      fetchImpl: input.fetchImpl,
    })
    const purchased = await purchaseIncomingPhoneNumber({
      credentials,
      phoneNumber,
      brandKey: input.brandKey,
      businessName: input.businessName,
      addressSid: addressSid || undefined,
      bundleSid: bundleSid || undefined,
      fetchImpl: input.fetchImpl,
    })

    const phoneSid = purchased.sid?.trim() || ''
    const phoneNumberE164 = purchased.phone_number?.trim() || phoneNumber
    if (!phoneSid || !phoneNumberE164) {
      throw new Error('Twilio returned an incomplete phone number response.')
    }

    const purchasedAt = new Date().toISOString()

    try {
      await updateIncomingPhoneNumberWebhook({
        credentials,
        phoneSid,
        voiceWebhookUrl,
        fetchImpl: input.fetchImpl,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update the Twilio voice webhook.'
      await input.persist({
        twilio_phone_number_e164: phoneNumberE164,
        twilio_phone_number_sid: phoneSid,
        twilio_phone_status: 'error',
        twilio_phone_purchased_at: purchasedAt,
        twilio_phone_error: message,
      })
      throw new Error(message)
    }

    const state = await input.persist({
      twilio_phone_number_e164: phoneNumberE164,
      twilio_phone_number_sid: phoneSid,
      twilio_phone_status: 'active',
      twilio_phone_purchased_at: purchasedAt,
      twilio_phone_error: '',
    })

    return {
      kind: 'purchased',
      state: normaliseBrandTwilioPhoneState(state),
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Could not provision a Twilio number.'
    const message = augmentTwilioProvisionError(raw)
    await persistErrorState(input.persist, message)
    throw new Error(message)
  }
}
