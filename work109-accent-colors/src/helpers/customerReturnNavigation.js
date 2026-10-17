// Customer portal return-navigation SSOT.
//
// Each child route receives a validated stack of its portal parents. This keeps
// nested flows intact, for example Dashboard -> Workspace -> Service -> Back ->
// Workspace -> Back -> Dashboard. Direct URLs and refreshes have no stack, so
// callers use their documented fallback instead.

const CUSTOMER_RETURN_STACK_KEY = 'customerReturnStack';

const isInternalCustomerPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return false;
  }

  const pathname = value.split(/[?#]/, 1)[0];

  return [
    '/dashboard',
    '/projects-and-plans',
    '/start-new-project',
    '/order',
    '/order-detail/',
    '/project-details/',
    '/plan-details/',
    '/service-plan-detail/',
    '/wallet',
    '/my-updates',
    '/my-invoices',
    '/documents',
    '/support',
    '/profile',
    '/complete-profile',
    '/games',
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
};

const normalizeStack = (value) => (
  Array.isArray(value)
    ? value.filter(isInternalCustomerPath).slice(-8)
    : []
);

const toNavigationState = (stack) => (
  stack.length > 0 ? { [CUSTOMER_RETURN_STACK_KEY]: stack } : undefined
);

export const getCustomerPath = (location) => {
  const path = `${location?.pathname || ''}${location?.search || ''}${location?.hash || ''}`;
  return isInternalCustomerPath(path) ? path : null;
};

export const getCustomerReturnStack = (location) => (
  normalizeStack(location?.state?.[CUSTOMER_RETURN_STACK_KEY])
);

// Use for the first known parent when no router location is available.
export const customerReturnState = (returnTo) => (
  isInternalCustomerPath(returnTo) ? toNavigationState([returnTo]) : undefined
);

// Use whenever a live parent page opens a child route.
export const customerChildState = (location) => {
  const currentPath = getCustomerPath(location);
  const stack = getCustomerReturnStack(location);

  if (!currentPath || stack[stack.length - 1] === currentPath) {
    return toNavigationState(stack);
  }

  return toNavigationState([...stack, currentPath].slice(-8));
};

export const getCustomerReturnTarget = (location, fallback) => {
  const stack = getCustomerReturnStack(location);
  return stack.length > 0 ? stack[stack.length - 1] : fallback;
};

export const goToCustomerReturn = (navigate, location, fallback, options = {}) => {
  const stack = getCustomerReturnStack(location);

  if (stack.length === 0) {
    navigate(fallback, options);
    return;
  }

  const target = stack[stack.length - 1];
  navigate(target, {
    ...options,
    state: toNavigationState(stack.slice(0, -1)),
  });
};

export default {
  customerReturnState,
  customerChildState,
  getCustomerPath,
  getCustomerReturnStack,
  getCustomerReturnTarget,
  goToCustomerReturn,
};
