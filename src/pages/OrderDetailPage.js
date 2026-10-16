import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileText } from 'lucide-react';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import { getOrderCategoryLabel, getOrderDisplayName } from '../helpers/orderPresentation';
import { getInstallmentPaymentEligibility } from '../helpers/installmentPaymentEligibility';
import {
  customerChildState,
  goToCustomerReturn,
} from '../helpers/customerReturnNavigation';
import { getInvoiceStatusText, isStatementInvoice, getInvoicePurposeText, isFreeInvoice } from '../helpers/invoicePresentation';

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const INSTALLMENT_LABELS = { 1: 'First Installment', 2: 'Second Installment', 3: 'Final Installment' };

// `tone` used to be a class string: `border-emerald-400/40 bg-emerald-500/20
// text-emerald-300` and friends, chosen for the dark page. On the light page
// that pairing measures 1.21:1 — the label is there but effectively unreadable,
// which is why nobody reported it. It is a Badge tone now, and the tone triple
// inverts the foreground for light mode.
//
// The per-status icons went with them. The portal's status badge — the one on
// the projects list — has never carried an icon, and the same status should not
// have two shapes on two screens.
//
// "Verification Pending" was the system describing its own queue. From the customer's
// side the money has left their hands and someone is looking at it, which is what the
// wording now says.
const getInstallmentStatus = (installment) => {
  if (installment.paid) {
    return { label: 'Paid', tone: 'success' };
  }
  if (installment.paymentStatus === 'pending-approval') {
    return { label: 'Checking your payment', tone: 'pending' };
  }
  if (installment.paymentStatus === 'rejected') {
    return { label: 'Rejected', tone: 'error' };
  }
  return { label: 'Due', tone: 'pending' };
};

// The status wording moved to helpers/invoicePresentation.js — this page and
// InvoiceDetailPage each kept their own copy of it, and PlanDetails kept none and printed
// the database's own word. The statement rule went with it, so "a statement never wears a
// Due badge" is decided once rather than restated per page.

const OrderDetailPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchOrderDetails();
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${SummaryApi.orderDetails.url}/${orderId}`, {
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        setOrder(data.data);
        fetchInvoices();
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const response = await fetch(SummaryApi.myPaymentWorkspace.url, {
        method: SummaryApi.myPaymentWorkspace.method,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        const orderInvoices = (data.data.invoices || []).filter(
          (inv) => String(inv.orderId?._id || inv.orderId) === String(orderId)
        );
        // An order without an invoice must say nothing about billing, never show a made-up bill.
        setInvoices(orderInvoices);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
    }
  };

  // Route to the actual installment-payment page (wallet-instant / UPI / combined, same SSOT
  // path as ProjectDetails.js's PaymentAlert button). `/direct-payment` was the wrong destination
  // — it only reads `location.state.paymentData`/`retryPaymentId`, never the installment shape
  // this used to send, so every click there landed on "Payment information not found" and bounced
  // to the dashboard without ever reaching a payment endpoint.
  const handlePayInstallment = (installment) => {
    navigate(`/installment-payment/${order._id}/${installment.installmentNumber}`, {
      state: customerChildState(location),
    });
  };

  const handleBack = () => goToCustomerReturn(navigate, location, '/order');

  const handleRetryPayment = () => {
    navigate(`/direct-payment`, {
      state: {
        ...customerChildState(location),
        retryPaymentId: order._id,
        productId: order.productId?._id,
        paymentData: {
          product: order.productId,
          selectedFeatures: order.orderItems?.filter(item => item.type === 'feature').map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity || 1,
            sellingPrice: item.originalPrice || 0,
            totalPrice: item.finalPrice || 0,
          })) || [],
          totalPrice: order.price,
          originalTotalPrice: order.originalPrice || order.price,
        },
      },
    });
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

  if (!order) {
    return (
      <DashboardLayout user={user}>
        <div
          className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
        >
          <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
          {/* `bg-emerald-600 text-[var(--text-primary)]` put dark slate text on a
              dark green fill in light mode, and `text-red-400` on the light card
              measures 2.8:1. Both are tokens now. */}
          <Surface radius="panel" className="relative mx-auto max-w-3xl p-8 text-center">
            <h2 className="mb-2 text-lg font-semibold text-[var(--badge-error-fg)]">Order Not Found</h2>
            <p className="mb-4 text-base text-[var(--text-secondary)]">The order you're looking for doesn't exist or you don't have access to it.</p>
            <GlassButton variant="primary" onClick={handleBack}>
              Back to Orders
            </GlassButton>
          </Surface>
        </div>
      </DashboardLayout>
    );
  }

  const isRecurringPlan = order.productId?.category === 'website_updates';

  // An installment project states itself once, in its project_final invoice — total, every
  // installment and what is paid. The installments themselves are payment targets, so this page
  // shows that one list and offers the statement as the single document. Any other order shape
  // (recurring plan, full payment) keeps the original two-card layout below.
  const isInstallmentProject = !isRecurringPlan && order.isPartialPayment && order.installments?.length > 0;
  const projectStatement = invoices.find((invoice) => invoice.invoiceType === 'project_final') || null;
  const installmentsTotal = (order.installments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const startDate = new Date(order.createdAt);
  let endDate = null;
  if (isRecurringPlan) {
    const durationDays = order.productId?.yearlyPlanDuration || 365;
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);
  }

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-4">
          <div className="relative flex items-center justify-center">
            <GlassButton size="lg" onClick={handleBack} className="absolute left-0 shrink-0">
              <ArrowLeft className="h-5 w-5" />
              Back
            </GlassButton>

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
                {getOrderDisplayName(order, 'Plan')}
              </h1>
              <p className="mt-1 text-base text-[var(--text-secondary)] sm:text-lg">
                {getOrderCategoryLabel(order)}
              </p>
            </div>
          </div>

          <Surface radius="panel" sheen className="overflow-hidden p-5 sm:p-6 lg:p-8">

            {isInstallmentProject ? (
              /* Installment project — one section, no sub-cards. The order's own facts (started,
                 payment type, total) sit in the header line rather than a separate snapshot card,
                 and the project_final statement is offered as the single download here instead of
                 an invoice list that repeats every row of the schedule below it. */
              <div className="relative">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {/* Was three separate facts joined by dots — "Started 12 Jun 2026 ·
                      Installments (3) · Total ₹45,000" — which reads as a log entry, and
                      restated the count of a list that is printed directly below it. */}
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">Payments</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      ₹{installmentsTotal.toLocaleString()} in total, paid in parts. Started {formatDate(startDate)}.
                    </p>
                  </div>
                  {projectStatement ? (
                    <GlassButton
                      as="a"
                      href={`${SummaryApi.invoices.downloadDocument.url}/${projectStatement._id}/download`}
                      className="w-fit shrink-0"
                    >
                      <FileText className="h-4 w-4" />
                      Download Invoice
                    </GlassButton>
                  ) : null}
                </div>

                <div className="mt-5 border-t border-[var(--glass-border)]">
                  {order.installments.map((installment) => {
                    const st = getInstallmentStatus(installment);
                    const label = INSTALLMENT_LABELS[installment.installmentNumber] || `Installment #${installment.installmentNumber}`;
                    const { canPay } = getInstallmentPaymentEligibility(
                      order,
                      installment.installmentNumber
                    );
                    return (
                      <div
                        key={installment.installmentNumber}
                        onClick={canPay ? () => handlePayInstallment(installment) : undefined}
                        className={`flex flex-col gap-2 border-b border-[var(--glass-border)] px-1 py-4 sm:flex-row sm:items-center sm:justify-between ${canPay ? 'cursor-pointer hover:bg-[var(--glass-bg-subtle)]' : ''}`}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-medium text-[var(--text-primary)]">{label}</span>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            {installment.paid
                              ? `Paid on ${formatDate(installment.paidDate)}`
                              : `Due on ${formatDate(installment.dueDate)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-[var(--text-primary)]">₹{installment.amount.toLocaleString()}</span>
                          {canPay && <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
            <div className="relative grid w-full grid-cols-1 gap-5 lg:grid-cols-2">

              {/* "Plan Snapshot" was the system naming its own data structure. The card
                  holds dates and how the order is paid, so it says that instead. */}
              <Surface tone="subtle" radius="panel" className="p-5">
                <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Your plan</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                    <span className="text-[var(--text-secondary)]">Start Date</span>
                    <span className="font-medium text-[var(--text-primary)]">{formatDate(startDate)}</span>
                  </div>

                  {isRecurringPlan ? (
                    <>
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                        <span className="text-[var(--text-secondary)]">End Date</span>
                        <span className="font-medium text-[var(--text-primary)]">{formatDate(endDate)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                        <span className="text-[var(--text-secondary)]">Payment Due Date</span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {formatDate(order.monthlyLimitResetDate || order.currentMonthExpiryDate)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                        <span className="text-[var(--text-secondary)]">Payment Cycle</span>
                        <span className="font-medium text-[var(--text-primary)]">Monthly</span>
                      </div>
                    </>
                  ) : (
                    // "Installments (3)" counted the parts inside a field labelled Payment
                    // Method, where the question is how it was paid, not how many rows exist.
                    <div className="flex items-center justify-between rounded-2xl bg-[var(--glass-bg-subtle)] px-4 py-2.5 text-base">
                      <span className="text-[var(--text-secondary)]">How you paid</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {order.isPartialPayment ? 'In parts' : 'In full'}
                      </span>
                    </div>
                  )}
                </div>
              </Surface>

              {/* Invoice history — shown whenever this order has any invoice records */}
              {invoices.length > 0 && (
                <Surface tone="subtle" radius="panel" className="p-5">
                  <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Your bills</h3>
                  <div className="space-y-3">
                    {invoices.map((invoice) => {
                      // A project_final invoice is a statement of the whole project, not an amount
                      // to collect — its installments are billed separately. Showing it a "Due"
                      // badge (its status is unpaid/partially_paid until the last installment
                      // settles) reads as a second, larger bill the customer still owes.
                      const isStatement = isStatementInvoice(invoice);
                      const meta = getInvoiceStatusText(invoice);
                      return (
                        <div
                          key={invoice._id}
                          onClick={() => navigate(`/invoice-detail/${invoice._id}`, {
                            state: customerChildState(location),
                          })}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 transition hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-hover)]"
                        >
                          {/* The row used to lead with the invoice number — the string the
                              system finds the record by, which tells the customer nothing about
                              what the bill is for. It leads with the purpose now, worded by the
                              same helper the plan page uses. The statement line also announced
                              "download available" while the row itself opens the document. */}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {getInvoicePurposeText(invoice, getOrderDisplayName(order, ''))}
                              </span>
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {isStatement
                                ? 'Everything charged on this order'
                                : invoice.status === 'paid'
                                  ? `Paid on ${formatDate(invoice.paidDate)}`
                                  : `Due on ${formatDate(invoice.dueDate)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-[var(--text-primary)]">{isFreeInvoice(invoice) ? 'FREE' : `₹${invoice.amount.toLocaleString()}`}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Surface>
              )}
            </div>
            )}

            {order.orderVisibility === 'payment-rejected' && (
              <Surface tone="subtle" radius="panel" className="relative mt-5 p-5">
                <GlassButton
                  variant="primary"
                  size="lg"
                  onClick={handleRetryPayment}
                  className="w-full sm:w-auto sm:px-8"
                >
                  Retry Payment
                </GlassButton>
              </Surface>
            )}
          </Surface>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default OrderDetailPage;
