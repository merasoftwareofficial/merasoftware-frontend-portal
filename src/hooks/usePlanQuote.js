import { useEffect, useMemo, useRef, useState } from 'react';
import SummaryApi from '../common';

// The backend price for one plan choice (POST /api/customer/service-plan-quote), shared by the plan
// builder (components/PlanBuilder.js) and the checkout page (pages/PlanCheckout.js): nothing on the
// portal works out a price. Only the newest answer counts; `refreshToken` changing asks again (after a
// 409 "price changed"). Returns { ready, loading, error, quote, body } — `body` is the exact purchase
// body including quoteKey, set only while the quote belongs to the current choice.
export default function usePlanQuote(plan, choice, refreshToken = 0) {
  const [state, setState] = useState({ request: '', loading: false, error: '', quote: null, quoteKey: '' });
  const requestRef = useRef(0);
  const request = JSON.stringify({ planId: plan?._id, choice, refreshToken });

  useEffect(() => {
    if (!choice || !plan?._id) return undefined;
    const ticket = requestRef.current + 1;
    requestRef.current = ticket;
    setState({ request, loading: true, error: '', quote: null, quoteKey: '' });
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(SummaryApi.servicePlanQuote.url, {
          method: SummaryApi.servicePlanQuote.method,
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ planId: plan._id, ...choice }),
        });
        const result = await response.json().catch(() => ({}));
        if (requestRef.current !== ticket) return;
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not work out the price. Please try again.');
        setState({ request, loading: false, error: '', quote: result.data.quote, quoteKey: result.data.quoteKey });
      } catch (error) {
        if (requestRef.current !== ticket) return;
        setState({ request, loading: false, error: error.message, quote: null, quoteKey: '' });
      }
    }, 250);
    return () => { clearTimeout(timer); requestRef.current += 1; };
  }, [choice, plan?._id, refreshToken, request]);

  return useMemo(() => {
    const current = state.request === request;
    const ready = Boolean(current && state.quote && state.quoteKey && !state.loading && !state.error);
    return {
      ready,
      loading: !current || state.loading,
      error: current ? state.error : '',
      quote: current ? state.quote : null,
      body: ready ? { ...choice, quoteKey: state.quoteKey } : null,
    };
  }, [state, request, choice]);
}
