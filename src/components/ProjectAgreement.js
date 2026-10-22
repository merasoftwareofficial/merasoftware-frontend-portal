import React from 'react';
import OfferPaymentTerms from './OfferPaymentTerms';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export default function ProjectAgreement({ order, compact = false }) {
  const agreement = order?.projectSnapshot?.salesAgreement;
  const legacyOffer = order?.projectSnapshot?.offer;
  if (!agreement) return <>{legacyOffer && <p className="my-3 text-base text-[var(--text-secondary)]">Offer: {legacyOffer.title}</p>}<OfferPaymentTerms order={order} /></>;
  return <section className="my-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-base text-[var(--text-primary)] sm:p-5" aria-label="Agreed package and offer">
    <h2 className="text-lg font-bold">{agreement.package?.name || 'Your agreed project scope'}</h2>
    <OfferPaymentTerms order={order} />
    {agreement.offer && <p className="mt-1 text-[var(--text-secondary)]">Offer applied: {agreement.offer.title}</p>}
    <dl className="mt-3 space-y-2">
      <div className="flex justify-between gap-4"><dt>Regular scope price</dt><dd>{money(agreement.regularPrice)}</dd></div>
      {agreement.offerDiscount > 0 && <div className="flex justify-between gap-4"><dt>Offer benefit</dt><dd>−{money(agreement.offerDiscount)}</dd></div>}
      {(agreement.extras || []).map((item, index) => <div key={index} className="flex justify-between gap-4"><dt>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</dt><dd>{money(item.price)}</dd></div>)}
      {agreement.adminDiscount > 0 && <div className="flex justify-between gap-4"><dt>Additional discount ({agreement.discountReason})</dt><dd>−{money(agreement.adminDiscount)}</dd></div>}
      <div className="flex justify-between gap-4 border-t border-[var(--divider)] pt-2 font-bold"><dt>Agreed project total</dt><dd>{agreement.finalPrice === 0 ? 'FREE' : money(agreement.finalPrice)}</dd></div>
    </dl>
    <details className="mt-4" open={compact ? undefined : true}><summary>Included work & agreed terms</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{(agreement.scope || []).map((line, index) => <li key={index}>{line}</li>)}</ul>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">{(agreement.terms || []).map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>
    <p className="mt-3 text-sm text-[var(--text-muted)]">These are the details saved for your project. Later package changes do not change this agreement.</p>
  </section>;
}
