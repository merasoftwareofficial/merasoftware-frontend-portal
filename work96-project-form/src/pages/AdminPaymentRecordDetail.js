import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Eye, Mail, Send, Share2, Wallet } from "lucide-react";
import { toast } from "sonner";
import SummaryApi from "../common";
import { downloadAuthenticatedFile } from "../helpers/downloadFile";
import AdminLayout from "../components/AdminLayout";
import { getTransactionPaymentLabel } from "../helpers/paymentLedger";
import { getOrderDisplayName } from "../helpers/orderPresentation";
import { getPaymentMethodText } from "../helpers/invoicePresentation";
import { adminReturnState, getAdminReturnTarget } from "../helpers/adminReturnNavigation";

const safeDateTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value) => {
  const parsed = safeDateTime(value);
  return parsed ? parsed.toLocaleString("en-IN") : "N/A";
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const getLedgerStatusLabel = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (["completed", "paid", "approved"].includes(normalizedStatus)) return "Paid";
  if (["pending", "pending-approval", "unpaid", "overdue"].includes(normalizedStatus)) return "Pending";
  if (["rejected", "failed", "cancelled", "canceled"].includes(normalizedStatus)) return "Rejected";
  return status ? String(status).replace(/_/g, " ") : "N/A";
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const getOrdinal = (n) => ORDINALS[n - 1] || `${n}th`;

const getPaymentLabel = (transaction, invoice) => {
  if (transaction) return getTransactionPaymentLabel(transaction);
  if (invoice?.invoiceType === "plan_renewal") return "Plan Renewal";
  if (invoice?.installmentNumber) return `${getOrdinal(invoice.installmentNumber)} Installment`;
  return "Invoice";
};

const getBadgeClassName = (label) => {
  switch ((label || "").toLowerCase()) {
    case "paid":
      return "bg-emerald-100 text-emerald-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const reminderTemplates = {
  gentle: "This is a friendly reminder that your invoice payment is still pending. Please clear the payment at your earliest convenience.",
  overdue: "Your invoice is overdue. Please clear the pending payment to avoid interruption in service processing.",
  final: "This is a final reminder for your pending invoice payment. Please complete the payment as soon as possible.",
};

const InfoLine = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "N/A"}</p>
  </div>
);

const SinglePaymentRecordDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerId, recordType, recordId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [actionLoading, setActionLoading] = useState("");
  const [template, setTemplate] = useState("gentle");
  const [customMessage, setCustomMessage] = useState(reminderTemplates.gentle);
  const [markPaidMethod, setMarkPaidMethod] = useState("upi");
  const [markPaidReference, setMarkPaidReference] = useState("");
  const [markPaidNote, setMarkPaidNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);

  const transaction = record?.transaction || null;
  const invoice = record?.invoice || null;
  const primaryStatus = getLedgerStatusLabel(transaction?.status || invoice?.status);
  const canUseInvoiceActions = Boolean(invoice?._id);
  const canSendReminder = Boolean(invoice?._id && ["unpaid", "overdue"].includes(invoice?.status));
  const canMarkPaid = Boolean(invoice?._id && ["unpaid", "overdue"].includes(invoice?.status));
  const canApproveReject = Boolean(transaction?.transactionId && transaction?.status === "pending");
  const serviceName = getOrderDisplayName(transaction?.orderId || invoice?.orderId, "");
  const paymentLabel = getPaymentLabel(transaction, invoice);
  const title = serviceName ? `${serviceName} — ${paymentLabel}` : paymentLabel;
  const amount = transaction?.amount ?? invoice?.amount ?? 0;

  const baseActionUrl = useMemo(
    () => `${SummaryApi.adminPaymentRecord.url}/${customerId}/payment-records/${recordType}/${recordId}`,
    [customerId, recordType, recordId]
  );

  useEffect(() => {
    let isMounted = true;

    const loadRecord = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(baseActionUrl, {
          method: SummaryApi.adminPaymentRecord.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();

        if (!result.success) {
          throw new Error(result.message || "Failed to load payment record");
        }

        if (isMounted) {
          setRecord(result.data || null);
        }
      } catch (loadError) {
        if (!isMounted) return;
        console.error("Error loading payment record:", loadError);
        setError(loadError.message || "Failed to load payment record");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRecord();
    return () => {
      isMounted = false;
    };
  }, [baseActionUrl]);

  useEffect(() => {
    if (!invoice) return;
    setMarkPaidMethod(invoice.paymentMethod || "upi");
    setMarkPaidReference(invoice.transactionReference || "");
    setMarkPaidNote(invoice.internalNote || "");
  }, [invoice]);

  const handleDownloadInvoice = async () => {
    if (!canUseInvoiceActions || actionLoading) return;

    try {
      setActionLoading("download");
      await downloadAuthenticatedFile(
        `${baseActionUrl}/download-invoice`,
        `${(serviceName || "Invoice").replace(/[^\w\s-]/g, "").trim()}.pdf`,
      );
      toast.success("Invoice download started");
    } catch (downloadError) {
      console.error("Error downloading invoice:", downloadError);
      toast.error(downloadError.message || "Failed to download invoice");
    } finally {
      setActionLoading("");
    }
  };

  const handleResendInvoice = async () => {
    if (!canUseInvoiceActions || actionLoading) return;

    try {
      setActionLoading("resend");
      const response = await fetch(`${baseActionUrl}/resend-invoice`, {
        method: "post",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to resend invoice");
      }

      toast.success(result.message || "Invoice email resent");
    } catch (resendError) {
      console.error("Error resending invoice:", resendError);
      toast.error(resendError.message || "Failed to resend invoice");
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveTransaction = async () => {
    if (!canApproveReject || actionLoading) return;

    try {
      setActionLoading("approve");
      const response = await fetch(SummaryApi.wallet.approveTransaction.url, {
        method: SummaryApi.wallet.approveTransaction.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.transactionId }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to approve payment");
      }

      setRecord((prev) => ({
        ...prev,
        transaction: result.data?.transaction || prev?.transaction,
        invoice: result.data?.invoice || prev?.invoice,
      }));
      toast.success(result.message || "Payment approved");
    } catch (approveError) {
      console.error("Error approving transaction:", approveError);
      toast.error(approveError.message || "Failed to approve payment");
    } finally {
      setActionLoading("");
    }
  };

  const handleRejectTransaction = async () => {
    if (!canApproveReject || actionLoading) return;

    if (!rejectionReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      setActionLoading("reject");
      const response = await fetch(SummaryApi.wallet.rejectTransaction.url, {
        method: SummaryApi.wallet.rejectTransaction.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transaction.transactionId,
          rejectionReason: rejectionReason.trim(),
        }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to reject payment");
      }

      setRecord((prev) => ({
        ...prev,
        transaction: result.data?.transaction || prev?.transaction,
      }));
      setRejectionReason("");
      toast.success(result.message || "Payment rejected");
    } catch (rejectError) {
      console.error("Error rejecting transaction:", rejectError);
      toast.error(rejectError.message || "Failed to reject payment");
    } finally {
      setActionLoading("");
    }
  };

  const handleMarkPaid = async () => {
    if (!canMarkPaid || actionLoading) return;

    try {
      setActionLoading("markPaid");
      const response = await fetch(`${SummaryApi.invoices.markInvoiceAsPaid.url}/${invoice._id}/mark-paid`, {
        method: SummaryApi.invoices.markInvoiceAsPaid.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: markPaidMethod,
          transactionReference: markPaidReference.trim(),
          internalNote: markPaidNote.trim(),
        }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to mark invoice as paid");
      }

      setRecord((prev) => ({
        ...prev,
        transaction: result.data?.transaction || prev?.transaction,
        invoice: result.data?.invoice || prev?.invoice,
      }));
      toast.success(result.message || "Invoice marked as paid");
    } catch (markPaidError) {
      console.error("Error marking invoice paid:", markPaidError);
      toast.error(markPaidError.message || "Failed to mark invoice as paid");
    } finally {
      setActionLoading("");
    }
  };

  const handleTemplateChange = (event) => {
    const nextTemplate = event.target.value;
    setTemplate(nextTemplate);
    setCustomMessage(reminderTemplates[nextTemplate] || reminderTemplates.gentle);
  };

  const handleSendReminder = async () => {
    if (!canSendReminder || actionLoading) return;

    try {
      setActionLoading("reminder");
      const response = await fetch(`${baseActionUrl}/reminder`, {
        method: "post",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template,
          message: customMessage.trim(),
        }),
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Failed to send reminder");
      }

      setRecord((prev) => ({
        ...prev,
        invoice: result.data?.invoice || prev?.invoice,
      }));
      toast.success(result.message || "Payment reminder sent");
    } catch (reminderError) {
      console.error("Error sending reminder:", reminderError);
      toast.error(reminderError.message || "Failed to send reminder");
    } finally {
      setActionLoading("");
    }
  };

  // Returning to the workspace's Payments tab is a step BACK, not a new screen, so it
  // replaces this entry instead of pushing another one. Pushing was why Back appeared to
  // do nothing on the first press and then jumped past the workspace on the second.
  // The workspace's own return target is carried through, so Back from there still
  // reaches whichever parent opened the client (clients list or dashboard).
  const handleBackToPayments = () => {
    // Which tab the workspace opens on is a URL param now, not location.state — the workspace
    // derives activeTab from ?tab=. The return target stays in state; it is not navigation
    // state of that page, it is where that page's own Back should go.
    navigate(`/admin-panel/clients/${customerId}?tab=payments`, {
      replace: true,
      state: adminReturnState(getAdminReturnTarget(location, "/admin-panel/clients")),
    });
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <button
            type="button"
            onClick={() => handleBackToPayments()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Payments
          </button>

          {loading ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Loading payment record...
            </div>
          ) : error ? (
            <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <>
              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-500">
                      <Wallet size={14} />
                      {recordType === "transaction" ? "Transaction Detail" : "Invoice Detail"}
                    </div>
                    <h1 className="mt-4 break-words text-2xl font-bold text-slate-900">{title}</h1>
                  </div>
                  <div className="text-left lg:text-right">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(primaryStatus)}`}>
                      {primaryStatus}
                    </span>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(amount)}</p>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-5">
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-slate-900">Transaction</h2>
                    {transaction ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoLine label="Status" value={getLedgerStatusLabel(transaction.status)} />
                        <InfoLine label="Payment Method" value={getPaymentMethodText(transaction.paymentMethod)} />
                        <InfoLine label="Date" value={formatDateTime(transaction.date || transaction.createdAt)} />
                        <InfoLine label="Verified By" value={transaction.verifiedBy?.name || transaction.verifiedBy?.email} />
                        <InfoLine label="Rejection Reason" value={transaction.rejectionReason} />
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Transaction is not created yet for this pending invoice.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-slate-900">Invoice</h2>
                    {invoice ? (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoLine label="Status" value={getLedgerStatusLabel(invoice.status)} />
                        <InfoLine label="Plan" value={getOrderDisplayName(invoice.orderId, "N/A")} />
                        <InfoLine label="Due Date" value={formatDateTime(invoice.dueDate)} />
                        <InfoLine label="Invoice Date" value={formatDateTime(invoice.invoiceDate)} />
                        <InfoLine label="Paid Date" value={formatDateTime(invoice.paidDate)} />
                        <InfoLine label="Reminders Sent" value={invoice.remindersSent ?? 0} />
                        <InfoLine label="Last Reminder" value={formatDateTime(invoice.lastReminderDate)} />
                        <InfoLine label="Admin Note (internal only)" value={invoice.internalNote} />
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        No invoice is linked with this legacy payment record.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-slate-900">Actions</h2>
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        onClick={handleDownloadInvoice}
                        disabled={!canUseInvoiceActions || Boolean(actionLoading)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Download size={16} />
                        {actionLoading === "download" ? "Preparing..." : "Download Invoice"}
                      </button>
                      <button
                        type="button"
                        onClick={handleResendInvoice}
                        disabled={!canUseInvoiceActions || Boolean(actionLoading)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Mail size={16} />
                        {actionLoading === "resend" ? "Sending..." : "Resend Invoice Email"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-slate-900">Payment Status Action</h2>
                    {canApproveReject ? (
                      <div className="mt-4 space-y-4">
                        <button
                          type="button"
                          onClick={() => setConfirmAction("approve")}
                          disabled={Boolean(actionLoading)}
                          className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "approve" ? "Approving..." : "Accept Payment"}
                        </button>
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Reject reason</span>
                          <textarea
                            value={rejectionReason}
                            onChange={(event) => setRejectionReason(event.target.value)}
                            disabled={Boolean(actionLoading)}
                            rows={3}
                            placeholder="Wrong UPI reference, amount mismatch, duplicate payment, etc."
                            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setConfirmAction("reject")}
                          disabled={Boolean(actionLoading) || !rejectionReason.trim()}
                          className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "reject" ? "Rejecting..." : "Reject Payment"}
                        </button>
                      </div>
                    ) : canMarkPaid ? (
                      <div className="mt-4 space-y-4">
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Payment method</span>
                          <select
                            value={markPaidMethod}
                            onChange={(event) => setMarkPaidMethod(event.target.value)}
                            disabled={Boolean(actionLoading)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="upi">UPI</option>
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="cash">Cash</option>
                            <option value="wallet">Wallet</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Transaction reference</span>
                          <input
                            type="text"
                            value={markPaidReference}
                            onChange={(event) => setMarkPaidReference(event.target.value)}
                            disabled={Boolean(actionLoading)}
                            placeholder="UPI ID or bank reference"
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-semibold text-slate-700">Admin note (internal only, not shown to customer)</span>
                          <textarea
                            value={markPaidNote}
                            onChange={(event) => setMarkPaidNote(event.target.value)}
                            disabled={Boolean(actionLoading)}
                            rows={3}
                            placeholder="e.g. Collected cash in person, verified by phone"
                            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleMarkPaid}
                          disabled={Boolean(actionLoading)}
                          className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionLoading === "markPaid" ? "Saving..." : "Record Payment"}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        No payment approval action is available for this record status.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-bold text-slate-900">Payment Reminder</h2>
                    <div className="mt-4 space-y-4">
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Template</span>
                        <select
                          value={template}
                          onChange={handleTemplateChange}
                          disabled={!canSendReminder || Boolean(actionLoading)}
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="gentle">Gentle reminder</option>
                          <option value="overdue">Overdue reminder</option>
                          <option value="final">Final reminder</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-semibold text-slate-700">Message</span>
                        <textarea
                          value={customMessage}
                          onChange={(event) => setCustomMessage(event.target.value)}
                          disabled={!canSendReminder || Boolean(actionLoading)}
                          rows={5}
                          className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleSendReminder}
                        disabled={!canSendReminder || Boolean(actionLoading) || !customMessage.trim()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send size={16} />
                        {actionLoading === "reminder" ? "Sending..." : "Send Reminder"}
                      </button>
                    </div>
                    {!canSendReminder ? (
                      <p className="mt-3 text-xs text-slate-500">
                        Reminder is available only for unpaid or overdue invoices.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {confirmAction ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm rounded-[1.5rem] bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-900">
              {confirmAction === "approve" ? "Approve this payment?" : "Reject this payment?"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {confirmAction === "approve"
                ? `This will accept the payment of ${formatCurrency(amount)} and cannot be undone from here.`
                : "This will reject the payment with the reason entered above."}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={Boolean(actionLoading)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmAction === "approve") {
                    await handleApproveTransaction();
                  } else {
                    await handleRejectTransaction();
                  }
                  setConfirmAction(null);
                }}
                disabled={Boolean(actionLoading)}
                className={[
                  "rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60",
                  confirmAction === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
                ].join(" ")}
              >
                {actionLoading ? "Please wait..." : "Yes, Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
};

const getOrderReference = (value) => String(value?._id || value || "");

const getInvoiceLabel = (invoice) => {
  if (invoice?.invoiceType === "project_final") return "Final Project Invoice";
  if (invoice?.invoiceType === "service_statement") return "Service Billing Statement";
  if (invoice?.installmentNumber) return `${getOrdinal(invoice.installmentNumber)} Installment Invoice`;
  if (invoice?.invoiceType === "plan_renewal") return "Plan Renewal Invoice";
  return "Invoice";
};

const PaymentOrderHistory = ({ customerId, orderId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [finalInvoiceAction, setFinalInvoiceAction] = useState("");
  const isGeneralPayments = orderId === "general";

  useEffect(() => {
    let isMounted = true;

    const loadWorkspace = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`${SummaryApi.adminUserWorkspace.url}?customerId=${customerId}`, {
          method: SummaryApi.adminUserWorkspace.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.message || "Failed to load payment history");
        if (isMounted) setWorkspace(result.data || null);
      } catch (loadError) {
        if (!isMounted) return;
        console.error("Error loading payment history:", loadError);
        setError(loadError.message || "Failed to load payment history");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadWorkspace();
    return () => {
      isMounted = false;
    };
  }, [customerId, reloadKey]);

  const { order, invoices, finalInvoice, transactions, serviceName, invoiceValue, recordedPayments, pendingRecords, initialProjectInvoiceId } = useMemo(() => {
    const allOrders = workspace?.orders || [];
    const allInvoices = workspace?.invoices || [];
    const allTransactions = workspace?.transactions || [];
    const matchesOrder = (record) => {
      const linkedOrderId = getOrderReference(record?.orderId);
      return isGeneralPayments ? !linkedOrderId : linkedOrderId === String(orderId);
    };
    const matchingInvoices = allInvoices.filter(matchesOrder).sort(
      (left, right) => new Date(right.invoiceDate || right.createdAt || 0) - new Date(left.invoiceDate || left.createdAt || 0)
    );
    const matchingTransactions = allTransactions.filter(matchesOrder).sort(
      (left, right) => new Date(right.date || right.createdAt || 0) - new Date(left.date || left.createdAt || 0)
    );
    const matchingOrder = isGeneralPayments
      ? null
      : allOrders.find((candidate) => String(candidate?._id) === String(orderId)) || null;
    const resolvedServiceName = isGeneralPayments
      ? "Wallet & General Payments"
      : getOrderDisplayName(matchingOrder || matchingInvoices[0]?.orderId || matchingTransactions[0]?.orderId, "Payment History");
    const projectFinalInvoice = matchingInvoices.find((current) => current.invoiceType === "project_final") || null;
    const serviceStatement = matchingInvoices.find((current) => current.invoiceType === "service_statement") || null;
    const paymentInvoices = matchingInvoices.filter((current) => !["project_final", "service_statement"].includes(current.invoiceType));
    const totalInvoiceValue = paymentInvoices.reduce((sum, current) => sum + Number(current.amount || 0), 0);
    const totalRecordedPayments = matchingTransactions
      .filter((current) => current.status === "completed")
      .reduce((sum, current) => sum + Number(current.amount || 0), 0);
    const totalPendingRecords = matchingInvoices.filter((current) => ["unpaid", "partially_paid", "overdue"].includes(current.status)).length
      + matchingTransactions.filter((current) => current.status === "pending").length;
    const firstPendingProjectInvoice = matchingInvoices
      .filter((current) => current.invoiceType === "project" && ["unpaid", "overdue"].includes(current.status))
      .sort((left, right) => Number(left.installmentNumber || 1) - Number(right.installmentNumber || 1))[0];

    return {
      order: matchingOrder,
      invoices: paymentInvoices,
      finalInvoice: projectFinalInvoice || serviceStatement,
      transactions: matchingTransactions,
      serviceName: resolvedServiceName,
      invoiceValue: totalInvoiceValue,
      recordedPayments: totalRecordedPayments,
      pendingRecords: totalPendingRecords,
      initialProjectInvoiceId: firstPendingProjectInvoice?._id || null,
    };
  }, [isGeneralPayments, orderId, workspace]);

  // Opening another record from this list is sideways movement at the same level, not a
  // drill-down, so it replaces this entry rather than stacking one per record viewed.
  // Back then still returns to Payments in a single press, however many records were opened.
  const openRecord = (kind, recordId) => {
    navigate(`/admin-panel/clients/${customerId}/payments/${kind}/${recordId}`, {
      replace: true,
      state: adminReturnState(getAdminReturnTarget(location, "/admin-panel/clients")),
    });
  };

  const handleFinalInvoiceDownload = async () => {
    if (!finalInvoice || finalInvoiceAction) return;
    try {
      setFinalInvoiceAction("download");
      // One document endpoint for every invoice type — the backend decides the layout from the
      // invoice's own type, so the admin and the customer download the identical PDF.
      await downloadAuthenticatedFile(
        `${SummaryApi.invoices.downloadDocument.url}/${finalInvoice._id}/download`,
        `${(serviceName || "Invoice").replace(/[^\w\s-]/g, "").trim()} - Summary.pdf`,
      );
      toast.success("Final invoice download started");
    } catch (error) {
      toast.error(error.message || "Failed to download final invoice");
    } finally {
      setFinalInvoiceAction("");
    }
  };

  const handleFinalInvoiceView = () => {
    if (!finalInvoice || finalInvoiceAction) return;
    window.open(`${SummaryApi.invoices.viewDocument.url}/${finalInvoice._id}/view`, "_blank", "noopener,noreferrer");
  };

  const handleFinalInvoiceNativeShare = async () => {
    if (!finalInvoice || finalInvoiceAction) return;
    if (!navigator.share || !navigator.canShare) {
      toast.error("Native PDF sharing is not supported on this browser. Use Download instead.");
      return;
    }
    try {
      setFinalInvoiceAction("nativeShare");
      const response = await fetch(`${SummaryApi.invoices.downloadDocument.url}/${finalInvoice._id}/download`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Failed to prepare final invoice");
      const file = new File([await response.blob()], `${(serviceName || "Invoice").replace(/[^\w\s-]/g, "").trim()} - Summary.pdf`, { type: "application/pdf" });
      if (!navigator.canShare({ files: [file] })) throw new Error("Native PDF sharing is not supported on this device");
      await navigator.share({ title: serviceName || "Invoice", files: [file] });
    } catch (error) {
      if (error.name !== "AbortError") toast.error(error.message || "Failed to share final invoice");
    } finally {
      setFinalInvoiceAction("");
    }
  };

  const handleFinalInvoiceShare = async () => {
    if (!finalInvoice || finalInvoiceAction) return;
    if (finalInvoice.invoiceType !== "project_final") return;
    try {
      setFinalInvoiceAction("share");
      const response = await fetch(`${SummaryApi.projectFinalInvoice.url}/${finalInvoice._id}/resend`, { method: "post", credentials: "include" });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to share final invoice");
      toast.success(result.message || "Final invoice shared by email");
    } catch (error) {
      toast.error(error.message || "Failed to share final invoice");
    } finally {
      setFinalInvoiceAction("");
    }
  };

  const openAction = (type, record) => {
    setActionTarget({ type, record });
    setPaymentMethod(record?.paymentMethod || "upi");
    setPaymentReference(record?.transactionReference || record?.upiTransactionId || "");
    setPaymentNote("");
    setRejectionReason("");
  };

  const closeAction = () => {
    if (!actionSubmitting) setActionTarget(null);
  };

  const completeAction = async (decision) => {
    if (!actionTarget || actionSubmitting) return;
    const { type, record } = actionTarget;

    if (["transaction", "projectApproval"].includes(type) && decision === "reject" && !rejectionReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      setActionSubmitting(true);
      let response;

      if (type === "transaction") {
        const settleId = record.transactionId;
        response = await fetch(
          decision === "approve" ? SummaryApi.wallet.approveTransaction.url : SummaryApi.wallet.rejectTransaction.url,
          {
            method: decision === "approve" ? SummaryApi.wallet.approveTransaction.method : SummaryApi.wallet.rejectTransaction.method,
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              decision === "approve"
                ? { transactionId: settleId }
                : { transactionId: settleId, rejectionReason: rejectionReason.trim() }
            ),
          }
        );
      } else if (type === "planInvoice") {
        response = await fetch(`${SummaryApi.invoices.markInvoiceAsPaid.url}/${record._id}/mark-paid`, {
          method: SummaryApi.invoices.markInvoiceAsPaid.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod,
            transactionReference: paymentReference.trim(),
            internalNote: paymentNote.trim(),
          }),
        });
      } else {
        response = await fetch(`${SummaryApi.approveProjectOrder.url}/${order._id}/approval`, {
          method: SummaryApi.approveProjectOrder.method,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            decision === "record"
              ? {
                  mode: "approve_with_payment",
                  paymentMethod,
                  transactionReference: paymentReference.trim(),
                  notes: paymentNote.trim(),
                }
              : { mode: "reject", rejectionReason: rejectionReason.trim() }
          ),
        });
      }

      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Payment action failed");

      toast.success(result.message || "Payment record updated");
      setActionTarget(null);
      setReloadKey((current) => current + 1);
    } catch (actionError) {
      console.error("Error updating payment record:", actionError);
      toast.error(actionError.message || "Payment action failed");
    } finally {
      setActionSubmitting(false);
    }
  };

  // Same contract as the single-record view: Back to Payments is a step back, so it
  // replaces this history entry and forwards the workspace's own return target.
  const handleBackToPayments = () => {
    // Which tab the workspace opens on is a URL param now, not location.state — the workspace
    // derives activeTab from ?tab=. The return target stays in state; it is not navigation
    // state of that page, it is where that page's own Back should go.
    navigate(`/admin-panel/clients/${customerId}?tab=payments`, {
      replace: true,
      state: adminReturnState(getAdminReturnTarget(location, "/admin-panel/clients")),
    });
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <button
            type="button"
            onClick={() => handleBackToPayments()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Payments
          </button>

          {loading ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Loading payment history...</div>
          ) : error ? (
            <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>
          ) : (
            <>
              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Project / Plan Payment History</p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">{serviceName}</h1>
                <p className="mt-2 text-sm text-slate-500">All invoices and payment requests linked to this {isGeneralPayments ? "customer account" : "project or plan"}.</p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <InfoLine label="Invoice value" value={formatCurrency(invoiceValue)} />
                  <InfoLine label="Recorded payments" value={formatCurrency(recordedPayments)} />
                  <InfoLine label="Pending records" value={pendingRecords} />
                </div>
              </section>

              {finalInvoice ? (
                <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Summary</p>
                      <h2 className="mt-2 text-lg font-bold text-slate-900">{finalInvoice.invoiceType === "service_statement" ? "Total for this plan" : "Total for this project"}</h2>
                      <p className="mt-1 text-sm text-slate-600">Paid {formatCurrency(finalInvoice.amountPaid)} of {formatCurrency(finalInvoice.amount)}</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-800">{Number(finalInvoice.amount || 0) - Number(finalInvoice.amountPaid || 0) > 0 ? `${formatCurrency(Number(finalInvoice.amount || 0) - Number(finalInvoice.amountPaid || 0))} still to come` : "Fully paid"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleFinalInvoiceView} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-60"><Eye size={15} />View</button>
                      <button type="button" onClick={handleFinalInvoiceDownload} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"><Download size={15} />{finalInvoiceAction === "download" ? "Preparing..." : "Download"}</button>
                      <button type="button" onClick={handleFinalInvoiceNativeShare} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-60"><Share2 size={15} />{finalInvoiceAction === "nativeShare" ? "Preparing..." : "Share PDF"}</button>
                      {finalInvoice.invoiceType === "project_final" ? <button type="button" onClick={handleFinalInvoiceShare} disabled={Boolean(finalInvoiceAction)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-60"><Mail size={15} />{finalInvoiceAction === "share" ? "Sharing..." : "Email"}</button> : null}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Invoices</h2>
                    <p className="mt-1 text-sm text-slate-500">Every invoice for this project or plan.</p>
                  </div>
                </div>
                {invoices.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No invoices found.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                    {invoices.map((current) => {
                      const isRecurringPlanInvoice = current.invoiceType !== "project";
                      const canRecordPlanInvoice = isRecurringPlanInvoice && ["unpaid", "overdue"].includes(current.status);
                      const canResolvePendingProject = current.invoiceType === "project"
                        && order?.orderVisibility === "pending-approval"
                        && transactions.length === 0
                        && String(current._id) === String(initialProjectInvoiceId);

                      return (
                      <div key={current._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{getInvoiceLabel(current)}</p>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(getLedgerStatusLabel(current.status))}`}>{getLedgerStatusLabel(current.status)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">Due {formatDateTime(current.dueDate)} · Issued {formatDateTime(current.invoiceDate)}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-base font-bold text-slate-900">{formatCurrency(current.amount)}</p>
                          {canRecordPlanInvoice ? (
                            <button type="button" onClick={() => openAction("planInvoice", current)} className="mt-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Review & Record Payment</button>
                          ) : canResolvePendingProject ? (
                            <button type="button" onClick={() => openAction("projectApproval", current)} className="mt-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700">Review Initial Payment</button>
                          ) : isRecurringPlanInvoice ? (
                            <button type="button" onClick={() => openRecord("invoice", current._id)} className="mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900">Open record</button>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Payment Requests & History</h2>
                    <p className="mt-1 text-sm text-slate-500">Every submitted, completed, rejected, or wallet payment record.</p>
                  </div>
                </div>
                {transactions.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payment requests found.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                    {transactions.map((current) => (
                      <div key={current._id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">{getPaymentLabel(current)}</p>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClassName(getLedgerStatusLabel(current.status))}`}>{getLedgerStatusLabel(current.status)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{getPaymentMethodText(current.paymentMethod)} · {formatDateTime(current.date || current.createdAt)}</p>
                          {current.rejectionReason ? <p className="mt-1 text-xs text-rose-700">Reason: {current.rejectionReason}</p> : null}
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-base font-bold text-slate-900">{formatCurrency(current.amount)}</p>
                          {current.status === "pending" ? (
                            <button type="button" onClick={() => openAction("transaction", current)} className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">Review Payment</button>
                          ) : (
                            <button type="button" onClick={() => openRecord("transaction", current._id)} className="mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900">Open record</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {actionTarget ? (
                <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center sm:justify-center" onClick={closeAction}>
                  <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Payment review</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">
                      {actionTarget.type === "transaction"
                        ? "Review submitted payment"
                        : actionTarget.type === "planInvoice"
                        ? "Record plan invoice payment"
                        : "Review initial project payment"}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {actionTarget.type === "transaction"
                        ? `${formatCurrency(actionTarget.record.amount)} submitted via ${getPaymentMethodText(actionTarget.record.paymentMethod)}. Verify the reference before accepting.`
                        : `${formatCurrency(actionTarget.record.amount)} · ${getInvoiceLabel(actionTarget.record)}`}
                    </p>

                    {actionTarget.type !== "transaction" ? (
                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label>
                          <span className="text-sm font-semibold text-slate-700">Payment method</span>
                          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={actionSubmitting} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400">
                            <option value="upi">UPI</option>
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="cash">Cash</option>
                            <option value="wallet">Wallet</option>
                          </select>
                        </label>
                        <label>
                          <span className="text-sm font-semibold text-slate-700">Reference</span>
                          <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} disabled={actionSubmitting} placeholder="UPI or bank reference" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400" />
                        </label>
                        <label className="sm:col-span-2">
                          <span className="text-sm font-semibold text-slate-700">Internal note</span>
                          <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} disabled={actionSubmitting} rows={3} placeholder="Optional internal verification note" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400" />
                        </label>
                      </div>
                    ) : null}

                    {["transaction", "projectApproval"].includes(actionTarget.type) ? (
                      <label className="mt-5 block">
                        <span className="text-sm font-semibold text-slate-700">Rejection reason</span>
                        <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} disabled={actionSubmitting} rows={3} placeholder="Required only when rejecting" className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-rose-400" />
                      </label>
                    ) : null}

                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                      <button type="button" onClick={closeAction} disabled={actionSubmitting} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">Cancel</button>
                      {["transaction", "projectApproval"].includes(actionTarget.type) ? (
                        <button type="button" onClick={() => completeAction("reject")} disabled={actionSubmitting || !rejectionReason.trim()} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">{actionSubmitting ? "Saving..." : "Reject"}</button>
                      ) : null}
                      <button type="button" onClick={() => completeAction(actionTarget.type === "transaction" ? "approve" : "record")} disabled={actionSubmitting} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                        {actionSubmitting ? "Saving..." : actionTarget.type === "transaction" ? "Accept Payment" : actionTarget.type === "planInvoice" ? "Record Payment" : "Record Payment & Approve"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

const AdminPaymentRecordDetail = () => {
  const { customerId, recordType, recordId } = useParams();
  if (recordType === "order") {
    return <PaymentOrderHistory customerId={customerId} orderId={recordId} />;
  }
  return <SinglePaymentRecordDetail />;
};

export default AdminPaymentRecordDetail;
