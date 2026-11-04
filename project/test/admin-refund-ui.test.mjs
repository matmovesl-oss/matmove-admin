import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Customer Refunds is refund-only and never exposes the Pay Staff action', async () => {
  const source = await readFile(new URL('../src/pages/SpecialOperationsPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /title="Customer Refunds"/);
  assert.match(source, /fetch\('\/api\/admin-refund'/);
  assert.doesNotMatch(source, /Pay Staff|pay staff|admin-pay-staff|Administrative Payroll/);
});
