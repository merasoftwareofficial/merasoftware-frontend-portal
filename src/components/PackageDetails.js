import React, { useState } from 'react';
import OfferPaymentTerms from './OfferPaymentTerms';
import Modal from './Modal';
import GlassButton from './GlassButton';
import { getOrderDisplayName } from '../helpers/orderPresentation';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Everything agreed when an order was bought, in one popup: the price and how it was reached, what is
// included, the terms, and the payment terms. It reads the details saved with the order (never today's
// package), so what the customer sees is what was agreed. Pages where the customer works show none of
// this; they point to the order page, which holds this button beside the order's invoices.
export default function PackageDetails({ order, className = '' }) {
  const [open, setOpen] = useState(false);
  const agreement = order?.projectSnapshot?.salesAgreement;
  const legacyOffer = order?.projectSnapshot?.offer;
  const hasPaymentTerms = Boolean(order?.paymentPolicy);
  if (!agreement && !legacyOffer && !hasPaymentTerms) return null;
  const scope = (agreement?.scope || []).filter(line => String(line).trim());
  const terms = (agreement?.terms || []).filter(line => String(line).trim());
  const title = agreement?.package?.name || legacyOffer?.title || getOrderDisplayName(order, 'Package details');
  return <>
    <GlassButton onClick={() => setOpen(true)} className={className}>Package details</GlassButton>
    <Modal open={open} onClose={() => setOpen(false)} eyebrow="Saved when you bought" title={title} size="lg">
      {agreement ? <>
        {agreement.offer && <p className="text-[var(--text-secondary)]">Offer applied: {agreement.offer.title}</p>}
        <dl className="mt-3 space-y-2 text-base">
          <div className="flex justify-between gap-4"><dt>Regular scope price</dt><dd>{money(agreement.regularPrice)}</dd></div>
          {agreement.offerDiscount > 0 && <div className="flex justify-between gap-4"><dt>Offer benefit</dt><dd>−{money(agreement.offerDiscount)}</dd></div>}
          {(agreement.extras || []).map((item, index) => <div key={index} className="flex justify-between gap-4"><dt>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</dt><dd>{money(item.price)}</dd></div>)}
          {agreement.adminDiscount > 0 && <div className="flex justify-between gap-4"><dt>Additional discount ({agreement.discountReason})</dt><dd>−{money(agreement.adminDiscount)}</dd></div>}
          {agreement.priceAdjustment ? <div className="flex justify-between gap-4"><dt>{agreement.adjustmentLabel}</dt><dd>{agreement.priceAdjustment < 0 ? '−' : '+'}{money(Math.abs(agreement.priceAdjustment))}</dd></div> : null}
          <div className="flex justify-between gap-4 border-t border-[var(--divider)] pt-2 font-bold"><dt>Agreed project total</dt><dd>{agreement.finalPrice === 0 ? 'FREE' : money(agreement.finalPrice)}</dd></div>
        </dl>
      </> : legacyOffer ? <p className="text-[var(--text-secondary)]">Offer: {legacyOffer.title}</p> : null}
      {scope.length > 0 && <>
        <h3 className="mt-6 text-base font-bold">What is included</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">{scope.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </>}
      {terms.length > 0 && <>
        <h3 className="mt-6 text-base font-bold">Terms &amp; conditions</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">{terms.map((line, index) => <li key={index}>{line}</li>)}</ul>
      </>}
      {hasPaymentTerms && <div className="mt-6"><OfferPaymentTerms order={order} bare /></div>}
      {agreement && <p className="mt-6 pb-1 text-sm text-[var(--text-muted)]">These are the details saved for this order. Later package changes do not change this agreement.</p>}
    </Modal>
  </>;
}
