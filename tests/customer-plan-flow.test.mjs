import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async (path, transform = value => value) => {
  const source = transform(await readFile(new URL(path, import.meta.url), 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const auth = await load('../src/helpers/planAuthReturn.js');
const { planGroups, planBenefit } = await load('../src/helpers/customerPlanCatalogue.js', source => source.replace("import SummaryApi from '../common';", 'const SummaryApi = {};'));
const { canBuyOnSurface, SURFACE } = await load('../src/helpers/serviceDependency.js');
const { initialPlanChoice } = await load('../src/helpers/serviceTenure.js');
const planPath = '/service-plan-detail/6a90417d77eae0db8156833d';

test('a plan address may carry the website choice through login, nothing else', () => {
  const chosen = `${planPath}?purchase=quarterly&months=6&files=20&updates=2&release=monthly`;
  assert.equal(auth.customerReturnTarget(chosen), chosen);
  assert.equal(auth.planLoginUrl(chosen), `/login?next=${encodeURIComponent(chosen)}`);
  assert.equal(auth.loginContinuation({ role: 'customer', returnTo: chosen, home: '/dashboard' }), chosen);
  assert.equal(auth.passwordContinuation(chosen, 'customer', 'https://www.merasoftware.com').internal, chosen);
  for (const bad of [`${planPath}?purchase=weekly`, `${planPath}?files=20&files=30`, `${planPath}?months=13`, `${planPath}?files=0`,
    `${planPath}?purchase=monthly&x=1`, `${planPath}?purchase=monthly#x`, `${planPath}?purchase=monthly?x`, `${planPath}?`, `${planPath}?files=%32%30`]) {
    assert.equal(auth.customerReturnTarget(bad), null, bad);
  }
  // A protected page keeps the plan even when its query is not allowed.
  assert.equal(auth.protectedLoginUrl({ pathname: planPath, search: '?purchase=quarterly&months=6' }), `/login?next=${encodeURIComponent(`${planPath}?purchase=quarterly&months=6`)}`);
  assert.equal(auth.protectedLoginUrl({ pathname: planPath, search: '?next=https://evil.test' }), `/login?next=${encodeURIComponent(planPath)}`);
  assert.equal(auth.protectedLoginUrl({ pathname: '/dashboard', search: '' }), '/login');
});

test('the builder starts on the address choice only where the plan offers it', () => {
  const flexible = { servicePlan: { pricingMode: 'flexible', allowOneTime: true, files: { min: 5, max: 100, step: 5 }, updatesPerMonth: { min: 1, max: 4 },
    maxTenureMonths: 12, customerCanChooseRelease: true, billingOptions: [{ billingCycle: 'monthly' }, { billingCycle: 'quarterly', discountPercent: 5 }] } };
  assert.deepEqual(initialPlanChoice(flexible, '?purchase=quarterly&months=6&files=20&updates=2&release=monthly'),
    { purchase: 'quarterly', tenureMonths: 6, files: 20, updates: 2, releaseMode: 'monthly' });
  // Off-step files, a length that is not a whole number of quarters, too many updates: defaults.
  assert.deepEqual(initialPlanChoice(flexible, '?purchase=quarterly&months=4&files=22&updates=9&release=sometimes'),
    { purchase: 'quarterly', tenureMonths: 3, files: 5, updates: 1, releaseMode: 'all_at_once' });
  // Monthly billing cannot choose a release; an unknown purchase falls back to the first one.
  assert.equal(initialPlanChoice(flexible, '?purchase=monthly&release=monthly').releaseMode, 'all_at_once');
  assert.equal(initialPlanChoice(flexible, '?purchase=yearly').purchase, 'one_time');
  assert.deepEqual(initialPlanChoice(flexible, ''), { purchase: 'one_time', tenureMonths: null, files: 5, updates: 1, releaseMode: 'all_at_once' });
  assert.equal(initialPlanChoice({ servicePlan: {} }, '?purchase=monthly'), null);
});

test('normal and guest login continuation preserves selected plan and password-reset round trip', () => {
  assert.equal(auth.planLoginUrl(planPath), `/login?next=${encodeURIComponent(planPath)}`);
  const direct = auth.loginContinuation({ role: 'customer', returnTo: planPath, home: '/dashboard' });
  assert.equal(direct, planPath);
  const reset = auth.loginContinuation({ role: 'customer', mustResetPassword: true, returnTo: planPath, home: '/dashboard' });
  const next = new URLSearchParams(reset.split('?')[1]).get('next');
  // Password save and skip share the same destination helper.
  assert.deepEqual(auth.passwordContinuation(next, 'customer', 'https://www.merasoftware.com'), { internal: planPath, external: null });
  assert.equal(auth.loginContinuation({ role: 'admin', returnTo: planPath, home: '/admin-panel/dashboard' }), '/admin-panel/dashboard');
});

test('untrusted next destinations cannot redirect out of the scoped customer flow', () => {
  for (const value of [null, '//evil.test', 'https://evil.test', '/\\evil.test', '/admin-panel/dashboard', `${planPath}?next=https://evil.test`, '/service-plan-detail/not-an-id', '/service-plan-detail/%2f%2fevil.test', '/my-offers#evil']) {
    assert.equal(auth.customerReturnTarget(value), null, String(value));
    assert.equal(auth.planLoginUrl(value), '/login');
  }
});

test('offer return policy and role homes are preserved', () => {
  assert.equal(auth.customerReturnTarget('/my-offers'), '/my-offers');
  assert.equal(auth.loginContinuation({ role: 'customer', returnTo: '/my-offers', home: '/dashboard' }), '/my-offers');
  const website = 'https://www.merasoftware.com';
  for (const path of ['/offer/summer-plan', '/account/offers']) {
    assert.equal(auth.passwordContinuation(website + path, 'customer', website).external, website + path);
  }
  for (const value of ['https://evil.test/offer/test', `${website}/offer/test?next=bad`, `${website}/admin`, `https://user@www.merasoftware.com/offer/test`]) {
    assert.equal(auth.passwordContinuation(value, 'customer', website).external, null);
  }
  assert.equal(auth.passwordContinuation(planPath, 'admin', website).internal, null);
});

test('category sections use configured order, exclude project-only standalone sales and retain uncategorized plans', () => {
  const fixed = { _id: 'fixed', servicePlan: { categoryKey: 'updates', dependency: 'standalone_or_project', capability: 'upload_data', portalAccessCount: 1, limitScope: 'per_month', filesLimit: 20 } };
  const project = { _id: 'project', servicePlan: { categoryKey: 'updates', dependency: 'project_required' } };
  const old = { _id: 'old', servicePlan: { categoryKey: 'archived', capability: 'send_reminders' } };
  const groups = planGroups([fixed, project, old].filter(plan => canBuyOnSurface(plan, SURFACE.STANDALONE)), [{ key: 'updates', label: 'Updates', sortOrder: 2 }, { key: 'empty', label: 'Empty', sortOrder: 1 }]);
  assert.deepEqual(groups.map(group => group.label), ['Updates', 'More plans']);
  assert.deepEqual(groups[0].plans.map(plan => plan._id), ['fixed']);
  assert.deepEqual(groups[1].plans.map(plan => plan._id), ['old']);
  assert.match(planBenefit(fixed), /1 update per month/);
  assert.match(planBenefit(old), /No file uploads/);
});
