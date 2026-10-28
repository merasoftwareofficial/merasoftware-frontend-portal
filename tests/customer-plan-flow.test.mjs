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
const planPath = '/service-plan-detail/6a90417d77eae0db8156833d';

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
