/**
 * Cloudinary Upload API authentication via HTTP Basic Auth (recommended for server-side).
 * See https://cloudinary.com/documentation/image_upload_api_reference#basic_authentication
 *
 * Avoids manual SHA-1 signing, which is sensitive to parameter ordering and encoding.
 */
export function cloudinaryUploadAuthHeader(
  apiKey: string,
  apiSecret: string,
): string {
  const pair = `${apiKey.trim()}:${apiSecret.trim()}`
  return `Basic ${btoa(pair)}`
}
