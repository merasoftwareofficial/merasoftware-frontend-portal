import { getOrderDisplayName } from "./orderPresentation";
import { getPaymentMethodText } from "./invoicePresentation";

const safeDateTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const getPaymentStatusLabel = (transaction) => {
  if (!transaction?.status) return "N/A";
  return String(transaction.status).replace(/_/g, " ");
};

export const getInvoiceStatusLabel = (invoice) => {
  if (!invoice?.status) return "N/A";
  return String(invoice.status).replace(/_/g, " ");
};

export const getLedgerStatusLabel = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();
  if (["completed", "paid", "approved"].includes(normalizedStatus)) return "Paid";
  if (["pending", "pending-approval", "unpaid", "overdue"].includes(normalizedStatus)) return "Pending";
  if (["rejected", "failed", "cancelled", "canceled"].includes(normalizedStatus)) return "Rejected";
  return status ? String(status).replace(/_/g, " ") : "N/A";
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

const getOrdinal = (n) => ORDINALS[n - 1] || `${n}th`;

const getPaymentMethodLabel = (paymentMethod) => {
  const labels = {
    upi: "UPI",
    wallet: "Wallet",
    cash: "Cash",
    bank_transfer: "Bank Transfer",
    combined: "Combined",
    reward: "Referral Reward",
  };
  return labels[paymentMethod] || "Payment";
};

// A transaction's installmentNumber is its financial ownership. sourceType can still be
// "invoice" for an installment payment because the backend needs that to settle its invoice.
// Never let sourceType hide the installment label in admin UI.
export const getTransactionPaymentLabel = (transaction) => {
  const source = transaction?.sourceType || transaction?.type;
  const paymentMethod = getPaymentMethodLabel(transaction?.paymentMethod);
  if (transaction?.installmentNumber) return `${getOrdinal(transaction.installmentNumber)} Installment · ${paymentMethod}`;
  if (transaction?.type === "renewal" || source === "renewal") return "Renewal Payment";
  if (transaction?.type === "refund") return "Wallet Refund";
  if (transaction?.type === "deposit" || source === "wallet") return "Wallet Recharge";
  if (transaction?.orderId) return `Full Payment · ${paymentMethod}`;
  return `Payment · ${paymentMethod}`;
};

const getInvoiceLabel = (invoice) => {
  if (invoice?.invoiceType === "project_final") return "Final Project Invoice";
  if (invoice?.invoiceType === "plan_renewal") return "Plan Renewal";
  if (invoice?.installmentNumber) return `${getOrdinal(invoice.installmentNumber)} Installment`;
  return "Invoice";
};

