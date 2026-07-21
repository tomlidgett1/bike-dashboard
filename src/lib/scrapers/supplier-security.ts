import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ENCRYPTION_VERSION = "v1";
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

const hostnameSafetyCache = new Map<string, { safe: boolean; expiresAt: number }>();
const HOSTNAME_CACHE_TTL_MS = 5 * 60_000;

function hostnamesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/^www\./, "");
  const b = right.toLowerCase().replace(/^www\./, "");
  return a === b;
}

/** Exact match or shared parent domain (e.g. auth.pondealer.bike ↔ pondealer.bike). */
export function hostnamesRelated(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/^www\./, "");
  const b = right.toLowerCase().replace(/^www\./, "");
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export interface SupplierCredentials {
  username: string;
  password: string;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true;

  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalised = address.toLowerCase();
  return (
    normalised === "::" ||
    normalised === "::1" ||
    normalised.startsWith("fc") ||
    normalised.startsWith("fd") ||
    normalised.startsWith("fe8") ||
    normalised.startsWith("fe9") ||
    normalised.startsWith("fea") ||
    normalised.startsWith("feb") ||
    normalised.startsWith("::ffff:127.") ||
    normalised.startsWith("::ffff:10.") ||
    normalised.startsWith("::ffff:192.168.")
  );
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertSafeSupplierUrl(
  rawUrl: string,
  allowedHostname?: string,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid supplier website URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Supplier URLs must use HTTPS or HTTP.");
  }
  if (url.username || url.password) {
    throw new Error("Do not include credentials in the supplier URL.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Private and local supplier addresses are not supported.");
  }

  if (allowedHostname && !hostnamesRelated(hostname, allowedHostname)) {
    throw new Error("The scraper cannot navigate away from the supplier website.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Private and local supplier addresses are not supported.");
    }
    return url;
  }

  const cached = hostnameSafetyCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.safe) {
      throw new Error("Private and local supplier addresses are not supported.");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    hostnameSafetyCache.set(hostname, { safe: false, expiresAt: Date.now() + HOSTNAME_CACHE_TTL_MS });
    throw new Error("The supplier website could not be resolved.");
  }

  const safe =
    addresses.length > 0 && !addresses.some(({ address }) => isPrivateAddress(address));
  hostnameSafetyCache.set(hostname, {
    safe,
    expiresAt: Date.now() + HOSTNAME_CACHE_TTL_MS,
  });

  if (!safe) {
    throw new Error("Private and local supplier addresses are not supported.");
  }

  return url;
}

function credentialKey(): Buffer {
  const secret = process.env.SCRAPER_CREDENTIALS_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SCRAPER_CREDENTIALS_KEY must be configured with at least 32 characters before supplier credentials can be saved.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSupplierCredentials(credentials: SupplierCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(credentials), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSupplierCredentials(payload: string): SupplierCredentials {
  const [version, encodedIv, encodedTag, encodedCiphertext] = payload.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext
  ) {
    throw new Error("The saved supplier credentials are invalid.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      credentialKey(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as Partial<SupplierCredentials>;
    if (typeof parsed.username !== "string" || typeof parsed.password !== "string") {
      throw new Error("Invalid credential payload");
    }
    return { username: parsed.username, password: parsed.password };
  } catch {
    throw new Error("The saved supplier credentials could not be decrypted.");
  }
}
