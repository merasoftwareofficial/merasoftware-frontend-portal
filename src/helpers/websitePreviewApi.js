import SummaryApi from '../common';

export async function previewRequest(projectId, suffix = '', options = {}) {
  const response = await fetch(`${SummaryApi.websitePreview.url}/${encodeURIComponent(projectId)}/website-preview${suffix}`, {
    credentials: 'include', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.message || 'Website preview is unavailable.');
  return result.data;
}
export async function previewServiceRequest(base, action, body, signal) {
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Preview service requires HTTPS.');
  const response = await fetch(`${url.origin}/api/website-preview/${action}`, { method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.message || 'Website upload service is unavailable.');
  return result.data;
}
