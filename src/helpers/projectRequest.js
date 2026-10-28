import SummaryApi from '../common';

// Get a Service → Start a Project (pages/StartProjectRequest.js, pages/StartProjectRequestDetails.js).
// The option keys match backend controller/lead/customerProjectRequest.js ANSWERS.

export const BUDGET_OPTIONS = [['under_30k', 'Under ₹30,000'], ['30k_1l', '₹30,000 – ₹1 lakh'], ['above_1l', 'Above ₹1 lakh'], ['not_sure', 'Not sure yet']];
export const CALL_TIME_OPTIONS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['any', 'Any time']];
export const DETAILS_MAX = 300;

const readJson = async (response, fallback) => {
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || fallback);
  return result;
};

// Project types the client can ask about: [{ category, label, description }], live from the backend.
export const readProjectRequestCategories = async (signal) => {
  const response = await fetch(SummaryApi.projectRequestCategories.url, { method: SummaryApi.projectRequestCategories.method, credentials: 'include', signal });
  return (await readJson(response, 'Could not load the project types.')).data || [];
};

export const sendProjectRequest = async (body) => {
  const response = await fetch(SummaryApi.projectRequest.url, {
    method: SummaryApi.projectRequest.method,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await readJson(response, 'Could not send your request. Please try again.')).data || {};
};
