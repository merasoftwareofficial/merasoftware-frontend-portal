import SummaryApi from '../common';

async function request(url, body) {
  const response = await fetch(url, {
    method: body ? 'PATCH' : 'GET', credentials: 'include', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw Object.assign(new Error(result.message || 'Could not load or save plans. Please try again.'), { status: response.status });
  }
  return result.data;
}

export const readAdminPlanCatalogue = () => request(SummaryApi.adminPlanCatalogue.url);
export function sendAdminPlan({ target, ...body }) {
  const paths = {
    plan: SummaryApi.adminPlanCatalogue.url,
    category: SummaryApi.adminPlanCategories.url,
    quote: SummaryApi.adminPlanQuote.url,
  };
  if (!paths[target]) throw new Error('Unknown plan action');
  return request(paths[target], body);
}
