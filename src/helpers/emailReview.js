// One review queue for the whole portal. Business requests are never repeated.
const nativeFetch = window.fetch.bind(window);
export const emailApiBase = `${process.env.REACT_APP_BACKEND_URL}/api/email-control`;
let showReview;
let reviewTail = Promise.resolve();
export function registerEmailReview(handler) {
  showReview = handler;
  return () => { if (showReview === handler) showReview = null; };
}
export function reviewEmail(draft, description = 'The action is saved. Choose whether to send this message.') {
  const task = reviewTail.then(() => showReview ? showReview({ ...draft, description }) : { choice: 'skip' });
  reviewTail = task.catch(() => {});
  return task;
}
export async function emailApi(path = '', options = {}) {
  const response = await nativeFetch(`${emailApiBase}${path}`, {
    credentials: 'include', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || 'Email request failed');
  return result.data;
}
export async function decideDraft(draft) {
  const decision = await reviewEmail(draft);
  if (decision.processedResult) return decision.processedResult;
  return emailApi(`/drafts/${draft._id}/decision`, { method: 'POST', body: JSON.stringify(decision) });
}
const fetchWithReview = async (input, options) => {
  const response = await nativeFetch(input, options);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
  const apiUrl = new URL(`${process.env.REACT_APP_BACKEND_URL}/api/`, window.location.href);
  if (url.origin !== apiUrl.origin || !url.pathname.startsWith(apiUrl.pathname) || url.pathname.startsWith(`${apiUrl.pathname}email-control`)) return response;
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
  try {
    const result = await response.clone().json();
    if (result.success && result.emailStatus === 'unavailable') window.dispatchEvent(new CustomEvent('email-review-error', { detail: 'Review is unavailable' }));
    if (result.success && result.emailDraftIds?.length && result.emailStatus === 'awaiting-review') {
      for (const id of result.emailDraftIds) {
        try {
          const decision = await decideDraft(result.emailReviewDraft && String(result.emailReviewDraft._id) === String(id) ? result.emailReviewDraft : await emailApi(`/drafts/${id}`));
          window.dispatchEvent(new CustomEvent('email-review-result', { detail: decision.delivery ? decision : decision.status }));
        }
        catch (error) { window.dispatchEvent(new CustomEvent('email-review-error', { detail: error.message })); }
      }
    }
  } catch { /* A review failure must never make a saved action look unsuccessful. */ }
  return response;
};

// Show preparation immediately for the explicit lead message actions. Keep the
// existing awaited review contract: callers refresh the timeline after deciding.
let preparingReviews = 0;
window.fetch = async (input, options) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.href);
  const base = new URL(`${process.env.REACT_APP_BACKEND_URL}/api/`, window.location.href);
  const preparing = url.origin === base.origin && url.pathname.startsWith(base.pathname)
    && /\/admin\/leads\/[^/]+\/(message|final-message)$/.test(url.pathname)
    && (options?.method || input?.method || 'GET').toUpperCase() === 'POST';
  if (preparing) { preparingReviews++; window.dispatchEvent(new CustomEvent('email-review-preparing', { detail: preparingReviews > 0 })); }
  try { return await fetchWithReview(input, options); }
  finally { if (preparing) { preparingReviews--; window.dispatchEvent(new CustomEvent('email-review-preparing', { detail: preparingReviews > 0 })); } }
};
