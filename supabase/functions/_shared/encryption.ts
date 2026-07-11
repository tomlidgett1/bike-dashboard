/**
 * AES-256-GCM encryption for sensitive search document fields.
 *
 * Encrypted values are stored as:  `enc:v1:<base64(iv + ciphertext + tag)>`
 *
 * The prefix lets read paths detect whether a value is encrypted (migration
 * period) or plaintext (legacy row not yet migrated).
 */

import { requireEnv } from "./env.ts";

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12; // 96-bit IV recommended for AES-GCM
const ENC_PREFIX = "enc:v1:";

// ── Key management ─────────────────────────────────────────────

let _key: CryptoKey | null = null;

/** Derive a CryptoKey from the hex-encoded secret stored in env. */
async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;

  const hex = requireEnv("SEARCH_ENCRYPTION_KEY"); // 64-char hex = 32 bytes
  const raw = hexToBytes(hex);
  if (raw.byteLength !== 32) {
    throw new Error(
      `SEARCH_ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${raw.byteLength}`,
    );
  }

  _key = await crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
  return _key;
}

// ── Public helpers ─────────────────────────────────────────────

/** Encrypt a plaintext string. Returns the `enc:v1:...` envelope. */
export async function encryptField(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext; // null / empty passthrough

  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Pack iv + ciphertext (GCM tag is appended by WebCrypto automatically)
  const packed = new Uint8Array(IV_BYTES + cipherBuf.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipherBuf), IV_BYTES);

  return ENC_PREFIX + bytesToBase64(packed);
}

/** Decrypt an `enc:v1:...` envelope back to plaintext. */
export async function decryptField(value: string): Promise<string> {
  if (!value) return value; // null / empty passthrough

  if (!isEncrypted(value)) return value; // plaintext passthrough (migration period)

  const key = await getKey();
  const packed = base64ToBytes(value.slice(ENC_PREFIX.length));

  const iv = packed.slice(0, IV_BYTES);
  const ciphertext = packed.slice(IV_BYTES);

  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plainBuf);
}

/** Check whether a stored value carries the encryption envelope. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt the sensitive text fields of a search_documents row object.
 * Mutates and returns the same object for convenience.
 */
export async function encryptDocumentRow<
  T extends Record<string, any>,
>(row: T): Promise<T> {
  if (row.title) row.title = await encryptField(row.title);
  if (row.summary_text) row.summary_text = await encryptField(row.summary_text);
  if (row.chunk_text) row.chunk_text = await encryptField(row.chunk_text);
  if (row.metadata && typeof row.metadata === "object") {
    row.metadata = await encryptMetadata(row.metadata);
  }
  return row;
}

/**
 * Decrypt the sensitive text fields of a search result row.
 * Returns a new object (does not mutate).
 */
export async function decryptSearchResult<
  T extends Record<string, any>,
>(row: T): Promise<T> {
  const out = { ...row };
  if (out.title) out.title = await decryptField(out.title);
  if (out.summary_text) out.summary_text = await decryptField(out.summary_text);
  if (out.chunk_text) out.chunk_text = await decryptField(out.chunk_text);
  if (out.metadata && typeof out.metadata === "object") {
    out.metadata = await decryptMetadata(out.metadata);
  }
  return out;
}

/**
 * Batch-decrypt an array of search results.
 */
export async function decryptSearchResults<
  T extends Record<string, any>,
>(rows: T[]): Promise<T[]> {
  return Promise.all(rows.map((r) => decryptSearchResult(r)));
}

// ── Metadata encryption ────────────────────────────────────────
// Only encrypt fields that contain email/calendar PII.

const SENSITIVE_METADATA_KEYS = [
  "participants",
  "attendees",
  "organiser",
  "organizer",
  "location",
  "meeting_link",
];

async function encryptMetadata(
  metadata: Record<string, any>,
): Promise<Record<string, any>> {
  const out = { ...metadata };
  for (const key of SENSITIVE_METADATA_KEYS) {
    if (out[key] != null) {
      out[key] = await encryptField(
        typeof out[key] === "string" ? out[key] : JSON.stringify(out[key]),
      );
    }
  }
  return out;
}

async function decryptMetadata(
  metadata: Record<string, any>,
): Promise<Record<string, any>> {
  const out = { ...metadata };
  for (const key of SENSITIVE_METADATA_KEYS) {
    if (typeof out[key] === "string" && isEncrypted(out[key])) {
      const decrypted = await decryptField(out[key]);
      // Try to restore JSON arrays/objects
      try {
        out[key] = JSON.parse(decrypted);
      } catch {
        out[key] = decrypted;
      }
    }
  }
  return out;
}

// ── Byte utilities ─────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
