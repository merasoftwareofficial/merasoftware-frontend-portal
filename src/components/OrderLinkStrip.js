import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import GlassButton from './GlassButton';
import { customerChildState, orderPagePath } from '../helpers/customerReturnNavigation';

// The one line at the foot of a working page (project, plan, service). Prices, invoices and package details
// belong to the order, so this page names none of them and points to the order page instead. `bill` is a
// payable invoice of this order, when one is due: it gets its own button to the invoice page, the single
// place a bill is paid.
export default function OrderLinkStrip({ orderId, bill = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!orderId) return null;
  const go = path => navigate(path, { state: customerChildState(location) });
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3">
    <p className="min-w-0 text-base text-[var(--text-secondary)]">Invoice, price and package details are on the order page.</p>
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {bill?._id && <GlassButton variant="primary" onClick={() => go(`/invoice-detail/${bill._id}`)}>Payment due · View bill</GlassButton>}
      <GlassButton onClick={() => go(orderPagePath(orderId))}>Go to order<ChevronRight size={16} /></GlassButton>
    </div>
  </div>;
}