export const buildLedgerItems = (transactions = [], invoices = []) => {
  const transactionInvoiceIds = new Set(
    transactions
      .filter((transaction) => transaction?.invoiceId)
      .map((transaction) => String(transaction.invoiceId?._id || transaction.invoiceId))
  );

  return [
    ...transactions.map((transaction) => {
      // Falls back to the name frozen on the order, so a retired/deleted plan still
      // names the payment in the ledger instead of showing a bare amount.
      // Transactions now survive their order's deletion (they are the permanent record that
      // money moved), so the snapshot deleteOrder.js writes is what names them afterwards.
      const serviceName =
        getOrderDisplayName(transaction.orderId, null) || transaction.deletedProjectName;
      const paymentLabel = getTransactionPaymentLabel(transaction);
      return {
        id: `transaction-${transaction._id}`,
        kind: "transaction",
        statusLabel: getPaymentStatusLabel(transaction),
        title: serviceName ? `${serviceName} — ${paymentLabel}` : paymentLabel,
        label: paymentLabel,
        status: transaction.status,
        amount: transaction.amount,
        method: getPaymentMethodText(transaction.paymentMethod),
        date: transaction.date || transaction.createdAt,
        raw: transaction,
        sortDate: safeDateTime(transaction.date || transaction.createdAt)?.getTime() || 0,
        orderId: transaction.orderId?._id || transaction.orderId || null,
        serviceName: serviceName || null,
        orderStartDate: transaction.orderId?.createdAt || null,
        orderDeleted: Boolean(transaction.orderDeleted),
        deletedProjectType: transaction.deletedProjectType || null,
      };
    }),
    ...invoices
      .filter((invoice) => !transactionInvoiceIds.has(String(invoice._id)))
      .map((invoice) => {
        const serviceName = getOrderDisplayName(invoice.orderId, null) || invoice.serviceName || invoice.deletedProjectName;
        const invoiceLabel = getInvoiceLabel(invoice);
        return {
          id: `invoice-${invoice._id}`,
          kind: "invoice",
          statusLabel: getInvoiceStatusLabel(invoice),
          title: serviceName ? `${serviceName} — ${invoiceLabel}` : invoiceLabel,
          label: invoiceLabel,
          status: invoice.status,
          amount: invoice.amount,
          method: getPaymentMethodText(invoice.paymentMethod),
          date: invoice.paidDate || invoice.invoiceDate || invoice.createdAt,
          raw: invoice,
          sortDate: safeDateTime(invoice.paidDate || invoice.invoiceDate || invoice.createdAt)?.getTime() || 0,
          orderId: invoice.orderId?._id || invoice.orderId || null,
          serviceName: serviceName || null,
          // A deleted order populates to null, so its start date can only come from the
          // snapshot written at delete time.
          orderStartDate: invoice.orderId?.createdAt || invoice.deletedProjectStartDate || null,
          orderDeleted: Boolean(invoice.orderDeleted),
          deletedProjectType: invoice.deletedProjectType || null,
          deletedProjectDeletedAt: invoice.deletedProjectDeletedAt || null,
          deletedProjectPaymentMethod: invoice.deletedProjectPaymentMethod || null,
        };
      }),
  ].sort((left, right) => right.sortDate - left.sortDate);
};

const formatGroupDate = (value) => {
  const parsed = safeDateTime(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const groupLedgerItemsByProject = (ledgerItems = []) => {
  const groups = new Map();

  ledgerItems.forEach((item) => {
    let key;
    let baseName;
    if (item.orderId) {
      key = String(item.orderId);
      baseName = item.serviceName || (item.orderDeleted ? "Deleted Project" : "Project");
    } else {
      key = "general";
      baseName = "Wallet / General Payments";
    }

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        baseName,
        startDate: item.orderStartDate || null,
        deletedProjectType: item.deletedProjectType || null,
        deletedProjectDeletedAt: item.deletedProjectDeletedAt || null,
        deletedProjectPaymentMethod: item.deletedProjectPaymentMethod || null,
        items: [],
        latestSortDate: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    group.latestSortDate = Math.max(group.latestSortDate, item.sortDate);
    if (!group.startDate && item.orderStartDate) group.startDate = item.orderStartDate;
    if (!group.deletedProjectType && item.deletedProjectType) group.deletedProjectType = item.deletedProjectType;
    if (!group.deletedProjectDeletedAt && item.deletedProjectDeletedAt) group.deletedProjectDeletedAt = item.deletedProjectDeletedAt;
    if (!group.deletedProjectPaymentMethod && item.deletedProjectPaymentMethod) group.deletedProjectPaymentMethod = item.deletedProjectPaymentMethod;
  });

  // When two different projects share the same service name (e.g. two "Standard Website"
  // orders), append the project's start date to each so the admin can tell them apart.
  const nameCounts = new Map();
  groups.forEach((group) => {
    nameCounts.set(group.baseName, (nameCounts.get(group.baseName) || 0) + 1);
  });

  return Array.from(groups.values())
    .map((group) => {
      const isAmbiguous = nameCounts.get(group.baseName) > 1 && group.key !== "general";
      const startLabel = formatGroupDate(group.startDate);
      const displayName = isAmbiguous && startLabel ? `${group.baseName} (Started ${startLabel})` : group.baseName;
      return {
        ...group,
        serviceName: displayName,
        items: group.items.slice().sort((a, b) => b.sortDate - a.sortDate),
      };
    })
    .sort((a, b) => b.latestSortDate - a.latestSortDate);
};
