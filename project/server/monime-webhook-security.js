import { createHmac, timingSafeEqual } from 'node:crypto';

export const MONIME_WEBHOOK_MAX_BYTES = 1024 * 1024;
const EVENT_ID = /^wke-[A-Za-z0-9_-]{1,120}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_]{0,48}(?:\\.[a-z][a-z0-9_]{0,48}){1,3}$/;
const OBJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const OBJECT_TYPE = /^[a-z][a-z0-9_]{0,63}$/;

export function verifyMonimeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || typeof secret !== 'string' || secret.length < 32 || secret.length > 256) return false;
  if (typeof signatureHeader !== 'string') return false;

  const match = /^t=(\d{10}),v1=([A-Za-z0-9+/]{43}=)$/.exec(signatureHeader.trim());
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (nowSeconds - timestamp > 300 || timestamp - nowSeconds > 60) return false;

  const received = Buffer.from(match[2], 'base64');
  if (received.length !== 32 || received.toString('base64') !== match[2]) return false;

  const expected = createHmac('sha256', secret)
    .update(String(timestamp) + '_', 'utf8')
    .update(rawBody)
    .digest();

  return timingSafeEqual(expected, received);
}

export function normalizeMonimeEnvelope(envelope) {
  const descriptor = envelope?.event;
  const object = envelope?.object;
  const normalized = {
    id: descriptor?.id,
    type: descriptor?.name,
    timestamp: descriptor?.timestamp,
    object,
    data: envelope?.data,
  };

  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !EVENT_ID.test(normalized.id || '') ||
    typeof normalized.type !== 'string' ||
    !EVENT_TYPE.test(normalized.type) ||
    !object ||
    typeof object.id !== 'string' ||
    !OBJECT_ID.test(object.id) ||
    typeof object.type !== 'string' ||
    !OBJECT_TYPE.test(object.type) ||
    !normalized.data ||
    typeof normalized.data !== 'object' ||
    Array.isArray(normalized.data)
  ) {
    throw new Error('Invalid Monime webhook envelope.');
  }

  return normalized;
}

export async function readMonimeRawBody(req, maxBytes = MONIME_WEBHOOK_MAX_BYTES) {
  const supplied = req?.rawBody ?? req?.body;
  if (Buffer.isBuffer(supplied)) {
    if (supplied.length > maxBytes) throw new Error('Webhook body too large.');
    return supplied;
  }
  if (typeof supplied === 'string') {
    const body = Buffer.from(supplied, 'utf8');
    if (body.length > maxBytes) throw new Error('Webhook body too large.');
    return body;
  }
  if (supplied !== undefined && supplied !== null) {
    throw new Error('Raw webhook body is unavailable.');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > maxBytes) throw new Error('Webhook body too large.');
    chunks.push(part);
  }
  return Buffer.concat(chunks, size);
}
