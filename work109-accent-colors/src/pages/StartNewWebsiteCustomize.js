import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Info, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import Context from '../context';
import DashboardLayout from '../components/DashboardLayout';
import SummaryApi from '../common';
import displayINRCurrency from '../helpers/displayCurrency';
import { isFeatureForCategory } from '../helpers/projectCategoryOptions';

// Primary project categories the customize form supports.
const PROJECT_OPTIONS = [
  { value: 'standard_websites', label: 'Static Website' },
  { value: 'dynamic_websites', label: 'Dynamic Website' },
  { value: 'cloud_software_development', label: 'Cloud Software' },
  { value: 'app_development', label: 'Mobile App' },
];

const BUDGET_OPTIONS = [
  { value: 'range_5k_30k', label: '5,000 - 30,000' },
  { value: 'range_30k_plus', label: '30,000 and above' },
];

const OWNERSHIP_OPTIONS = [
  { value: 'self_managed', label: "I'll manage content myself" },
  { value: 'we_maintain', label: 'MeraSoftware will maintain it' },
];

const PAYMENT_OPTIONS = [
  { value: 'full', label: 'Full payment' },
  { value: 'partial', label: 'Partial payment' },
  { value: 'decide_later', label: 'Decide payment later' },
];

// Guests explore with demo wallet money only — installments exist to spread a
// real payment over time, which doesn't apply here, and progress-threshold
// gates on partial payment would otherwise stall a guest's demo project at
// 50%/90%. Full payment (wallet-covered, approved instantly) and Decide
// Later (guest can pay from their own order page afterward) both still work.
const paymentOptionsFor = (isGuest) =>
  isGuest ? PAYMENT_OPTIONS.filter((option) => option.value !== 'partial') : PAYMENT_OPTIONS;

const labelOf = (options, value) => options.find((o) => o.value === value)?.label || '';

// Installment plans for partial payment. Must stay byte-aligned with the backend
// buildInstallments() in customerCreateCustomProjectOrder.js: 2 => 50/50, 3 => 30/30/40.
const INSTALLMENT_OPTIONS = [
  { value: 2, label: '2 installments (50% / 50%)', splits: [50, 50] },
  { value: 3, label: '3 installments (30% / 30% / 40%)', splits: [30, 30, 40] },
];
const splitsFor = (count) =>
  INSTALLMENT_OPTIONS.find((o) => o.value === count)?.splits || [50, 50];

// Every capability is an ordinary optional feature: the customer picks it or not. A feature
// the admin marked quantity-based gets a +/- counter and is charged sellingPrice x quantity;
// the rest are a single checkbox. Nothing is inferred from a feature's name, and nothing is
// forced into the order — the category base price is the package the customer already pays for.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

const SectionLabel = ({ children }) => (
  <p className="text-sm font-semibold uppercase tracking-wide text-[var(--eyebrow-fg)]">{children}</p>
);

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-2 block text-base font-medium text-[var(--text-primary)]">{label}</span>
    {children}
  </label>
);

