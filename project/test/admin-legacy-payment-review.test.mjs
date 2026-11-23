import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../api/get-all-transactions.js';

const actor = { id: '11111111-1111-4111-8111-111111111111' };

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k,v) { this.headers[k]=v; },
    status(code) { this.statusCode=code; return this; },
    json(body) { this.body=body; return this; }
  };
}

function makeClient() {
  const calls=[];
  const results={
    matmove_admin_monime_webhook_events:{data:[],error:null},
    payment_transactions:{topups:{data:[{
      id:'pt-legacy-1',provider_reference:'checkout-session-old-1',amount:1,currency:'SLE',
      status:'pending',initiated_at:'2026-09-12T13:45:14Z',updated_at:'2026-09-16T12:06:32Z',
      user_id:'must-not-leave-server',wallet_id:'must-not-leave-server'
    }],error:null},links:{data:[],error:null}},
    withdrawal_requests:{data:[{
      id:'wr-legacy-1',reference_code:'WD-OLD-1',amount:1,currency:'SLE',status:'pending',
      provider:'monime',payment_transaction_id:null,created_at:'2026-09-20T09:00:00Z',
      updated_at:'2026-09-20T09:00:00Z',user_id:'must-not-leave-server',phone:'must-not-leave-server'
    }],error:null},
    ledger_transactions:{data:[],error:null}
  };
  const client={
    from(table) {
      const q={table,filters:[],columns:'',select(v){this.columns=v;return this;},
        eq(k,v){this.filters.push(['eq',k,v]);return this;},
        in(k,v){this.filters.push(['in',k,v]);return this;},
        order(k,v){this.sort=[k,v];return this;},limit(v){this.maxRows=v;return this;},
        then(resolve,reject) {
          calls.push({table:this.table,columns:this.columns,filters:this.filters,sort:this.sort,maxRows:this.maxRows});
          let result=results[this.table]||{data:[],error:null};
          if(this.table==='payment_transactions') {
            result=this.filters.some(x=>x[1]==='id')?results.payment_transactions.links:results.payment_transactions.topups;
          }
          return Promise.resolve(result).then(resolve,reject);
        }};
      return q;
    }
  };
  return {client,calls,results};
}

const env={MONIME_API_KEY:'unit-test-key',MONIME_SPACE_ID:'unit-test-space'};
const fetcher=async url=>{
  assert.equal(String(url),'https://api.monime.io/v1/financial-transactions?limit=50');
  return {ok:true,json:async()=>({result:[{id:'gateway-1',type:'credit'}]})};
};

test('legacy pending Monime items are exposed as read-only safe metadata', async()=>{
  const {client,calls}=makeClient();
  const handler=createHandler({
    requireAdminFn:async()=>({client,user:actor}),
    fetcher,env
  });
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer test'},query:{}},res);

  assert.equal(res.statusCode,200);
  assert.equal(res.body.legacyMoneyReviewAvailable,true);
  assert.equal(res.body.legacyMoneyReview.topups.length,1);
  assert.equal(res.body.legacyMoneyReview.topups[0].providerReference,'checkout-session-old-1');
  assert.equal(res.body.legacyMoneyReview.topups[0].ledgerRecorded,false);
  assert.equal(res.body.legacyMoneyReview.withdrawals[0].linkedPaymentExists,false);
  assert.equal(calls.some(x=>x.table==='ledger_transactions'&&x.filters.some(f=>f[0]==='in'&&f[1]==='payment_transaction_id')),true);
  const serialised=JSON.stringify(res.body);
  assert.doesNotMatch(serialised,/must-not-leave-server|user_id|wallet_id|phone/);
  assert.equal(res.body.transactions[0].id,'gateway-1');
});

test('ledger-present historical items are flagged for investigation rather than settlement', async()=>{
  const {client,results}=makeClient();
  results.ledger_transactions.data=[{payment_transaction_id:'pt-legacy-1'}];
  results.payment_transactions.links.data=[{id:'pt-linked-1'}];
  results.withdrawal_requests.data[0].payment_transaction_id='pt-linked-1';
  const handler=createHandler({requireAdminFn:async()=>({client,user:actor}),fetcher,env});
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer test'},query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.legacyMoneyReview.topups[0].ledgerRecorded,true);
  assert.equal(res.body.legacyMoneyReview.withdrawals[0].linkedPaymentExists,true);
});

test('legacy review failure is reported without hiding live gateway results', async()=>{
  const {client,results}=makeClient();
  results.payment_transactions.topups.error={code:'42P01',message:'table unavailable'};
  const handler=createHandler({requireAdminFn:async()=>({client,user:actor}),fetcher,env});
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer test'},query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.transactions.length,1);
  assert.equal(res.body.legacyMoneyReviewAvailable,false);
  assert.deepEqual(res.body.legacyMoneyReview,{topups:[],withdrawals:[]});
  assert.match(res.body.legacyMoneyReviewError,/could not be verified/i);
});

test('Admin legacy reconciliation UI never offers a funds-moving action', async()=>{
  const source=await readFile(new URL('../src/pages/TransactionsPage.tsx',import.meta.url),'utf8');
  assert.match(source,/Historical Monime records — read-only review/);
  assert.match(source,/No wallet ledger entry — provider confirmation required/);
  assert.match(source,/Missing linked payment — investigate manually/);
  assert.match(source,/does not settle, refund, retry, or change wallet balances/i);
  assert.doesNotMatch(source,/settle-legacy|refund-legacy|retry-legacy/);
});
