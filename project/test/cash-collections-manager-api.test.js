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
      if (table === 'matmove_cash_ride_settings') {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({data:{enabled:false,provider_environment:'test'},error:null}); }
        };
      }
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
  assert.equal(res.body.cashEnabled,false);
  assert.equal(res.body.providerEnvironment,'test');
});

test('cash collections endpoint fails closed when its production schema is absent', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>({
      client:{
        from(table){
          if(table==='matmove_cash_ride_settings')return{
            select(){return this;},eq(){return this;},
            maybeSingle(){return Promise.resolve({data:{enabled:false,provider_environment:'test'},error:null});}
          };
          return{
            select(){return this;},order(){return this;},
            limit(){return Promise.resolve({data:null,error:{code:'42P01'}});}
          };
        }
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


test('cash collections includes rider, driver and sanitized audit visibility', async () => {
  const bookingId='11111111-1111-4111-8111-111111111111';
  const riderId='22222222-2222-4222-8222-222222222222';
  const driverId='33333333-3333-4333-8333-333333333333';
  const client={
    from(table){
      if(table==='matmove_cash_ride_settings')return{
        select(){return this;},eq(){return this;},
        maybeSingle(){return Promise.resolve({data:{enabled:true,provider_environment:'test'},error:null});}
      };
      if(table==='matmove_cash_ride_payments')return{
        select(){return this;},order(){return this;},
        limit(){return Promise.resolve({data:[{
          booking_id:bookingId,rider_id:riderId,driver_id:driverId,
          fare_minor:10000,driver_cash_minor:8500,matmove_fee_minor:1500,
          currency:'SLE',status:'settled',
          driver_cash_confirmed_at:'2026-11-12T10:00:00Z',
          rider_cash_confirmed_at:'2026-11-12T10:01:00Z',
          created_at:'2026-11-12T09:00:00Z',updated_at:'2026-11-12T10:02:00Z'
        }],error:null});}
      };
      if(table==='profiles')return{
        select(){return this;},in(){return Promise.resolve({data:[
          {id:riderId,first_name:'Rider',last_name:'One',full_name:'Rider One',phone:'+232761234567',role:'rider'},
          {id:driverId,first_name:'Driver',last_name:'Two',full_name:'Driver Two',phone:'+232991234567',role:'driver'}
        ],error:null});}
      };
      if(table==='matmove_cash_ride_audit_events')return{
        select(){return this;},in(){return this;},order(){return this;},
        limit(){return Promise.resolve({data:[{
          booking_id:bookingId,event_type:'capture_verified',actor_type:'system',
          actor_profile_id:null,details:{legKind:'capture',reasonCode:'should_not_leak',secret:'do-not-return'},
          created_at:'2026-11-12T10:02:00Z'
        }],error:null});}
      };
      if(table==='matmove_cash_ride_legs')return{
        select(){return this;},in(){return Promise.resolve({data:[
          {booking_id:bookingId,leg_kind:'reserve',amount_minor:1500,currency:'SLE',status:'completed',provider_transfer_id:'trf-reserve',verified_at:'2026-11-12T09:01:00Z',error_code:null},
          {booking_id:bookingId,leg_kind:'capture',amount_minor:1500,currency:'SLE',status:'completed',provider_transfer_id:'trf-capture',verified_at:'2026-11-12T10:02:00Z',error_code:null}
        ],error:null});}
      };
      throw new Error('Unexpected table '+table);
    }
  };
  const handler=createHandler({requireAdminFn:async()=>({client,user:{id:'staff-1'}})});
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,200);
  const row=res.body.records[0];
  assert.equal(row.rider.name,'Rider One');
  assert.equal(row.driver.name,'Driver Two');
  assert.equal(row.rider.phoneLastFour,'4567');
  assert.equal(row.driver.phoneLastFour,'4567');
  assert.equal(row.auditEvents[0].eventType,'capture_verified');
  assert.equal(row.auditEvents[0].actorName,'System');
  assert.equal(Object.hasOwn(row.auditEvents[0],'secret'),false);
  assert.equal(Object.hasOwn(row.rider,'phone'),false);
});