// Single-select glass dropdown.
const SelectDropdown = ({ value, options, placeholder = 'Select…', onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectedLabel = labelOf(options, value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-left text-base text-[var(--text-primary)] outline-none transition hover:border-[var(--glass-border-strong)] focus-visible:border-[var(--badge-success-fg)]"
      >
        <span className={selectedLabel ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--menu-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-base transition-colors ${
                  isActive ? 'bg-[var(--badge-success-bg)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-subtle)]'
                }`}
              >
                {option.label}
                {isActive && <Check className="h-4 w-4 text-[var(--badge-success-fg)]" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Multi-select glass dropdown for capabilities (chips + checkbox list).
const MultiSelectDropdown = ({
  selectedIds,
  options,
  loading,
  onToggle,
  onRemove,
  quantities,
  onQuantityChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Everything the customer has actually ticked — no feature is selected implicitly.
  const selectedOptions = options.filter((o) => selectedIds.includes(o._id));
  const summaryCount = selectedOptions.length;

  const stepQuantity = (featureId, delta) => (e) => {
    e.stopPropagation();
    const current = quantities[featureId] || MIN_QUANTITY;
    onQuantityChange(
      featureId,
      Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, current + delta))
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading || options.length === 0}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-left text-base text-[var(--text-primary)] outline-none transition hover:border-[var(--glass-border-strong)] focus-visible:border-[var(--badge-success-fg)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={summaryCount ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {loading
            ? 'Loading capabilities…'
            : options.length === 0
            ? 'No capabilities available for this project'
            : summaryCount
            ? `${summaryCount} selected`
            : 'Choose capabilities'}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {open && options.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-[var(--glass-border)] bg-[var(--menu-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          {options.map((option) => {
            const isSelected = selectedIds.includes(option._id);
            const quantity = quantities[option._id] || MIN_QUANTITY;
            // A quantity-based feature keeps its checkbox and, once ticked, reveals a
            // +/- counter — so the customer chooses it like any other capability.
            return (
              <div key={option._id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onToggle(option._id)}
                  className="flex w-full items-center justify-between gap-3 text-left text-base text-[var(--text-secondary)] transition-colors"
                >
                  <span className={isSelected ? 'font-medium text-[var(--text-primary)]' : ''}>
                    {option.serviceName?.trim()}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-transparent bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)]'
                        : 'border-[var(--glass-border-strong)] text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                </button>

                {isSelected && option.isQuantityBased && (
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--text-muted)]">
                      {displayINRCurrency(Number(option.sellingPrice) || 0)} each
                    </span>
                    <div className="flex items-center gap-1 rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)]">
                      <button
                        type="button"
                        onClick={stepQuantity(option._id, -1)}
                        disabled={quantity <= MIN_QUANTITY}
                        className="flex h-8 w-8 items-center justify-center rounded-l-lg text-[var(--text-primary)] transition hover:bg-[var(--glass-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                      <span className="min-w-[2.5rem] text-center text-base font-semibold text-[var(--text-primary)]">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={stepQuantity(option._id, 1)}
                        disabled={quantity >= MAX_QUANTITY}
                        className="flex h-8 w-8 items-center justify-center rounded-r-lg text-[var(--text-primary)] transition hover:bg-[var(--glass-bg)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected chips — a quantity-based feature shows its count alongside the name. */}
      {selectedOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <span
              key={option._id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] py-1 pl-3 pr-1.5 text-sm text-[var(--text-primary)]"
            >
              {option.serviceName?.trim()}
              {option.isQuantityBased ? ` x${quantities[option._id] || MIN_QUANTITY}` : ''}
              <button
                type="button"
                onClick={() => onRemove(option._id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--glass-bg-strong)]"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const StartNewWebsiteCustomize = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const context = useContext(Context);
  const user = useSelector((state) => state?.user?.user);
  const paymentOptions = useMemo(() => paymentOptionsFor(user?.isGuest), [user?.isGuest]);

  const state = location.state || {};

  // Editable form state (prefilled from the flow, but the user can change anything here).
  const [projectCategory, setProjectCategory] = useState(state.projectCategory || 'dynamic_websites');
  const [budget, setBudget] = useState(state.budget || '');
  const [ownership, setOwnership] = useState(state.ownership || '');
  const [paymentOption, setPaymentOption] = useState('full');
  const [installmentCount, setInstallmentCount] = useState(2);
  const [couponCode, setCouponCode] = useState('');

  const [allFeatures, setAllFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState([]);
  // Per-feature counts for quantity-based features, keyed by feature id.
  const [featureQuantities, setFeatureQuantities] = useState({});
  // Category base price — the SAME base the backend adds in finalPrice = basePrice + features.
  // Fetched per-category so the on-page estimate matches the authoritative order price.
  const [basePrice, setBasePrice] = useState(0);

  // Fetch features whenever the primary project changes. Old selection is cleared on change.
  useEffect(() => {
    let active = true;
    const fetchFeatures = async () => {
      try {
        setLoading(true);
        const response = await fetch(SummaryApi.allProduct.url);
        const dataResponse = await response.json();
        const products = dataResponse?.data || [];
        // Same rule the backend enforces in customerCreateCustomProjectOrder.js: a feature
        // is offered for this category when compatibleWith names it, or names nothing at
        // all (= all categories).
        const features = products.filter(
          (p) =>
            p.category === 'feature_upgrades' &&
            !p.isHidden &&
            isFeatureForCategory(p, projectCategory)
        );
        if (active) {
          setAllFeatures(features);
          setSelectedFeatureIds([]); // reset selection for the new project type
          setFeatureQuantities({}); // reset counters for the new project type
        }
      } catch (error) {
        console.error('Error loading features:', error);
        if (active) {
          setAllFeatures([]);
          setSelectedFeatureIds([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    // Category base price — same source the backend uses, so the estimate matches finalPrice.
    const fetchBasePrice = async () => {
      try {
        const response = await fetch(
          `${SummaryApi.customerCategoryBasePrice.url}?category=${projectCategory}`,
          { credentials: 'include' }
        );
        const data = await response.json();
        if (active) setBasePrice(Number(data?.data?.basePrice) || 0);
      } catch (error) {
        console.error('Error loading base price:', error);
        if (active) setBasePrice(0);
      }
    };

    fetchFeatures();
    fetchBasePrice();
    return () => {
      active = false;
    };
  }, [projectCategory]);

  const toggleFeature = (featureId) => {
    setSelectedFeatureIds((prev) =>
      prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]
    );
  };

  const removeFeature = (featureId) => {
    setSelectedFeatureIds((prev) => prev.filter((id) => id !== featureId));
  };

  const setFeatureQuantity = (featureId, quantity) => {
    setFeatureQuantities((prev) => ({ ...prev, [featureId]: quantity }));
  };

  // Estimate total (UI-only, not a final price). Byte-aligned with the backend's
  // finalPrice = basePrice + featuresTotal (customerCreateCustomProjectOrder.js):
  //  - category base price is always included
  //  - a selected feature is counted as sellingPrice × its quantity (1 unless the
  //    feature is quantity-based)
  const estimateTotal = useMemo(
    () =>
      allFeatures.reduce((sum, f) => {
        if (!selectedFeatureIds.includes(f._id)) return sum;
        const price = Number(f.sellingPrice) || 0;
        const quantity = f.isQuantityBased ? featureQuantities[f._id] || MIN_QUANTITY : 1;
        return sum + price * quantity;
      }, basePrice),
    [allFeatures, selectedFeatureIds, featureQuantities, basePrice]
  );

  const projectLabel = labelOf(PROJECT_OPTIONS, projectCategory) || 'Your Project';
  const selectedCount = selectedFeatureIds.length;

  // Human-readable list of chosen capabilities, a quantity-based one carrying its count.
  const selectedCapabilityNames = useMemo(
    () =>
      allFeatures
        .filter((f) => selectedFeatureIds.includes(f._id))
        .map((f) => {
          const name = f.serviceName?.trim();
          if (!f.isQuantityBased) return name;
          return `${featureQuantities[f._id] || MIN_QUANTITY} × ${name}`;
        }),
    [allFeatures, selectedFeatureIds, featureQuantities]
  );

  // --- Proceed / Create handling (wired to the customer custom-project endpoint) ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // In-page payment step (reuses the proven InstallmentPayment.js pattern: pay on an
  // already-created order via /wallet/verify-payment with orderId — no second order).
  const [showQR, setShowQR] = useState(false);
  const [upiLink, setUpiLink] = useState('');
  const [payTxnId, setPayTxnId] = useState('');
  const [upiTransactionId, setUpiTransactionId] = useState('');
  const [payProcessing, setPayProcessing] = useState(false);

  const generateTransactionId = () => {
    const prefix = paymentOption === 'partial' ? 'INST' : 'TXN';
    return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`;
  };

  // Installment breakdown shown for partial payment. Amounts are computed off the
  // client estimate for display only — the backend re-derives the authoritative price
  // and the real installment amounts on create (see the amber "estimate" disclaimer).
  const installmentBreakdown = useMemo(() => {
    if (paymentOption !== 'partial') return [];
    return splitsFor(installmentCount).map((percentage, index) => ({
      installmentNumber: index + 1,
      percentage,
      amount: Math.round((estimateTotal * percentage) / 100),
    }));
  }, [paymentOption, installmentCount, estimateTotal]);

  // Feature IDs the customer actually chose — nothing is added on their behalf.
  const chosenFeatureIds = useMemo(
    () => allFeatures.filter((f) => selectedFeatureIds.includes(f._id)).map((f) => f._id),
    [allFeatures, selectedFeatureIds]
  );

  // Any change to what would be ordered (or the payment shape) invalidates a previously
  // created order, so the next "Proceed" creates a fresh one instead of paying a stale order.
  useEffect(() => {
    setCreatedOrder(null);
  }, [projectCategory, chosenFeatureIds, featureQuantities, paymentOption, installmentCount, couponCode]);

  // Create the order server-side (price is re-derived there). For full/partial the customer
  // has already paid (wallet/UPI), so paymentDetails is passed and the backend creates the
  // order + invoice + the pending payment transaction together — never a payment-less order.
  // Returns the created-order payload on success, throws on failure.
  const createProjectOrder = async (paymentDetails = null) => {
    const requestBody = {
      category: projectCategory,
      featureIds: chosenFeatureIds,
      featureQuantities,
      budget: budget || null,
      ownership: ownership || null,
      paymentType: paymentOption, // 'full' | 'partial' | 'decide_later'
      installmentCount: paymentOption === 'partial' ? installmentCount : undefined,
      couponCode: couponCode || null,
      paymentDetails: paymentDetails || undefined,
    };

    const response = await fetch(SummaryApi.createCustomProjectOrder.url, {
      method: SummaryApi.createCustomProjectOrder.method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to create project request');
    }
    return data.data;
  };

  const handleSubmit = async () => {
    if (submitting) return;

    // Decide-later: create the order (unpaid, no payment step), show success directly.
    if (paymentOption === 'decide_later') {
      try {
        setSubmitting(true);
        await createProjectOrder();
        setShowSuccess(true);
      } catch (error) {
        toast.error(error.message || 'Something went wrong. Please try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Full / Partial: DO NOT create the order here — the order is created only once the
    // customer actually pays (in handleConfirmPayment / handleVerifyUpi). This just opens
    // the confirmation popup, which shows the client estimate until the order exists.
    setShowQR(false);
    setShowPaymentModal(true);
  };

  // Amount to collect now, before the order exists: first-installment split of the client
  // estimate (partial) or the full estimate (full). Byte-aligned with the backend's
  // firstInstallmentAmount. Once the order is created on pay, its exact amount is used.
  const amountDueNow = createdOrder
    ? createdOrder.firstInstallmentAmount || createdOrder.finalPrice
    : paymentOption === 'partial'
    ? Math.round((estimateTotal * splitsFor(installmentCount)[0]) / 100)
    : estimateTotal;

  // Wallet / UPI split for the amount due now. The wallet is the customer's own money, so it
  // is applied first (instantly, no approval); only the remainder needs UPI. These are shown
  // in the popup; the backend independently re-derives the same split from the real balance.
  const walletBalance = context?.walletBalance || 0;
  const walletPart = Math.min(walletBalance, amountDueNow);
  const upiPart = Math.max(0, amountDueNow - walletPart);

  // Create the order + its payment atomically (the customer has already paid). One request —
  // the backend never yields a payment-less order, decides the wallet/UPI split itself, debits
  // the wallet instantly and (for a UPI remainder) records a pending transaction to approve.
  // For a UPI transaction id is sent only when there is a UPI remainder. Returns created order.
  const createOrderWithPayment = async ({ txnId, upiRef }) => {
    const order = await createProjectOrder({
      transactionId: txnId,
      upiTransactionId: upiRef || null,
    });
    setCreatedOrder(order);
    return order;
  };

  // Step 1: customer confirmed the summary popup → start the wallet/UPI payment flow.
  const handleConfirmPayment = async () => {
    if (payProcessing) return;
    try {
      setPayProcessing(true);

      // Wallet covers the whole amount → create + instant wallet debit, auto-approved. No UPI.
      if (upiPart === 0) {
        const txnId = generateTransactionId();
        await createOrderWithPayment({ txnId });
        context?.fetchWalletBalance?.(); // balance was just debited server-side
        setShowPaymentModal(false);
        setShowSuccess(true);
        return;
      }

      // Wallet doesn't fully cover it → show a UPI QR for the remainder only. The wallet part
      // (if any) is debited together with the order once the customer submits the UPI id.
      const txnId = generateTransactionId();
      setPayTxnId(txnId);
      const upiId = 'vacomputers.com@okhdfcbank';
      const payeeName = 'VA Computer';
      const upi = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
        payeeName
      )}&am=${upiPart}&cu=INR&tn=${encodeURIComponent(
        `Order Payment - ${txnId}`
      )}&tr=${txnId}`;
      setUpiLink(upi);
      setShowQR(true);
    } catch (error) {
      toast.error(error.message || 'Payment failed. Please try again.');
    } finally {
      setPayProcessing(false);
    }
  };

  // Step 2 (QR path): customer entered their UPI transaction id → submit for admin approval.
  const handleVerifyUpi = async () => {
    const trimmedUpiId = upiTransactionId.trim();
    if (!trimmedUpiId) {
      toast.error('Please enter your UPI transaction ID');
      return;
    }
    // UPI UTR/reference is 12-digit numeric — enforce at least 12 digits.
    if (!/^\d{12,}$/.test(trimmedUpiId)) {
      toast.error('UPI transaction ID must be at least 12 digits');
      return;
    }
    try {
      setPayProcessing(true);
      // Customer paid the UPI remainder → create the order now; the backend debits any wallet
      // part instantly and records the UPI part as pending for admin approval.
      await createOrderWithPayment({ txnId: payTxnId, upiRef: trimmedUpiId });
      context?.fetchWalletBalance?.(); // a wallet part may have been debited server-side
      setShowQR(false);
      setShowPaymentModal(false);
      setShowSuccess(true);
    } catch (error) {
      toast.error(error.message || 'Verification failed. Please try again.');
    } finally {
      setPayProcessing(false);
    }
  };

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
          {/* Header — open, centered */}
          <div className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={() => navigate('/start-new-project/build/new_website')}
              className="absolute left-0 inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]"
            >
              <ArrowLeft className="h-5 w-5" />
              Back
            </button>

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                {projectLabel}
              </h1>
              <p className="mt-1 text-base text-[var(--text-secondary)] sm:text-lg">Customize your project</p>
            </div>
          </div>

          {/* Full-page glass sheet behind all content — soft, frameless-feeling, overflow-visible */}
          <div className="rounded-[2rem] bg-[var(--glass-bg-subtle)] p-6 backdrop-blur-2xl sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
            {/* LEFT: the requirement form */}
            <div className="flex flex-col gap-10">
              <section>
                <SectionLabel>Your requirement</SectionLabel>
                <p className="mt-2 text-base text-[var(--text-secondary)]">
                  Prefilled from your answers — change anything you like.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Primary project">
                    <SelectDropdown
                      value={projectCategory}
                      options={PROJECT_OPTIONS}
                      onChange={setProjectCategory}
                    />
                  </Field>
                  <Field label="Budget range">
                    <SelectDropdown
                      value={budget}
                      options={BUDGET_OPTIONS}
                      placeholder="Select budget"
                      onChange={setBudget}
                    />
                  </Field>
                  <Field label="Content management">
                    <SelectDropdown
                      value={ownership}
                      options={OWNERSHIP_OPTIONS}
                      placeholder="Select option"
                      onChange={setOwnership}
                    />
                  </Field>
                  <Field label="Payment option">
                    <SelectDropdown
                      value={paymentOption}
                      options={paymentOptions}
                      onChange={setPaymentOption}
                    />
                  </Field>
                </div>

                {/* Partial payment — installment plan chooser + breakdown */}
                {paymentOption === 'partial' && (
                  <div className="mt-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-5">
                    <p className="text-sm font-semibold uppercase tracking-wide text-[var(--eyebrow-fg)]">
                      Installment plan
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Pay in parts as your project progresses. You&apos;ll pay the first
                      installment now; the rest become due later.
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {INSTALLMENT_OPTIONS.map((option) => {
                        const isActive = installmentCount === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setInstallmentCount(option.value)}
                            className={`rounded-xl border px-4 py-3 text-left text-base transition ${
                              isActive
                                ? 'border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] ring-1 ring-[var(--badge-success-fg)] text-[var(--text-primary)]'
                                : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)] hover:border-[var(--glass-border-strong)]'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 divide-y divide-[var(--divider)]">
                      {installmentBreakdown.map((inst) => (
                        <div
                          key={inst.installmentNumber}
                          className="flex items-center justify-between py-2 text-sm"
                        >
                          <span className="text-[var(--text-secondary)]">
                            Installment {inst.installmentNumber} ({inst.percentage}%)
                            {inst.installmentNumber === 1 && (
                              <span className="ml-2 rounded-full border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-2 py-0.5 text-xs text-[var(--badge-success-fg)]">
                                Pay now
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            ₹{inst.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-[var(--badge-pending-fg)]">
                      Amounts shown are estimates. Your final installment amounts are
                      confirmed after your project price is finalized.
                    </p>
                  </div>
                )}
              </section>

              <section className="border-t border-[var(--glass-border)] pt-10">
                <SectionLabel>Capabilities</SectionLabel>
                <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">Choose what your project needs</h2>
                <p className="mt-1 text-base text-[var(--text-secondary)]">
                  Select everything you need, or just the parts that matter.
                </p>
                <div className="mt-5 max-w-xl">
                  <MultiSelectDropdown
                    selectedIds={selectedFeatureIds}
                    options={allFeatures}
                    loading={loading}
                    onToggle={toggleFeature}
                    onRemove={removeFeature}
                    quantities={featureQuantities}
                    onQuantityChange={setFeatureQuantity}
                  />
                </div>
              </section>
            </div>

            {/* RIGHT: estimate + coupon + submit (sticky on desktop) */}
            <div className="lg:border-l lg:border-[var(--glass-border)] lg:pl-14">
              <div className="lg:sticky lg:top-6 flex flex-col gap-10">
                <section>
                  <SectionLabel>Estimated total</SectionLabel>
                  <div className="mt-4 flex items-baseline justify-between gap-4">
                    <span className="text-sm text-[var(--text-muted)]">
                      {selectedCount} capabilit{selectedCount === 1 ? 'y' : 'ies'}
                    </span>
                    <span className="text-3xl font-bold text-[var(--text-primary)]">
                      ₹{estimateTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-[var(--badge-pending-fg)]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--badge-pending-fg)]" strokeWidth={2} />
                    This is an estimate. Your final pricing may differ based on your requirements or
                    offers available to you — not the final price.
                  </p>
                </section>

                <section className="border-t border-[var(--glass-border)] pt-10">
                  <SectionLabel>Coupon / promo code</SectionLabel>
                  <div className="mt-4 flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      className="w-full border-0 border-b border-[var(--glass-border-strong)] bg-transparent px-0 py-2.5 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--badge-success-fg)]"
                    />
                    <button
                      type="button"
                      onClick={() => {}}
                      className="shrink-0 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-5 py-2.5 text-base font-medium text-[var(--text-primary)] backdrop-blur-md transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)]"
                    >
                      Apply
                    </button>
                  </div>
                </section>

                <section className="border-t border-[var(--glass-border)] pt-10">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-8 py-3 text-base font-semibold text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? 'Please wait…'
                      : paymentOption === 'decide_later'
                      ? 'Create Project'
                      : 'Proceed to Payment'}
                  </button>
                </section>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Payment confirmation popup — Full/Partial only (UI-only) */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[var(--glass-bg-subtle)] backdrop-blur-sm"
            onClick={() => setShowPaymentModal(false)}
          />
          <div className="relative w-full max-w-md animate-[fadeSlideUp_0.3s_ease-out_both] overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-7 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

            <button
              type="button"
              onClick={() => setShowPaymentModal(false)}
              className="absolute right-4 top-4 rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-1.5 text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)]"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>

            {!showQR ? (
              <>
                <h3 className="relative text-xl font-semibold text-[var(--text-primary)]">Confirm your project</h3>
                <p className="relative mt-1 text-sm text-[var(--text-secondary)]">
                  Review your selection before you continue to payment.
                </p>

                <div className="relative mt-5 divide-y divide-[var(--divider)]">
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-[var(--text-muted)]">Project</span>
                    <span className="text-right text-sm font-medium text-[var(--text-primary)]">{projectLabel}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4 py-2.5">
                    <span className="text-sm text-[var(--text-muted)]">Capabilities</span>
                    <span className="text-right text-sm font-medium text-[var(--text-primary)]">
                      {selectedCapabilityNames.length
                        ? selectedCapabilityNames.join(', ')
                        : 'None selected'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-[var(--text-muted)]">Payment</span>
                    <span className="text-right text-sm font-medium text-[var(--text-primary)]">
                      {labelOf(PAYMENT_OPTIONS, paymentOption)}
                    </span>
                  </div>
                  {couponCode && (
                    <div className="flex items-baseline justify-between gap-4 py-2.5">
                      <span className="text-sm text-[var(--text-muted)]">Coupon</span>
                      <span className="text-right text-sm font-medium text-[var(--text-primary)]">{couponCode}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <span className="text-sm text-[var(--text-muted)]">
                      {createdOrder ? 'Project price' : 'Estimated total'}
                    </span>
                    <span className="text-right text-lg font-bold text-[var(--text-primary)]">
                      ₹{(createdOrder ? createdOrder.finalPrice : estimateTotal).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {createdOrder && paymentOption === 'partial' && (
                    <div className="flex items-baseline justify-between gap-4 py-2.5">
                      <span className="text-sm text-[var(--badge-success-fg)]">Amount due now (installment 1)</span>
                      <span className="text-right text-lg font-bold text-[var(--badge-success-fg)]">
                        ₹{amountDueNow.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="relative mt-4 flex items-baseline justify-between gap-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3">
                  <span className="text-sm text-[var(--text-secondary)]">Wallet balance</span>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {displayINRCurrency(context?.walletBalance || 0)}
                  </span>
                </div>

                {/* Wallet/UPI split — shown when the wallet is used and doesn't fully cover it */}
                {walletPart > 0 && upiPart > 0 && (
                  <div className="relative mt-3 divide-y divide-[var(--divider)] rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-4 py-2">
                    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                      <span className="text-[var(--text-secondary)]">Paid from wallet (instant)</span>
                      <span className="font-medium text-[var(--badge-success-fg)]">
                        ₹{walletPart.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
                      <span className="text-[var(--text-secondary)]">To pay via UPI</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        ₹{upiPart.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={payProcessing}
                  className="relative mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-5 py-3 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {payProcessing
                    ? 'Processing…'
                    : upiPart === 0
                    ? `Pay ₹${walletPart.toLocaleString('en-IN')} from wallet`
                    : walletPart > 0
                    ? `Pay ₹${walletPart.toLocaleString('en-IN')} wallet + ₹${upiPart.toLocaleString('en-IN')} UPI`
                    : `Pay ₹${upiPart.toLocaleString('en-IN')} with UPI`}
                </button>
              </>
            ) : (
              /* QR step — shown when wallet balance is insufficient */
              <>
                <h3 className="relative text-xl font-semibold text-[var(--text-primary)]">Scan to pay</h3>
                <p className="relative mt-1 text-sm text-[var(--text-secondary)]">
                  Pay ₹{upiPart.toLocaleString('en-IN')} using any UPI app, then enter
                  the UPI reference number from your payment app.
                  {walletPart > 0 && (
                    <span className="mt-1 block text-[var(--badge-success-fg)]">
                      ₹{walletPart.toLocaleString('en-IN')} will be paid from your wallet instantly.
                    </span>
                  )}
                </p>

                <div className="relative mt-5 flex flex-col items-center">
                  {/* White in every theme on purpose — a QR code is read by a camera,
                      which expects dark modules on a white quiet zone. */}
                  <div className="rounded-2xl bg-white p-4">
                    <QRCodeSVG value={upiLink} size={190} />
                  </div>
                </div>

                <label className="relative mt-5 block">
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
                    UPI Reference Number
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={upiTransactionId}
                    onChange={(e) =>
                      setUpiTransactionId(e.target.value.replace(/\D/g, ''))
                    }
                    placeholder="Enter the 12-digit reference number from your UPI app"
                    className="w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition focus:border-[var(--badge-success-fg)]"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleVerifyUpi}
                  disabled={payProcessing || upiTransactionId.trim().length < 12}
                  className="relative mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-5 py-3 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {payProcessing ? 'Submitting…' : 'Send payment for checking'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Success confirmation — shown after Create Project / confirmed payment (UI-only) */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[var(--glass-bg-subtle)] backdrop-blur-sm"
            onClick={() => setShowSuccess(false)}
          />
          <div className="relative w-full max-w-sm animate-[fadeSlideUp_0.3s_ease-out_both] overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-7 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] backdrop-blur-md">
              <CheckCircle2 className="h-8 w-8 text-[var(--badge-success-fg)]" strokeWidth={1.75} />
            </div>

            <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">
              {paymentOption === 'decide_later'
                ? 'Project request submitted'
                : createdOrder?.approved
                ? 'Payment successful — project started'
                : 'Payment submitted for approval'}
            </h3>
            <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
              {paymentOption === 'decide_later'
                ? 'Our team will review your requirement and get in touch with you shortly.'
                : createdOrder?.approved
                ? 'Your wallet payment is complete and your project has started. You can track it from your dashboard.'
                : 'Your payment is being verified. Your project will start once our team approves it (usually within a few hours).'}
            </p>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-6 py-2.5 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)]"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </DashboardLayout>
  );
};

export default StartNewWebsiteCustomize;
