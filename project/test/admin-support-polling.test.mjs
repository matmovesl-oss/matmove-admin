import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/CustomerSupportPage.tsx', import.meta.url), 'utf8');

test('support conversation polling does not trigger a second inbox refresh', () => {
  const start = source.indexOf('const loadMessages=useCallback(async(id:string)=>{');
  const end = source.indexOf('\n },[]);', start);
  assert.ok(start >= 0 && end > start, 'loadMessages should be an independent callback');
  const callback = source.slice(start, end);
  assert.equal(callback.includes('loadTickets'), false);
  assert.ok(source.includes("if(document.visibilityState==='visible'){void loadTickets();if(selected)void loadMessages(selected);}"));
});

test('a successful admin reply refreshes the conversation and inbox explicitly', () => {
  assert.ok(source.includes('await Promise.all([loadMessages(selected),loadTickets()])'));
});

test('late responses cannot replace a newer selected support conversation', () => {
  assert.ok(source.includes('const ticketRequest=useRef(0),messageRequest=useRef(0)'));
  assert.ok(source.includes('if(request===messageRequest.current)setMessages(data.messages as Message[])'));
  assert.ok(source.includes('if(request===ticketRequest.current)setTickets(data.items as Ticket[])'));
});
