// Admin portal return-navigation SSOT.
//
// Structural twin of `customerReturnNavigation.js` — same contract, admin path
// whitelist. A browser-history step is not a reliable definition of "Back": the
// same admin screen is reachable from several parents (the client workspace is
// opened from both the dashboard and the clients list), so `navigate(-1)` sends
// the same button to different places. Child pages therefore receive an
// explicit, validated return target. A direct URL or refresh has no such target
// and uses the page's documented fallback.

const ADMIN_RETURN_STATE_KEY = 'adminReturnTo';

const isInternalAdminPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return false;
  }

  const pathname = value.split(/[?#]/, 1)[0];

  return [
    '/admin-panel/dashboard',
    '/admin-panel/leads',
    '/admin-panel/clients',
    '/admin-panel/website-management/plans',
    '/admin-panel/website-management/services/add',
    '/admin-panel/project-setup/base-price',
    '/admin-panel/project-setup/features',
    '/admin-panel/trash',
    '/admin-panel/project-details/',
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
};

export const getAdminPath = (location) => {
  const path = `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`;
  return isInternalAdminPath(path) ? path : null;
};

export const adminReturnState = (returnTo) => (
  isInternalAdminPath(returnTo)
    ? { [ADMIN_RETURN_STATE_KEY]: returnTo }
    : undefined
);

export const getAdminReturnTarget = (location, fallback) => {
  const explicitTarget = location?.state?.[ADMIN_RETURN_STATE_KEY];
  return isInternalAdminPath(explicitTarget) ? explicitTarget : fallback;
};

export const goToAdminReturn = (navigate, location, fallback, options) => {
  navigate(getAdminReturnTarget(location, fallback), options);
};

const adminReturnNavigation = {
  adminReturnState,
  getAdminPath,
  getAdminReturnTarget,
  goToAdminReturn,
};

export default adminReturnNavigation;
