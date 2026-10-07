import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { WebhookPayload } from './types.js';
import { ElgavioWebhookError, verifyWebhook } from './webhook.js';

const SECRET = 'whsec_test';
const NOW = 1_800_000_000;

const PAYLOAD: WebhookPayload = {
  event: 'content.changed',
  trigger: 'publish',
  project: { id: 'project-1' },
  since: 4,
  next: 5,
  changes: [
    {
      seq: 5,
      at: '2027-01-15T08:00:00.000Z',
      kind: 'published',
      id: 'entry-1',
      collection: 'posts',
      locale: 'en',
      path: '/blog/hello',
      previousPath: null,
    },
  ],
  truncated: false,
};

const BODY = JSON.stringify(PAYLOAD);

const signatureOf = (body: string, secret = SECRET, timestamp = NOW) =>
  `t=${String(timestamp)},v1=${createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex')}`;

const refusalOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ElgavioWebhookError ? error.reason : error;
  }
  return null;
};

describe('verifyWebhook', () => {
  it('returns the payload of a call signed with the secret', async () => {
    await expect(
      verifyWebhook(BODY, signatureOf(BODY), { secret: SECRET, now: NOW + 10 }),
    ).resolves.toEqual(PAYLOAD);
  });

  it('refuses another secret, another body, and no signature', async () => {
    const options = { secret: SECRET, now: NOW };
    expect(await refusalOf(verifyWebhook(BODY, signatureOf(BODY, 'whsec_other'), options))).toBe(
      'signatureInvalid',
    );
    expect(await refusalOf(verifyWebhook(`${BODY} `, signatureOf(BODY), options))).toBe(
      'signatureInvalid',
    );
    expect(await refusalOf(verifyWebhook(BODY, 'v1=zz', options))).toBe('signatureInvalid');
    expect(await refusalOf(verifyWebhook(BODY, null, options))).toBe('signatureMissing');
  });

  it('refuses a signature older than the tolerance, as a replay', async () => {
    expect(
      await refusalOf(verifyWebhook(BODY, signatureOf(BODY), { secret: SECRET, now: NOW + 301 })),
    ).toBe('signatureExpired');
    await expect(
      verifyWebhook(BODY, signatureOf(BODY), { secret: SECRET, now: NOW + 301, tolerance: 600 }),
    ).resolves.toEqual(PAYLOAD);
  });
});
