import React from 'react';

export default function OfferPaymentTerms({ order }) {
  const policy = order?.paymentPolicy;
  if (!policy) return null;
  const labels = { advance: 'Advance payment', limited_uploads: 'Limited uploads before payment', pay_later: 'Pay later' };
  const access = order.paymentAccess;
  return <section aria-label="Agreed payment terms" className="my-4 rounded-2xl border border-[var(--glass-border)] p-4 text-base">
    <h3 className="font-semibold">Payment terms · {policy.offerTitle}</h3>
    <p>{labels[policy.mode]}</p>
    {policy.mode === 'limited_uploads' && <p>{policy.uploadAllowance} successful submissions allowed before required payment.</p>}
    <p>Payment due {policy.dueDays} day(s) after {order.isServicePlan ? 'the service-cycle start' : 'project creation'}.</p>
    {order.isServicePlan && <p>{policy.cycleScope === 'every_cycle' ? 'Applies to every billing cycle.' : 'Applies to the first purchase only.'}</p>}
    {access?.paymentPending && <p role="status">{access.overdue ? 'Payment overdue' : 'Payment pending'}{access.dueDate ? ` · Due ${new Date(access.dueDate).toLocaleDateString('en-IN')}` : ''}</p>}
    {access?.uploadsRemaining != null && <p>Pre-payment submissions remaining: {access.uploadsRemaining}</p>}
    {access?.reason && <p>{access.reason}</p>}
    <p className="mt-2 text-sm text-[var(--text-muted)]">Your original service quota and validity still apply. These agreed terms do not change when the offer is edited.</p>
  </section>;
}
