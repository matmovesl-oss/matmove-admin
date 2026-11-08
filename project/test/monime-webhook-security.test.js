import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { readMonimeRawBody, verifyMonimeSignature } from '../server/monime-webhook-security.js';

const secret = 'test-only-monime-webhook-secret';
const now = 1794168000;

function signedHeader(body, timestamp = now, signingSecret = secret) {
  const signature = createHmac('sha256', signingSecret)
    .update(String(timestamp) + '_', 'utf8')
    .update(body)
    .digest('base64');
  return `t=${timestamp},v1=${signature}`;
}

test('accepts an authentic Monime HMAC signature over the exact raw body', () => {
  const body = Buffer.from('{"id":"wke-test-1","type":"payment.completed","data":{}}');
  assert.equal(verifyMonimeSignature(body, signedHeader(body), secret, now), true);
});

test('rejects a modified payload', () => {
  const signed = Buffer.from('{"id":"wke-test-1"}');
  const modified = Buffer.from('{"id":"wke-test-2"}');
  assert.equal(verifyMonimeSignature(modified, signedHeader(signed), secret, now), false);
});

test('rejects an invalid signature and missing secret', () => {
  const body = Buffer.from('{"ok":true}');
  const header = signedHeader(body);
  assert.equal(verifyMonimeSignature(body, header.replace(/.$/, 'A'), secret, now), false);
  assert.equal(verifyMonimeSignature(body, header, '', now), false);
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

test('reads raw request bytes without JSON re-serialization', async () => {
  const raw = Buffer.from('{ "x" : 1 }');
  const body = await readMonimeRawBody(Readable.from([raw.subarray(0, 4), raw.subarray(4)]));
  assert.deepEqual(body, raw);
});

test('rejects an oversized body', async () => {
  await assert.rejects(
    readMonimeRawBody(Readable.from([Buffer.alloc(8)]), 7),
    /too large/i
  );
});
