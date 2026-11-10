import React, { useState } from 'react';
import OfferPaymentTerms from './OfferPaymentTerms';
import Modal from './Modal';
import GlassButton from './GlassButton';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// The saved package details are not written out on the page: one button opens them in a popup. They are the
// lines saved with the project when it was bought (never today's package), so what the customer sees is what was agreed.
export default function ProjectAgreement({ order }) {
  const [showDetails, setShowDetails] = useState(false);
  const agreement = order?.projectSnapshot?.salesAgreement;
  const legacyOffer = order?.projectSnapshot?.offer;
  if (!agreement) return <>{legacyOffer && <p className="my-3 text-base text-[var(--text-secondary)]">Offer: {legacyOffer.title}</p>}<OfferPaymentTerms order={order} /></>;
  const scope = (agreement.scope || []).filter(line => String(line).trim());
  const terms = (agreement.terms || []).filter(line => String(line).trim());
  const title = agreement.package?.name || 'Your agreed project scope';
  return <section className="my-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-base text-[var(--text-primary)] sm:p-5" aria-label="Agreed package and offer">
    <h2 className="text-lg font-bold">{title}</h2>
    <OfferPaymentTerms order={order} />
    {agreement.offer && <p className="mt-1 text-[var(--text-secondary)]">Offer applied: {agreement.offer.title}</p>}
    <dl className="mt-3 space-y-2">
      <div className="flex justify-between gap-4"><dt>Regular scope price</dt><dd>{money(agreement.regularPrice)}</dd></div>
      {agreement.offerDiscount > 0 && <div className="flex justify-between gap-4"><dt>Offer benefit</dt><dd>−{money(agreement.offerDiscount)}</dd></div>}
      {(agreement.extras || []).map((item, index) => <div key={index} className="flex justify-between gap-4"><dt>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</dt><dd>{money(item.price)}</dd></div>)}
      {agreement.adminDiscount > 0 && <div className="flex justify-between gap-4"><dt>Additional discount ({agreement.discountReason})</dt><dd>−{money(agreement.adminDiscount)}</dd></div>}
      {agreement.priceAdjustment ? <div className="flex justify-between gap-4"><dt>{agreement.adjustmentLabel}</dt><dd>{agreement.priceAdjustment < 0 ? '−' : '+'}{money(Math.abs(agreement.priceAdjustment))}</dd></div> : null}
      <div className="flex justify-between gap-4 border-t border-[var(--divider)] pt-2 font-bold"><dt>Agreed project total</dt><dd>{agreement.finalPrice === 0 ? 'FREE' : money(agreement.finalPrice)}</dd></div>
    </dl>
    {(scope.length > 0 || terms.length > 0) && <div className="mt-4">
      <GlassButton onClick={() => setShowDetails(true)}>View package benefits &amp; terms</GlassButton>
    </div>}
    <p className="mt-3 text-sm text-[var(--text-muted)]">These are the details saved for your project. Later package changes do not change this agreement.</p>
    <Modal open={showDetails} onClose={() => setShowDetails(false)} eyebrow="Saved when you bought" title={title} size="lg">
      {scope.length > 0 && <>
        <h3 className="text-base font-bold">What is included</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">{scope.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </>}
      {terms.length > 0 && <>
        <h3 className="mt-6 text-base font-bold">Terms &amp; conditions</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">{terms.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </>}
    </Modal>
  </section>;
}
