import crypto from "node:crypto";

export function buildTwilioValidationUrl(publicBaseUrl: string, path: string): string {
  return `${publicBaseUrl.replace(/\/$/, "")}${path}`;
}

export function validateTwilioRequest(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function twimlConnectStream(
  streamUrl: string,
  parameters?: Record<string, string>,
): string {
  const paramXml = Object.entries(parameters ?? {})
    .map(
      ([name, value]) =>
        `      <Parameter name="${escapeXml(name)}" value="${escapeXml(value)}" />`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
${paramXml}
    </Stream>
  </Connect>
</Response>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
