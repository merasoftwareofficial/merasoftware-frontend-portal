import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Sparkles, Share2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import SummaryApi from '../common';
import Context from '../context';
import displayINRCurrency from '../helpers/displayCurrency';
import DashboardLayout from '../components/DashboardLayout';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import Modal from '../components/Modal';
import { getOrderDisplayName } from '../helpers/orderPresentation';
import { isPlanItem } from '../helpers/orderType';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';
import { getInvoiceStatusText, isStatementInvoice, getPaymentMethodText } from '../helpers/invoicePresentation';

const generateTransactionId = () =>
  `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// The status wording used to live here as a private copy — OrderDetailPage kept an
// almost-identical one, and PlanDetails kept none and printed the raw database value.
// It now comes from helpers/invoicePresentation.js so one status reads the same on
// every screen. The tones were already Badge tones and are unchanged.

const InvoiceDetailPage = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchInvoice();
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, [invoiceId]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);

      const response = await fetch(SummaryApi.myPaymentWorkspace.url, {
        method: SummaryApi.myPaymentWorkspace.method,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        const found = (data.data.invoices || []).find(
          (inv) => String(inv._id) === String(invoiceId)
        );
        setInvoice(found || null);
      }
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  // ---- Canonical in-page payment (SSOT) ----
  // This page is the single source of truth for paying an invoice. It pays THIS invoice
  // by posting to /wallet/verify-payment with invoiceId + orderId (sourceType: 'invoice'),
  // never creating a second order (the DirectPayment.js duplicate-order path is not used).
  // Every other surface just links here; there is no other Pay Now form.
  const context = useContext(Context);
  const [showPayment, setShowPayment] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [payProcessing, setPayProcessing] = useState(false);
  const [payTxnId, setPayTxnId] = useState('');
  const [upiLink, setUpiLink] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [sharingInvoice, setSharingInvoice] = useState(false);

  const amountDueNow = Math.max(0, Number(invoice?.amount || 0) - Number(invoice?.amountPaid || 0));
  const orderIdForPay = invoice?.orderId?._id || invoice?.orderId;
  const isInstallmentInvoice = Boolean(invoice?.installmentNumber);
  const isStatement = isStatementInvoice(invoice);
  const isServerInvoice = Boolean(invoice?._id);
  const invoiceDocumentUrl = isServerInvoice ? `${SummaryApi.invoices.viewDocument.url}/${invoice._id}` : null;

  const handleShareInvoice = async () => {
    if (!invoiceDocumentUrl || !navigator.share || !navigator.canShare) {
      toast.error('PDF sharing is not supported on this browser. Use Download instead.');
      return;
    }
    try {
      setSharingInvoice(true);
      const response = await fetch(`${invoiceDocumentUrl}/download`, { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to prepare invoice PDF');
      const file = new File([await response.blob()], `${invoice.invoiceNumber || 'invoice'}.pdf`, { type: 'application/pdf' });
      if (!navigator.canShare({ files: [file] })) throw new Error('PDF sharing is not supported on this device');
      await navigator.share({ title: invoice.invoiceNumber || 'Invoice', files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') toast.error(error.message || 'Unable to share invoice');
    } finally {
      setSharingInvoice(false);
    }
  };

  const getInvoiceFallback = () => {
    const order = invoice?.orderId;
    const orderId = order?._id || order;

    if (!orderId) return '/order';
    if (order && typeof order === 'object' && isPlanItem(order)) {
      return `/plan-details/${orderId}`;
    }

    return `/order-detail/${orderId}`;
  };

  const handleBack = () => goToCustomerReturn(navigate, location, getInvoiceFallback());

  // Leaving this page after a payment returns through the customer-navigation SSOT.
  // The marker lets the explicit return page know its data is stale and refetch once.
  const goBackAfterPayment = () => {
    try {
      sessionStorage.setItem('paymentJustSubmitted', String(Date.now()));
    } catch (error) {
      // Private-mode / storage-disabled browsers: the page still falls back to its own polling.
    }
    handleBack();
  };

  const submitVerification = async ({ txnId, upiTransactionId, method }) => {
    const response = await fetch(SummaryApi.wallet.verifyPayment.url, {
      method: SummaryApi.wallet.verifyPayment.method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: txnId,
        amount: amountDueNow,
        upiTransactionId: upiTransactionId || `WALLET-${txnId}`,
        paymentMethod: method,
        sourceType: 'invoice',
        invoiceId: invoice._id,
        orderId: orderIdForPay,
        isInstallmentPayment: isInstallmentInvoice,
        installmentNumber: isInstallmentInvoice ? invoice.installmentNumber : null,
        type: 'payment',
        description: `Payment for invoice ${invoice.invoiceNumber}`,
      }),
    });
    const data = await response.json();
    // An already-submitted transaction is treated as success (same as InstallmentPayment.js).
    if (!data.success && !(data.message || '').includes('already submitted')) {
      throw new Error(data.message || 'Payment verification failed');
    }
  };

  // Wallet covers the due amount → deduct + submit for approval. Else show a UPI QR.
  const handleConfirmPayment = async () => {
    if (payProcessing) return;
    try {
      setPayProcessing(true);
      const walletBalance = context?.walletBalance || 0;

      if (walletBalance >= amountDueNow) {
        // Full wallet cover → instant payment, no admin approval (the wallet is the customer's own,
        // already-approved money). One /wallet/pay-instant call atomically debits the wallet and
        // settles the order/installment server-side.
        const payRes = await fetch(SummaryApi.wallet.payInstant.url, {
          method: SummaryApi.wallet.payInstant.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: orderIdForPay,
            amount: amountDueNow,
            installmentNumber: isInstallmentInvoice ? invoice.installmentNumber : null,
            // Invoice Detail only receives server-backed invoices.
            invoiceId: invoice._id,
          }),
        });
        const payData = await payRes.json();
        if (!payData.success) {
          throw new Error(payData.message || 'Wallet payment failed');
        }
        context?.fetchWalletBalance?.();
        toast.success('Payment successful! Your plan is now active.');
        setShowPayment(false);
        // Tell the explicit return page that its data is stale, so it does not show
        // pre-payment data (for example, ProjectDetails' "Payment Pending" banner).
        goBackAfterPayment();
        return;
      }

      const txnId = generateTransactionId();
      setPayTxnId(txnId);
      const upiId = 'vacomputers.com@okhdfcbank';
      const payeeName = 'VA Computer';
      const upi = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountDueNow}&cu=INR&tn=${encodeURIComponent(`Invoice ${invoice.invoiceNumber}`)}&tr=${txnId}`;
      setUpiLink(upi);
      setShowQR(true);
    } catch (error) {
      toast.error(error.message || 'Payment failed. Please try again.');
    } finally {
      setPayProcessing(false);
    }
  };

  const handleVerifyUpi = async () => {
    if (!upiRef.trim()) {
      toast.error('Please enter your UPI transaction ID');
      return;
    }
    try {
      setPayProcessing(true);
      await submitVerification({ txnId: payTxnId, upiTransactionId: upiRef.trim(), method: 'upi' });
      toast.success('Payment submitted for admin approval.');
      setShowQR(false);
      setShowPayment(false);
      goBackAfterPayment();
    } catch (error) {
      toast.error(error.message || 'Payment verification failed.');
    } finally {
      setPayProcessing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout user={user}>
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <TriangleMazeLoader />
        </div>
      </DashboardLayout>
    );
  }

  if (!invoice) {
    return (
      <DashboardLayout user={user}>
        <div
          className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
        >
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          <Surface radius="panel" className="relative mx-auto max-w-3xl p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold text-[var(--badge-error-fg)]">Invoice Not Found</h2>
            <p className="text-base text-[var(--text-secondary)] mb-4">The invoice you're looking for doesn't exist or you don't have access to it.</p>
            <GlassButton variant="primary" onClick={handleBack}>Back</GlassButton>
          </Surface>
        </div>
      </DashboardLayout>
    );
  }

  const meta = getInvoiceStatusText(invoice);

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="relative flex items-center justify-center">
            <GlassButton size="lg" onClick={handleBack} className="absolute left-0 shrink-0">
              <ChevronLeft className="h-5 w-5" />
              Back
            </GlassButton>

            <div className="text-center">
              {/* "Invoice" is an eyebrow, not a status - it was wearing a green
                  status pill. Same eyebrow treatment as Modal and WalletDetails. */}
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase text-[var(--eyebrow-fg)]">
                <Sparkles className="h-3.5 w-3.5" />
                {isStatement ? 'Summary' : 'Bill'}
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                {getOrderDisplayName(invoice.orderId, 'Your plan')}
              </h1>
            </div>
          </div>

          <div className="flex justify-center">
            <Badge tone={meta.tone} className="px-4 py-2 text-base">{meta.label}</Badge>
          </div>

          <Surface radius="panel" sheen className="relative mx-auto w-full max-w-xl overflow-hidden p-5 sm:p-6">
            <div className="relative space-y-2">
              <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                <span className="text-[var(--text-secondary)]">Amount</span>
                <span className="font-semibold text-[var(--text-primary)]">₹{invoice.amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                <span className="text-[var(--text-secondary)]">Invoice Date</span>
                <span className="font-medium text-[var(--text-primary)]">{formatDate(invoice.invoiceDate)}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                <span className="text-[var(--text-secondary)]">Due Date</span>
                <span className="font-medium text-[var(--text-primary)]">{formatDate(invoice.dueDate)}</span>
              </div>
              {invoice.status === 'paid' && (
                <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                  <span className="text-[var(--text-secondary)]">Paid Date</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatDate(invoice.paidDate)}</span>
                </div>
              )}
              {invoice.paymentMethod && (
                <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                  <span className="text-[var(--text-secondary)]">How you paid</span>
                  <span className="font-medium text-[var(--text-primary)]">{getPaymentMethodText(invoice.paymentMethod)}</span>
                </div>
              )}
            </div>

            <div className="relative mt-5">
              {/* Only a statement is a document to keep: the project_final invoice already states
                  the whole project — its total, every installment and what is paid — so a paid
                  installment needs no PDF of its own. An installment invoice is a payment target,
                  never a document, so once it is paid this block simply renders nothing. */}
              {isStatement ? (
                invoiceDocumentUrl && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* Three buttons, three hand-written styles - and the two
                        ghost ones were `text-emerald-100`, very nearly white on
                        the light page. */}
                    <GlassButton as="a" size="lg" href={`${invoiceDocumentUrl}/view`} target="_blank" rel="noopener noreferrer">View Invoice</GlassButton>
                    <GlassButton as="a" size="lg" variant="primary" href={`${invoiceDocumentUrl}/download`}>Download Invoice</GlassButton>
                    <GlassButton size="lg" onClick={handleShareInvoice} disabled={sharingInvoice} className="disabled:opacity-60"><Share2 size={17} />{sharingInvoice ? 'Preparing…' : 'Share'}</GlassButton>
                  </div>
                )
              ) : (
                invoice.status !== 'cancelled' && !isStatement && amountDueNow > 0 && (
                  <GlassButton
                    variant="primary"
                    size="lg"
                    onClick={() => { setShowPayment(true); setShowQR(false); }}
                    className="w-full"
                  >
                    Pay Now
                  </GlassButton>
                )
              )}
            </div>
          </Surface>
        </div>
      </div>

      {/* The portal's first migrated dialog.
          Before: a hand-written overlay with its own scrim (bg-black/60, while
          the loader overlay on this same page used bg-black/10), its own panel,
          no Escape key, no scroll lock, and four buttons in two hand-written
          styles. Modal supplies the scrim, the panel, Escape and the scroll
          lock; the two states just swap title, body and footer. */}
      <Modal
        open={showPayment}
        onClose={payProcessing ? undefined : () => { setShowPayment(false); setShowQR(false); }}
        eyebrow="Payment"
        title={showQR ? `Scan & Pay ${displayINRCurrency(amountDueNow)}` : `Pay ${displayINRCurrency(amountDueNow)}`}
        footer={showQR ? (
          <div className="flex gap-3">
            <GlassButton onClick={() => setShowQR(false)} disabled={payProcessing} className="flex-1 disabled:opacity-60" strong>
              Back
            </GlassButton>
            <GlassButton variant="primary" onClick={handleVerifyUpi} disabled={payProcessing} className="flex-1 disabled:opacity-60">
              {payProcessing ? 'Submitting...' : 'Submit for Approval'}
            </GlassButton>
          </div>
        ) : (
          <div className="flex gap-3">
            <GlassButton onClick={() => setShowPayment(false)} disabled={payProcessing} className="flex-1 disabled:opacity-60" strong>
              Cancel
            </GlassButton>
            <GlassButton variant="primary" onClick={handleConfirmPayment} disabled={payProcessing} className="flex-1 disabled:opacity-60">
              {payProcessing
                ? 'Processing...'
                : (context?.walletBalance || 0) >= amountDueNow
                  ? 'Pay from Wallet'
                  : 'Continue to UPI'}
            </GlassButton>
          </div>
        )}
      >
        {!showQR ? (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Amount due</span>
                <span className="font-semibold text-[var(--text-primary)]">{displayINRCurrency(amountDueNow)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Wallet balance</span>
                {/* A balance is a number, not a status - it was green. */}
                <span className="font-semibold text-[var(--text-primary)]">{displayINRCurrency(context?.walletBalance || 0)}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {(context?.walletBalance || 0) >= amountDueNow
                ? 'Your wallet covers this amount. It will be deducted and sent for admin approval.'
                : 'Not enough wallet balance - you will pay via UPI QR next.'}
            </p>
          </>
        ) : (
          <>
            {/* The QR keeps its white plate on purpose: scanners need the
                quiet zone, so this one white block is functional. */}
            <div className="flex justify-center rounded-2xl bg-white p-4">
              <QRCodeSVG value={upiLink} size={190} />
            </div>
            <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]" htmlFor="upi-ref">
              UPI Transaction ID
            </label>
            <input
              id="upi-ref"
              type="text"
              value={upiRef}
              onChange={(event) => setUpiRef(event.target.value)}
              placeholder="Enter the UPI reference after paying"
              className="mt-1.5 w-full rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg-subtle)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--badge-success-border)] focus:outline-none focus:ring-4 focus:ring-[var(--badge-success-bg)]"
            />
          </>
        )}
      </Modal>
    </DashboardLayout>
  );
};

export default InvoiceDetailPage;
