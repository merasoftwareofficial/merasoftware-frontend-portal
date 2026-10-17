import React, { useState } from 'react';
import { ChevronDown, Cloud, Database, Globe, Layers3, Minus, Plus, Smartphone, X } from 'lucide-react';

const CATEGORY_STYLE = {
  standard_websites: { icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
  dynamic_websites: { icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  cloud_software_development: { icon: Cloud, color: 'text-purple-600', bg: 'bg-purple-50' },
  app_development: { icon: Smartphone, color: 'text-orange-600', bg: 'bg-orange-50' },
  website_updates: { icon: Layers3, color: 'text-teal-600', bg: 'bg-teal-50' },
  service_plan: { icon: Layers3, color: 'text-teal-600', bg: 'bg-teal-50' },
};

export const formatPrice = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

export const buildPaymentData = (draft) => {
  const selectedFeaturesData = (draft.availableFeatures || [])
    .filter((feature) => draft.selectedFeatureIds.includes(feature.id))
    .map((feature) => ({
      id: feature.id,
      name: feature.name,
      quantity: 1,
      sellingPrice: feature.sellingPrice,
      totalPrice: feature.sellingPrice,
    }));

  if (draft.pageSelection && draft.pageSelection.extraPages > 0) {
    selectedFeaturesData.push({
      id: draft.pageSelection.featureId,
      name: 'Add New Page',
      quantity: draft.pageSelection.quantity,
      additionalQuantity: draft.pageSelection.extraPages,
      sellingPrice: draft.pageSelection.pricePerPage,
      totalPrice: draft.pageSelection.extraCost,
    });
  }

  const originalTotalPrice = draft.basePrice + selectedFeaturesData.reduce((sum, f) => sum + f.totalPrice, 0);

  return {
    product: draft.sourceProduct,
    selectedFeatures: selectedFeaturesData,
    couponData: null,
    totalPrice: draft.price,
    currentPaymentAmount: draft.price,
    originalTotalPrice,
    paymentOption: 'full',
    remainingPayments: [],
  };
};

const DraftOrderCard = ({
  draft,
  onRemove,
  onToggleFeature,
  onUpdatePageQuantity,
  isSelectedForCheckout,
  onToggleCheckoutSelection,
}) => {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const style = CATEGORY_STYLE[draft.category] || CATEGORY_STYLE.standard_websites;
  const Icon = style.icon;
  const hasFeatures = draft.availableFeatures && draft.availableFeatures.length > 0;
  const selectedFeatures = (draft.availableFeatures || []).filter((feature) =>
    draft.selectedFeatureIds.includes(feature.id)
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-start gap-3">
        {onToggleCheckoutSelection && (
          <input
            type="checkbox"
            checked={isSelectedForCheckout}
            onChange={() => onToggleCheckoutSelection(draft.draftOrderId)}
            aria-label="Select for combined checkout"
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
          />
        )}
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${style.bg}`}>
          <Icon className={`h-5 w-5 ${style.color}`} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-black">{draft.name}</p>
          <p className="mt-0.5 text-sm text-black">{draft.typeLabel}</p>
        </div>

        <button
          type="button"
          onClick={() => onRemove(draft.draftOrderId)}
          aria-label="Remove from cart"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {draft.pageSelection && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500 bg-emerald-50/60 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-black">Add More Pages</p>
            <p className="mt-0.5 text-xs text-black">
              Includes {draft.totalPages} page{draft.totalPages === 1 ? '' : 's'}
            </p>
            {draft.pageSelection.extraPages > 0 && (
              <p className="mt-0.5 text-xs text-black">
                +{draft.pageSelection.extraPages} extra — {formatPrice(draft.pageSelection.extraCost)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-1.5 py-1">
            <button
              type="button"
              onClick={() => onUpdatePageQuantity(draft.draftOrderId, draft.pageSelection.quantity - 1)}
              disabled={draft.pageSelection.quantity <= draft.totalPages}
              aria-label="Remove a page"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-bold text-black">{draft.pageSelection.quantity}</span>
            <button
              type="button"
              onClick={() => onUpdatePageQuantity(draft.draftOrderId, draft.pageSelection.quantity + 1)}
              aria-label="Add a page"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-black transition hover:bg-slate-100"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold text-black">{formatPrice(draft.price)}</span>
        {hasFeatures && (
          <button
            type="button"
            onClick={() => setFeaturesOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-black hover:bg-slate-50"
          >
            {selectedFeatures.length > 0 ? 'Edit Add-ons' : 'Add Extra Features'}
            <ChevronDown className={`h-4 w-4 transition-transform ${featuresOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {selectedFeatures.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedFeatures.map((feature) => (
            <span
              key={feature.id}
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
            >
              {feature.name}
            </span>
          ))}
        </div>
      )}

      {hasFeatures && featuresOpen && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60">
          <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Select extra features to add
          </p>
          <div className="divide-y divide-slate-100">
            {draft.availableFeatures.map((feature) => {
              const isChecked = draft.selectedFeatureIds.includes(feature.id);
              return (
                <label
                  key={feature.id}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm text-black hover:bg-slate-100/70"
                >
                  <span>{feature.name}</span>
                  <div className="flex items-center gap-3">
                    {feature.sellingPrice > 0 && (
                      <span className="text-sm text-black">{formatPrice(feature.sellingPrice)}</span>
                    )}
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleFeature(draft.draftOrderId, feature.id)}
                      className="h-4 w-4 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
                    />
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftOrderCard;
