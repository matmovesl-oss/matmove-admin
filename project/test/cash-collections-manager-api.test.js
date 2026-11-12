import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/get-all-transactions.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key,value) { this.headers[key]=value; },
    status(code) { this.statusCode=code; return this; },
    json(value) { this.body=value; return this; }
  };
}

function emptyClient() {
  return {
    from(table) {
      assert.equal(table,'matmove_cash_ride_payments');
      return {
        select() { return this; },
        order() { return this; },
        limit() { return Promise.resolve({data:[],error:null}); }
      };
    }
  };
}

test('cash collections endpoint requires the Financials assignment', async () => {
  let required=[];
  const handler=createHandler({
    requireAdminFn:async (_req,keys)=>{required=keys;return {client:emptyClient(),user:{id:'staff-1'}};},
    fetcher:async()=>{throw new Error('Monime fetch must not run for the cash report');}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.deepEqual(required,['financials']);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.available,true);
  assert.deepEqual(res.body.records,[]);
  assert.equal(res.body.summary.recordCount,0);
});

test('cash collections endpoint fails closed when its production schema is absent', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>({
      client:{
        from(){return{
          select(){return this;},
          order(){return this;},
          limit(){return Promise.resolve({data:null,error:{code:'42P01'}});}
        };}
      },
      user:{id:'staff-1'}
    }),
    fetcher:async()=>{throw new Error('Monime fetch must not run for the cash report');}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.available,false);
  assert.match(res.body.error,/Production cash collection remains disabled/i);
});

test('cash collections endpoint does not disclose data if Admin authorization fails', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>{throw Object.assign(new Error('Access denied'),{status:403});},
    fetcher:async()=>{throw new Error('Monime fetch must not run for the cash report');}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'Access denied');
});

test('cash collections view is read-only and GET-only', async () => {
  let authCalls=0;
  const handler=createHandler({
    requireAdminFn:async()=>{authCalls++;return {client:emptyClient(),user:{id:'staff-1'}};}
  });
  const res=response();
  await handler({method:'POST',query:{view:'cash-collections'},headers:{},body:{}},res);
  assert.equal(res.statusCode,405);
  assert.equal(authCalls,0);
});
