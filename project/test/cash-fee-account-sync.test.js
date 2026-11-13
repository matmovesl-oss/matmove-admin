import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/get-all-transactions.js';
import { readFile } from 'node:fs/promises';

function response() {
  return { statusCode:200, setHeader(){}, status(code){this.statusCode=code;return this;}, json(value){this.body=value;return this;} };
}
function clientWithSettings(settings) {
  return { from(table) {
    if (table === 'matmove_cash_ride_settings') return {
      select(){return this;}, eq(){return this;},
      maybeSingle(){return Promise.resolve({data:settings,error:null});}
    };
    assert.equal(table,'matmove_cash_ride_payments');
    return {select(){return this;},order(){return this;},limit(){return Promise.resolve({data:[],error:null});}};
  }};
}
test('Admin reports cash active only when shared revenue account matches its deployment and hold account is separate', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>({client:clientWithSettings({
      enabled:true,provider_environment:'live',
      fee_hold_account_id:'fac-hold123456',
      fee_revenue_account_id:'fac-revenue654321'
    }),user:{id:'finance-admin'}}),
    env:{MONIME_ESCROW_ACCOUNT_ID:'fac-hold123456',MONIME_PLATFORM_FEE_ACCOUNT_ID:'fac-revenue654321'}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.cashEnabled,true);
  assert.equal(res.body.feeAccounts.escrowMatchesDeployment,true);
  assert.equal(res.body.feeAccounts.revenueMatchesDeployment,true);
  assert.equal(res.body.feeAccounts.holdingAccount,'fac-ho…3456');
  assert.equal(res.body.feeAccounts.revenueAccount,'fac-re…4321');
});
test('Admin fails closed when deployment fee account differs from the shared Supabase setting', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>({client:clientWithSettings({
      enabled:true,provider_environment:'live',
      fee_hold_account_id:'fac-hold123456',
      fee_revenue_account_id:'fac-revenue654321'
    }),user:{id:'finance-admin'}}),
    env:{MONIME_ESCROW_ACCOUNT_ID:'fac-hold123456',MONIME_PLATFORM_FEE_ACCOUNT_ID:'fac-other111111'}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.configuredEnabled,true);
  assert.equal(res.body.cashEnabled,false);
  assert.equal(res.body.feeAccounts.revenueMatchesDeployment,false);
});
test('Admin fails closed when the deployed escrow account differs from the shared holding account', async () => {
  const handler=createHandler({
    requireAdminFn:async()=>({client:clientWithSettings({
      enabled:true,provider_environment:'live',
      fee_hold_account_id:'fac-hold123456',
      fee_revenue_account_id:'fac-revenue654321'
    }),user:{id:'finance-admin'}}),
    env:{MONIME_ESCROW_ACCOUNT_ID:'fac-other111111',MONIME_PLATFORM_FEE_ACCOUNT_ID:'fac-revenue654321'}
  });
  const res=response();
  await handler({method:'GET',query:{view:'cash-collections'},headers:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.cashEnabled,false);
  assert.equal(res.body.feeAccounts.escrowMatchesDeployment,false);
});

test('Admin cash panel shows both account roles and their deployment match', async () => {
  const ui=await readFile(new URL('../src/components/CashCollectionsManager.tsx',import.meta.url),'utf8');
  assert.match(ui,/Restricted holding account/);
  assert.match(ui,/Final MatMove fee account/);
  assert.match(ui,/Admin \/ deployment match/);
  assert.match(ui,/revenueMatchesDeployment/);
});
