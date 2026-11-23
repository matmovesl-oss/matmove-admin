import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/CustomerSupportPage.tsx', import.meta.url), 'utf8');

test('support conversation polling does not trigger a second inbox refresh', () => {
  const match = source.match(/const loadMessages=useCallback\\(async\\(id:string\\)=>\\{([\\s\\S]*?)\\},\\[\\]\\);/);
  assert.ok(match, 'loadMessages should be an independent callback');
  assert.doesNotMatch(match[1], /\\bloadTickets\\s*\\(/);
  assert.match(source, /if\\(document\\.visibilityState==='visible'\\)\\{void loadTickets\\(\\);if\\(selected\\)void loadMessages\\(selected\\);\\}/);
});

test('a successful admin reply refreshes the conversation and inbox explicitly', () => {
  assert.match(source, /await Promise\\.all\\(\\[loadMessages\\(selected\\),loadTickets\\(\\)\\]\\)/);
});

test('late responses cannot replace a newer selected support conversation', () => {
  assert.match(source, /const ticketRequest=useRef\\(0\\),messageRequest=useRef\\(0\\)/);
  assert.match(source, /if\\(request===messageRequest\\.current\\)setMessages\\(data\\.messages as Message\\[\\]\\)/);
  assert.match(source, /if\\(request===ticketRequest\\.current\\)setTickets\\(data\\.items as Ticket\\[\\]\\)/);
});
