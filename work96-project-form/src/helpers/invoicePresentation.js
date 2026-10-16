// How an invoice is WORDED for the customer — the only place that decides it.
//
// invoiceModel stores its own vocabulary: status is one of
// unpaid / partially_paid / paid / overdue / cancelled, and invoiceType is one of
// project / project_final / plan_renewal / service_statement. Those are the database's
// words, not the customer's, and until now every page translated them itself:
// InvoiceDetailPage.js and OrderDetailPage.js each kept a private copy of the same
// status map, and PlanDetails.js kept none at all — so it printed the raw value, and a
// customer read "partially_paid" on their own billing line.
//
// Three copies of one translation means a fourth page will write a fifth, and the same
// status will read differently on two screens. One module, so a wording decision is made
// once.
//
// Presentation only: nothing here changes what an invoice IS or what may be paid. The
// payable rule stays with the caller, because it is a money rule, not a wording one.

// The five statuses invoiceModel can hold, in the customer's words.
//
// "unpaid" is worded "Due" rather than "Unpaid": the customer is being told what to do,
// not being labelled. "partially_paid" says "Part paid" so the two halves — some money
// arrived, some is still owed — both land in two words.
const INVOICE_STATUS_TEXT = {
  paid: { label: 'Paid', tone: 'success' },
  partially_paid: { label: 'Part paid', tone: 'pending' },
  unpaid: { label: 'Due', tone: 'pending' },
  overdue: { label: 'Overdue', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const STATEMENT_TYPES = ['project_final', 'service_statement'];

/**
 * Is this invoice a statement rather than a bill?
 *
 * A statement is the whole story of an order — what it costs in total, what has been
 * paid so far. It is never collected on; the individual invoices are. So it must never
 * be shown wearing a "Due" badge, or the customer reads it as a second amount owed on
 * top of what they already owe.
 */
export const isStatementInvoice = (invoice) =>
  STATEMENT_TYPES.includes(invoice?.invoiceType);

/**
 * The status badge for an invoice: { label, tone }.
 *
 * `tone` is a Badge tone (success / pending / error / neutral), not a colour — the
 * colours live in index.css so they stay correct in all three themes.
 */
export const getInvoiceStatusText = (invoice) => {
  if (isStatementInvoice(invoice)) {
    // A statement states, it does not demand. Neutral, and worded as a summary.
    return { label: 'Summary', tone: 'neutral' };
  }
  return INVOICE_STATUS_TEXT[invoice?.status] || INVOICE_STATUS_TEXT.unpaid;
};

/**
 * What this invoice is FOR, in the customer's words.
 *
 * The database names a bill by its place in the billing machinery —
 * "service_statement", "plan_renewal", cycle number 3. A customer has no cycles; they
 * have a plan they pay for and a bill that arrives. So the cycle number is dropped and
 * each type is named by what the customer is actually being billed for.
 *
 * @param {object} invoice  an invoice document
 * @param {string} planName the plan's own name, used so the line reads like a sentence
 */
export const getInvoicePurposeText = (invoice, planName = '') => {
  if (isStatementInvoice(invoice)) return 'Total for this plan';
  if (invoice?.invoiceType === 'plan_renewal') return 'Renewal';
  // A plan's name often already ends in "Plan", so appending the word produced
  // "Starter Update Plan plan". The name is the answer on its own when it carries the word.
  if (!planName) return 'Plan charge';
  return /\bplans?\b/i.test(planName) ? planName : `${planName} plan`;
};

/**
 * Which part of a split payment this is: 1st, 2nd, 3rd.
 *
 * A project paid in parts is billed as installment 1, 2, 3 — and "Installment #2" is how
 * the schedule is named in the data, not how a person says it. The number is the useful
 * half, so the surfaces that show one keep it and drop the word.
 */
export const getInstallmentPartText = (installmentNumber) =>
  ({ 1: '1st', 2: '2nd', 3: '3rd' }[installmentNumber] || `Part ${installmentNumber}`);

/**
 * How a payment was made, in the customer's words.
 *
 * The stored values are the payment system's own: upi, wallet, cash, bank_transfer,
 * combined. Printed straight they arrive as "Bank_transfer" — the underscore and all.
 * WalletDetails.js already kept a three-entry map of its own; this is that map, complete,
 * in one place, so a payment does not read one way on the wallet and another on an invoice.
 */
export const getPaymentMethodText = (method) => ({
  upi: 'UPI',
  wallet: 'Wallet',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  combined: 'Wallet + UPI',
  reward: 'Referral Reward',
}[method] || 'UPI');

/**
 * Can the customer still pay something on this invoice?
 *
 * This repeats the rule the pages already applied inline (unpaid / partially_paid /
 * overdue are collectable, a statement never is) rather than inventing one — it is
 * moved here only so the billing line and its button cannot disagree about the same
 * invoice.
 */
export const isInvoicePayable = (invoice) => {
  if (!invoice || isStatementInvoice(invoice)) return false;
  return ['unpaid', 'partially_paid', 'overdue'].includes(invoice.status);
};
