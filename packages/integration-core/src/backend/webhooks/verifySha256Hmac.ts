import crypto from 'crypto'

/** Checks a hex HMAC-SHA256 of the raw body, with or without a "sha256=" prefix, in constant time. */
export function verifySha256Hmac(rawBody: Buffer, signature: string, secret: string): boolean {
  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature
  if (!/^[0-9a-fA-F]{64}$/.test(received)) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest()
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected)
}
