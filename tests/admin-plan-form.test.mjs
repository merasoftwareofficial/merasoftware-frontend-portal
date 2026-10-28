import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Load the browser-only, dependency-free adapter as ESM without changing CRA's package type.
const source = await readFile(new URL('../src/helpers/adminPlanForm.js', import.meta.url), 'utf8');
const { blankPlanForm, formFromPlan, planBody } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const require = createRequire(import.meta.url);
const { previewPlan } = require('../../backend/helpers/servicePlanCatalogue');
const { quoteServicePlan } = require('../../backend/helpers/servicePlanPricing');

test('portal fixed form is accepted by backend preview and quotes monthly and quarterly allowances', async () => {
  const body = planBody({ ...blankPlanForm(), serviceName: 'Starter', monthlyReferencePrice: 1490,
    billing: { ...blankPlanForm().billing, quarterly: { on: true, discountPercent: 3 } } });
  const plan = await previewPlan(body);
  const monthly = quoteServicePlan(plan, { purchase: 'monthly', tenureMonths: 1 });
  const quarterly = quoteServicePlan(plan, { purchase: 'quarterly', tenureMonths: 3 });
  assert.equal(monthly.firstPayment, 1490);
  assert.equal(quarterly.firstPayment, 4336);
  assert.equal(quarterly.allowancePerCycle, 3);
});

test('flexible form uses backend slab pricing and rejects an off-step preview', async () => {
  const body = planBody({ ...blankPlanForm(), serviceName: 'Flexible', pricingMode: 'flexible',
    filesMin: 5, filesMax: 50, filesStep: 5, ratePerFile: 100,
    slabs: [{ fromFile: 11, ratePerFile: 50 }], allowOneTime: true });
  const plan = await previewPlan(body);
  assert.equal(quoteServicePlan(plan, { purchase: 'one_time', files: 20, updates: 2 }).firstPayment, 3000);
  assert.throws(() => quoteServicePlan(plan, { purchase: 'one_time', files: 6, updates: 1 }), error => error.statusCode === 400);
  assert.equal(body.limitScope, undefined);
});

test('no-upload form omits upload limits; edit carries revision and duplicate becomes a new hidden plan', async () => {
  const body = planBody({ ...blankPlanForm(), serviceName: 'Live Chat', capability: 'send_reminders',
    purchaseType: 'one_time', oneTimePrice: 2500, dependency: 'standalone_only' });
  const plan = await previewPlan(body);
  assert.equal(quoteServicePlan(plan, { purchase: 'one_time' }).firstPayment, 2500);
  assert.equal(body.filesLimit, undefined);
  const form = formFromPlan({ ...plan, _id: 'saved', description: '', updatedAt: '2026-10-28T00:00:00.000Z' });
  assert.equal(planBody(form).expectedUpdatedAt, '2026-10-28T00:00:00.000Z');
  const copy = planBody({ ...form, planId: '', isHidden: true });
  assert.equal(copy.creating, true);
  assert.equal(copy.planId, undefined);
  assert.equal(copy.expectedUpdatedAt, undefined);
  assert.equal(copy.isHidden, true);
});
