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
const tenureSource = await readFile(new URL('../src/helpers/serviceTenure.js', import.meta.url), 'utf8');
const { initialPlanChoice, planChoiceBody, planChoiceQuery } = await load('../src/helpers/serviceTenure.js');
// planCheckout.js imports serviceTenure.js; the data-URL loader hands it the same source as a data URL.
const checkout = await load('../src/helpers/planCheckout.js', source => source.replace("from './serviceTenure';", `from 'data:text/javascript;base64,${Buffer.from(tenureSource).toString('base64')}';`));
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

const planId = '6a90417d77eae0db8156833d';
test('the checkout address carries the choice and where the client came from, through login', () => {
  const chosen = `/checkout/${planId}?purchase=quarterly&months=6&files=20&updates=2&release=monthly&from=website`;
  assert.equal(auth.customerReturnTarget(chosen), chosen);
  assert.equal(auth.loginContinuation({ role: 'customer', returnTo: chosen, home: '/dashboard' }), chosen);
  const done = '/checkout/done/' + 'a'.repeat(24) + '?from=portal';
  assert.equal(auth.customerReturnTarget(done), done);
  for (const bad of ['/checkout/' + planId + '?from=https://evil.test', '/checkout/' + planId + '?from=website&from=portal', '/checkout/' + planId + '?next=x',
    '/checkout/done/' + 'a'.repeat(24) + '?purchase=monthly', '/checkout/not-an-id', '/checkout/' + planId + '?from=website?x', planPath + '?from=website']) {
    assert.equal(auth.customerReturnTarget(bad), null, bad);
  }
});

test('builder and checkout send the same body for a choice, and its address reads back the same choice', () => {
  const flexible = { servicePlan: { pricingMode: 'flexible', allowOneTime: true, files: { min: 5, max: 100, step: 5 }, updatesPerMonth: { min: 1, max: 4 },
    maxTenureMonths: 12, customerCanChooseRelease: true, billingOptions: [{ billingCycle: 'monthly' }, { billingCycle: 'quarterly', discountPercent: 5 }] } };
  const choice = { purchase: 'quarterly', tenureMonths: 6, files: 20, updates: 2, releaseMode: 'monthly' };
  const body = planChoiceBody(flexible, choice);
  assert.deepEqual(body, choice);
  assert.equal(planChoiceQuery(body), 'purchase=quarterly&months=6&files=20&updates=2&release=monthly');
  assert.deepEqual(planChoiceBody(flexible, initialPlanChoice(flexible, '?' + planChoiceQuery(body))), body);
  // Only the parts a purchase uses: one-time has no length; monthly cannot choose a release; a fixed plan has no files.
  assert.deepEqual(planChoiceBody(flexible, { ...choice, purchase: 'one_time' }), { purchase: 'one_time', tenureMonths: undefined, files: 20, updates: 2, releaseMode: undefined });
  assert.equal(planChoiceBody(flexible, { ...choice, purchase: 'monthly' }).releaseMode, undefined);
  assert.deepEqual(planChoiceBody({ servicePlan: { purchaseType: 'one_time' } }, { purchase: 'one_time', files: 9, updates: 9 }),
    { purchase: 'one_time', tenureMonths: undefined, files: undefined, updates: undefined, releaseMode: undefined });
  assert.equal(planChoiceBody(flexible, { purchase: '' }), null);
});

test('checkout: origin is one of two words; Change and the result go back to where the client came from', () => {
  const website = 'https://www.merasoftware.com';
  assert.equal(checkout.checkoutOrigin('?from=website'), 'website');
  for (const search of ['?from=portal', '', '?from=https://evil.test', '?from=WEBSITE']) assert.equal(checkout.checkoutOrigin(search), 'portal');
  const body = { purchase: 'monthly', tenureMonths: 3 };
  assert.equal(checkout.checkoutPath(planId, body, 'portal'), '/checkout/' + planId + '?purchase=monthly&months=3&from=portal');
  assert.equal(checkout.checkoutChangeHref(planId, body, 'website', website), website + '/plans/' + planId + '?purchase=monthly&months=3');
  assert.equal(checkout.checkoutChangeHref(planId, body, 'portal', website), '/service-plan-detail/' + planId + '?purchase=monthly&months=3');
  const order = 'b'.repeat(24);
  assert.equal(checkout.checkoutDonePath(order, 'website'), '/checkout/done/' + order + '?from=website');
  const fromWebsite = checkout.checkoutNextSteps(order, 'website', website);
  assert.deepEqual([fromWebsite.next.href, fromWebsite.next.external], [website + '/account/purchases?new=' + order, true]);
  assert.deepEqual([fromWebsite.primary.href, fromWebsite.secondary.label], ['/plan-details/' + order, 'Back to website']);
  const fromPortal = checkout.checkoutNextSteps(order, 'portal', website);
  assert.deepEqual([fromPortal.next.href, fromPortal.next.external, fromPortal.secondary.label], ['/plan-details/' + order, false, 'Back to services']);
});

test('checkout: wallet first then UPI for the rest; 12-digit references; one purchase key per choice until bought', () => {
  assert.deepEqual(checkout.paymentSplit(1500, 5000), { total: 1500, wallet: 1500, upi: 0 });
  assert.deepEqual(checkout.paymentSplit(1500, 400), { total: 1500, wallet: 400, upi: 1100 });
  assert.deepEqual(checkout.paymentSplit(1500, undefined), { total: 1500, wallet: 0, upi: 1500 });
  assert.equal(checkout.isUpiReference(' 412345678901 '), true);
  for (const bad of ['41234567890', '4123456789O1', '', null]) assert.equal(checkout.isUpiReference(bad), false);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const first = checkout.purchaseKeyFor('plan?purchase=monthly|', storage);
  assert.match(first, /^[a-f\d-]{36}$/);
  assert.equal(checkout.purchaseKeyFor('plan?purchase=monthly|', storage), first, 'a reload keeps the key');
  assert.notEqual(checkout.purchaseKeyFor('plan?purchase=yearly|', storage), first, 'another choice gets its own key');
  checkout.forgetPurchaseKey('plan?purchase=monthly|', storage);
  assert.notEqual(checkout.purchaseKeyFor('plan?purchase=monthly|', storage), first, 'after buying, a new purchase gets a new key');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.match(checkout.purchaseKeyFor('x', blocked), /^[a-f\d-]{36}$/);
});

test('checkout result says what the order really is, and returns the client only when the step is done', () => {
  assert.deepEqual(['plan_active', 'pending_approval'].map((code) => checkout.checkoutResult({ orderState: { code } })).map((r) => [r.title, r.redirect]),
    [['Your plan is active', true], ['Payment submitted', true]]);
  const rejected = checkout.checkoutResult({ orderState: { code: 'rejected' }, rejectionReason: 'Payment not received' });
  assert.deepEqual([rejected.title, rejected.redirect], ['Payment not approved', false]);
  assert.match(rejected.text, /Reason: Payment not received\./);
  assert.equal(checkout.checkoutResult({ orderState: { code: 'cancelled', label: 'Cancelled' } }).title, 'Cancelled');
});
