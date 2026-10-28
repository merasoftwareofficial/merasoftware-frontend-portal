// Narrow login continuation policy. Never accept an arbitrary next URL.
export function customerReturnTarget(value) {
  if (typeof value !== 'string') return null;
  if (value === '/my-offers') return value;
  if (/^\/service-plan-detail\/[a-f\d]{24}$/i.test(value)) return value;
  if (value === '/start-new-project/services' || value === '/start-new-project/services?tab=services') return value;
  return null;
}

export function planLoginUrl(path) {
  const target = customerReturnTarget(path);
  return target ? `/login?next=${encodeURIComponent(target)}` : '/login';
}

export function loginContinuation({ role, mustResetPassword, returnTo, home }) {
  const target = role === 'customer' ? customerReturnTarget(returnTo) : null;
  if (mustResetPassword) return target ? `/set-new-password?next=${encodeURIComponent(target)}` : '/set-new-password';
  return target || home;
}

export function passwordContinuation(requested, role, websiteUrl) {
  const internal = role === 'customer' ? customerReturnTarget(requested) : null;
  if (internal) return { internal, external: null };
  // Retain the existing explicitly allowed website offer-return paths.
  try {
    const target = new URL(requested);
    if (target.origin === new URL(websiteUrl).origin &&
        (/^\/offer\/[a-z0-9-]+$/.test(target.pathname) || target.pathname === '/account/offers') &&
        !target.search && !target.hash && !target.username && !target.password) {
      return { internal: null, external: target.toString() };
    }
  } catch { /* Invalid and unrelated destinations use the role home. */ }
  return { internal: null, external: null };
}
