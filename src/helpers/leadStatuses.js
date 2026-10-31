// The lead statuses as the portal shows them. The stored values come from backend helpers/leadStatuses.js.
// "Won" is the stored value; "Matured" is only what is displayed.
export const PROPOSAL_SENT = "Proposal Sent"; // a permanent badge (lead.proposalSentAt), and the badge on old follow-ups
const LEAD_STATUS_DISPLAY = {
  Inquiry: { label: "Inquiry", style: "bg-violet-100 text-violet-800 border-violet-200", tone: "pending" },
  Contacted: { label: "Contacted", style: "bg-blue-100 text-blue-800 border-blue-200", tone: "pending" },
  Positive: { label: "Positive", style: "bg-cyan-100 text-cyan-800 border-cyan-200", tone: "pending" },
  Negative: { label: "Negative", style: "bg-red-100 text-red-800 border-red-200", tone: "error" },
  Dead: { label: "Dead", style: "bg-slate-200 text-slate-700 border-slate-300", tone: "neutral" },
  Won: { label: "Matured", style: "bg-emerald-100 text-emerald-800 border-emerald-200", tone: "success" },
  [PROPOSAL_SENT]: { label: PROPOSAL_SENT, style: "bg-amber-100 text-amber-800 border-amber-200", tone: "pending" },
};

export const LEAD_STATUSES = ["Inquiry", "Contacted", "Positive", "Negative", "Dead", "Won"];
// Won is set only by a lead becoming a client, and Inquiry only by WhatsApp Auto Reply: neither is chosen.
export const SELECTABLE_LEAD_STATUSES = ["Contacted", "Positive", "Negative", "Dead"];
export const DEFAULT_LEAD_STATUS = "Contacted";

export const leadStatusLabel = (status) => LEAD_STATUS_DISPLAY[status]?.label || status || DEFAULT_LEAD_STATUS;
export const leadStatusStyle = (status) => (LEAD_STATUS_DISPLAY[status] || LEAD_STATUS_DISPLAY[DEFAULT_LEAD_STATUS]).style;
export const leadStatusTone = (status) => LEAD_STATUS_DISPLAY[status]?.tone || "neutral";

const toOption = (status) => ({ value: status, label: leadStatusLabel(status) });

/** The statuses to choose from, plus the current one when it can't be chosen (Won, or an old follow-up's badge). */
export const leadStatusOptions = (current) => [
  ...(current && !SELECTABLE_LEAD_STATUSES.includes(current) ? [toOption(current)] : []),
  ...SELECTABLE_LEAD_STATUSES.map(toOption),
];
