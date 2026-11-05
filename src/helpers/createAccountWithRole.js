import SummaryApi from '../common';

// An admin creating a portal user makes the account with its role in one admin-only call. It never goes
// through the website's sign-up, so a team account gets no member lead (backend controller/user/adminCreateAccount.js).
const createAccountWithRole = async (account, role) => {
  const response = await fetch(SummaryApi.adminCreateAccount.url, {
    method: SummaryApi.adminCreateAccount.method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...account, role }),
  });
  const created = await response.json();
  if (!created.success) return created;
  return { success: true, data: created.data };
};

export default createAccountWithRole;
