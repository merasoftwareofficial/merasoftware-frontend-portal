// How an invoice is WORDED for the customer — the only place that decides it.
//
// invoiceModel stores its own vocabulary: status is one of
// unpaid / partially_paid / paid / overdue / cancelled, and invoiceType is one of
// project / project_final / plan_renewal / service_statement / complimentary_upgrade. Those are the database's
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

/** The project's final invoice: the one document a customer keeps for a one-time project. */
export const isProjectStatement = (invoice) => invoice?.invoiceType === 'project_final';

/**
 * A complimentary invoice: the ₹0 record of a free upgrade on a completed project
 * (backend/helpers/complimentaryUpgrade.js). Nothing was ever due on it, and it is a
 * document the customer keeps, so it is downloadable like a statement. Every page names
 * it with COMPLIMENTARY_INVOICE_LABEL rather than its own wording.
 */
export const COMPLIMENTARY_INVOICE_TYPE = 'complimentary_upgrade';
export const COMPLIMENTARY_INVOICE_LABEL = 'Complimentary Invoice';
export const isComplimentaryInvoice = (invoice) =>
  invoice?.invoiceType === COMPLIMENTARY_INVOICE_TYPE;

/**
 * The status badge for an invoice: { label, tone }.
 *
 * `tone` is a Badge tone (success / pending / error / neutral), not a colour — the
 * colours live in index.css so they stay correct in all three themes.
 */
export const getInvoiceStatusText = (invoice) => {
  // Nothing was paid for a complimentary invoice, so it never reads "Paid".
  if (isComplimentaryInvoice(invoice)) return { label: 'Free', tone: 'success' };
  // A statement that is fully paid is a receipt: it says Paid, like the bill it replaces.
  if (isStatementInvoice(invoice) && invoice.status === 'paid') return { label: 'Paid', tone: 'success' };
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
  if (isComplimentaryInvoice(invoice)) return 'Complimentary upgrade';
  if (isProjectStatement(invoice)) return 'Final invoice';
  // A plan paid in one go shows its statement alone (collapseSingleBillOrders): that is the plan's invoice.
  if (isStatementInvoice(invoice)) return invoice.standsForBill ? 'Plan invoice' : 'Total for this plan';
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
  cheque: 'Cheque',
  combined: 'Wallet + UPI',
  reward: 'Referral Reward',
}[method] || 'UPI');

/**
 * A FREE invoice: the ₹0 invoice of a free project (100% discount / offer). It is created
 * already settled (adminCreateProjectOrder.js), so it never asks for money and its amount
 * reads FREE rather than ₹0 everywhere an invoice amount is shown.
 */
export const isFreeInvoice = (invoice) =>
  Boolean(invoice) && Number(invoice.amount) === 0 && invoice.status === 'paid';

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

/**
 * One card for an order paid in one go.
 *
 * Such an order has two records: the bill that collects the money (invoiceType "project", or
 * "plan_renewal" for a plan) and a statement ("project_final" for a project, "service_statement"
 * for a plan) that states the whole order and is the only one with a PDF. When the order is a
 * single payment both carry the same amount, so listing both read as two orders. Exactly one is
 * shown, by what the customer can do:
 *   - the bill is still to be paid: the bill (it holds Pay now); the statement is hidden;
 *   - the bill is paid: the statement (a receipt with the download); the bill is hidden.
 *
 * "A single payment" is read from the invoices themselves:
 *   - a project: one live bill with no installment number (installment bills are created one at
 *     a time, so a project paid in parts can briefly have a single bill, but it carries a number);
 *   - a plan: one live bill whose amount equals the statement's (a plan of several cycles has a
 *     statement for the whole plan, which differs from any one cycle's bill).
 * Projects paid in parts, plans of several cycles, complimentary invoices and orders with no
 * statement yet are left exactly as they are. A kept plan statement is marked
 * standsForBill so it can be worded as the plan's invoice. Display only: payment, due and
 * approval rules never read this list.
 */
const BILL_TYPES = ['project', 'plan_renewal'];
const orderKey = (invoice) => String(invoice?.orderId?._id || invoice?.orderId || '');

export const collapseSingleBillOrders = (invoices) => {
  const list = Array.isArray(invoices) ? invoices : [];
  const groups = new Map();
  for (const invoice of list) {
    const key = orderKey(invoice);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(invoice);
  }
  const hidden = new Set();
  const kept = new Set();
  for (const group of groups.values()) {
    const statement = group.find(isStatementInvoice);
    const bills = group.filter((invoice) => BILL_TYPES.includes(invoice.invoiceType) && invoice.status !== 'cancelled');
    if (!statement || bills.length !== 1) continue;
    const single = isProjectStatement(statement)
      ? !bills[0].installmentNumber
      : Number(bills[0].amount) === Number(statement.amount);
    if (!single) continue;
    if (bills[0].status === 'paid') { hidden.add(bills[0]._id); kept.add(statement._id); } else hidden.add(statement._id);
  }
  return list
    .filter((invoice) => !hidden.has(invoice._id))
    .map((invoice) => (kept.has(invoice._id) && !isProjectStatement(invoice) ? { ...invoice, standsForBill: true } : invoice));
};

/** The document that stands in for a paid single-payment bill (its statement), or null when the bill has none. */
export const receiptForBill = (invoices, bill) => {
  const shown = collapseSingleBillOrders(invoices);
  if (shown.some((invoice) => invoice._id === bill?._id)) return null;
  return shown.find((invoice) => isStatementInvoice(invoice) && orderKey(invoice) === orderKey(bill)) || null;
};
