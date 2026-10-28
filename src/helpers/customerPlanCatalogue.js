import SummaryApi from '../common';

export async function readCustomerPlanCatalogue(signal) {
  const response = await fetch(SummaryApi.customerPlanCatalogue.url, { credentials: 'include', cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Could not load services. Please try again.');
  return result.data;
}

export function planGroups(plans, categories) {
  const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.label.localeCompare(b.label));
  const known = new Set(sorted.map(row => row.key));
  return [
    ...sorted.map(category => ({ ...category, plans: plans.filter(plan => plan.servicePlan?.categoryKey === category.key) })),
    { key: '__other', label: 'More plans', description: '', plans: plans.filter(plan => !known.has(plan.servicePlan?.categoryKey)) },
  ].filter(group => group.plans.length);
}

export function planBenefit(plan) {
  const sp = plan.servicePlan || {};
  if (sp.capability === 'send_reminders') return 'We do the work and post updates for you. No file uploads needed.';
  if (sp.pricingMode === 'flexible') return 'Choose files per update and the number of updates in the plan builder.';
  if (sp.limitScope === 'unlimited') return `Unlimited updates${sp.filesLimit ? ` · up to ${sp.filesLimit} files each` : ''}`;
  const scopes = { per_day: 'per day', per_week: 'per week', per_month: 'per month', per_quarter: 'per 3 months', per_6_month: 'per 6 months', per_year: 'per year', per_plan: 'per purchase' };
  const period = sp.purchaseType === 'one_time' ? 'per purchase' : scopes[sp.limitScope] || 'in this plan';
  const allowance = sp.portalAccessCount ? `${sp.portalAccessCount} update${sp.portalAccessCount === 1 ? '' : 's'} ${period}` : '';
  return [allowance, sp.filesLimit ? `up to ${sp.filesLimit} files each` : ''].filter(Boolean).join(' · ');
}
