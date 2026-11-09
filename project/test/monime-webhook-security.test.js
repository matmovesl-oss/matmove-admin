import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import {
  normalizeMonimeEnvelope,
  readMonimeRawBody,
  verifyMonimeSignature,
} from '../server/monime-webhook-security.js';

const secret = 'monime-test-secret-1234567890123456';
const now = 1794168000;

function signedHeader(body, timestamp = now, signingSecret = secret) {
  const signature = createHmac('sha256', signingSecret)
    .update(String(timestamp) + '_', 'utf8')
    .update(body)
    .digest('base64');
  return `t=${timestamp},v1=${signature}`;
}

test('accepts an authentic Monime HMAC signature over the exact raw body', () => {
  const body = Buffer.from('{"event":{"id":"wke-test-1","name":"payment.completed","timestamp":"2026-11-08T20:00:00Z"},"object":{"id":"pay-test-1","type":"payment"},"data":{}}');
  assert.equal(verifyMonimeSignature(body, signedHeader(body), secret, now), true);
});

test('rejects a modified payload', () => {
  const signed = Buffer.from('{"event":{"id":"wke-test-1"}}');
  const modified = Buffer.from('{"event":{"id":"wke-test-2"}}');
  assert.equal(verifyMonimeSignature(modified, signedHeader(signed), secret, now), false);
});

test('rejects invalid signature and invalid secret length', () => {
  const body = Buffer.from('{"ok":true}');
  const header = signedHeader(body);
  assert.equal(verifyMonimeSignature(body, header.replace(/.$/, 'A'), secret, now), false);
  assert.equal(verifyMonimeSignature(body, header, 'too-short', now), false);
});

test('rejects timestamps outside Monime tolerance', () => {
  const body = Buffer.from('{}');
  assert.equal(verifyMonimeSignature(body, signedHeader(body, now - 301), secret, now), false);
  assert.equal(verifyMonimeSignature(body, signedHeader(body, now + 61), secret, now), false);
});

test('accepts timestamps at the configured boundaries', () => {
  const body = Buffer.from('{}');
  assert.equal(verifyMonimeSignature(body, signedHeader(body, now - 300), secret, now), true);
  assert.equal(verifyMonimeSignature(body, signedHeader(body, now + 60), secret, now), true);
});

test('rejects malformed signature headers', () => {
  const body = Buffer.from('{}');
  for (const header of ['', 'v1=abc', 't=bad,v1=abc', 't=1794168000,v1=***']) {
    assert.equal(verifyMonimeSignature(body, header, secret, now), false);
  }
});

test('normalizes the official Monime event envelope', () => {
  const event = normalizeMonimeEnvelope({
    apiVersion: 'caph.2025-08-23',
    event: { id: 'wke-test-2', name: 'payment.completed', timestamp: '2026-11-08T20:00:00Z' },
    object: { id: 'pay-test-1', type: 'payment' },
    data: { id: 'pay-test-1' },
  });
  assert.equal(event.id, 'wke-test-2');
  assert.equal(event.type, 'payment.completed');
  assert.equal(event.data.id, 'pay-test-1');
});

test('rejects malformed Monime envelopes', () => {
  assert.throws(() => normalizeMonimeEnvelope({ id: 'wke-legacy', type: 'payment.completed', data: {} }));
  assert.throws(() => normalizeMonimeEnvelope({ event: { id: 'bad', name: 'payment.completed' }, object: { id: 'x', type: 'payment' }, data: {} }));
});

test('reads raw request bytes without JSON re-serialization', async () => {
  const raw = Buffer.from('{ "x" : 1 }');
  const body = await readMonimeRawBody(Readable.from([raw.subarray(0, 4), raw.subarray(4)]));
  assert.deepEqual(body, raw);
});

test('rejects an oversized body', async () => {
  await assert.rejects(readMonimeRawBody(Readable.from([Buffer.alloc(8)]), 7), /too large/i);
});


test('admin webhook worker has an explicit runtime cap and bounded batch size', async () => {
  const source = await readFile(
    new URL('../api/monime-webhook.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /maxDuration:\s*60/);
  assert.match(source, /processAdminMonimeWebhookBatch\(\{\s*limit:\s*3\s*\}\)/);
});
