// The plan choice a plan page may carry (the website's "Get this plan" link,
// merasoftware/src/lib/public-plans.ts choiceQuery): known keys only, each once, in a fixed shape.
// Whether the plan really offers the values is checked on the page (serviceTenure.js initialPlanChoice).
const PLAN_CHOICE_QUERY = {
  purchase: /^(one_time|monthly|quarterly|half_yearly|yearly)$/,
  months: /^([1-9]|1[0-2])$/,
  files: /^[1-9]\d{0,3}$/,
  updates: /^[1-9]\d?$/,
  release: /^(all_at_once|monthly)$/,
};
// The checkout page (pages/PlanCheckout.js) also carries where the client came from, as a word,
// never an address: the place it goes back to is the portal's own setting (helpers/brand.js).
const CHECKOUT_FROM = { from: /^(website|portal)$/ };
const CHECKOUT_QUERY = { ...PLAN_CHOICE_QUERY, ...CHECKOUT_FROM };
const isKnownQuery = (search, allowed) => {
  if (!/^[a-z_]+=[a-z_\d]+(&[a-z_]+=[a-z_\d]+)*$/.test(search)) return false;
  const query = new URLSearchParams(search);
  const keys = [...query.keys()];
  return new Set(keys).size === keys.length && keys.every((key) => allowed[key]?.test(query.get(key)));
};

// Narrow login continuation policy. Never accept an arbitrary next URL.
export function customerReturnTarget(value) {
  if (typeof value !== 'string') return null;
  if (value === '/my-offers') return value;
  const [path, search, ...rest] = value.split('?');
  if (rest.length) return null;
  if (/^\/service-plan-detail\/[a-f\d]{24}$/i.test(path) && (search === undefined || isKnownQuery(search, PLAN_CHOICE_QUERY))) return value;
  if (/^\/checkout\/[a-f\d]{24}$/i.test(path) && (search === undefined || isKnownQuery(search, CHECKOUT_QUERY))) return value;
  if (/^\/checkout\/done\/[a-f\d]{24}$/i.test(path) && (search === undefined || isKnownQuery(search, CHECKOUT_FROM))) return value;
  if (value === '/start-new-project/services' || value === '/start-new-project/services?tab=services') return value;
  return null;
}

export function planLoginUrl(path) {
  const target = customerReturnTarget(path);
  return target ? `/login?next=${encodeURIComponent(target)}` : '/login';
}

// A protected page's own login link: its address with the plan choice when that is allowed,
// else the bare page (so an unexpected query never loses the plan itself).
export function protectedLoginUrl({ pathname, search }) {
  return customerReturnTarget(`${pathname}${search}`) ? planLoginUrl(`${pathname}${search}`) : planLoginUrl(pathname);
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
