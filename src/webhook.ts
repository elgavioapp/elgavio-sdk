import type { WebhookPayload } from './types.js';

/** How old a call's signature may be, in seconds: older ones are refused as replays. */
export const DEFAULT_WEBHOOK_TOLERANCE = 300;

export type WebhookRefusal = 'signatureMissing' | 'signatureInvalid' | 'signatureExpired';

export class ElgavioWebhookError extends Error {
  override readonly name = 'ElgavioWebhookError';
  readonly reason: WebhookRefusal;

  constructor(reason: WebhookRefusal, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface VerifyWebhookOptions {
  /** The webhook's signing secret, `whsec_…`. */
  secret: string;
  /** Seconds a signature stays valid. */
  tolerance?: number;
  /** Unix seconds; the current time when left out. */
  now?: number;
}

const encoder = new TextEncoder();

const bytesOfHex = (hex: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

const partsOf = (header: string) => {
  let timestamp: number | null = null;
  const signatures: Uint8Array<ArrayBuffer>[] = [];
  for (const part of header.split(',')) {
    const [key, value = ''] = part.trim().split('=', 2);
    if (key === 't' && /^\d+$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1') {
      const bytes = bytesOfHex(value);
      if (bytes !== null) {
        signatures.push(bytes);
      }
    }
  }
  return { timestamp, signatures };
};

/**
 * Checks a webhook call's `Elgavio-Signature` against its raw body and returns the payload. Pass
 * the body exactly as received, before any JSON parsing. Throws `ElgavioWebhookError` for a
 * missing, wrong or expired signature. Uses Web Crypto, so it runs on Node, edge runtimes and Deno.
 */
export const verifyWebhook = async (
  body: string,
  signature: string | null | undefined,
  { secret, tolerance = DEFAULT_WEBHOOK_TOLERANCE, now }: VerifyWebhookOptions,
): Promise<WebhookPayload> => {
  if (signature === null || signature === undefined || signature === '') {
    throw new ElgavioWebhookError('signatureMissing', 'The call carries no Elgavio-Signature.');
  }

  const { timestamp, signatures } = partsOf(signature);
  if (timestamp === null || signatures.length === 0) {
    throw new ElgavioWebhookError('signatureInvalid', 'The Elgavio-Signature is malformed.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = encoder.encode(`${String(timestamp)}.${body}`);
  // `verify` compares in constant time.
  const matches = await Promise.all(
    signatures.map((candidate) => crypto.subtle.verify('HMAC', key, candidate, signed)),
  );
  if (!matches.includes(true)) {
    throw new ElgavioWebhookError(
      'signatureInvalid',
      "The Elgavio-Signature doesn't match the body under this secret.",
    );
  }

  const current = now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(current - timestamp) > tolerance) {
    throw new ElgavioWebhookError('signatureExpired', 'The Elgavio-Signature is too old.');
  }

  return JSON.parse(body) as WebhookPayload;
};
