// The lead statuses as the portal shows them. The stored values come from backend helpers/leadStatuses.js.
// "Won" is the stored value; "Matured" is only what is displayed.
const LEAD_STATUS_DISPLAY = {
  Contacted: { label: "Contacted", style: "bg-blue-100 text-blue-800 border-blue-200", tone: "pending" },
  "Proposal Sent": { label: "Proposal Sent", style: "bg-amber-100 text-amber-800 border-amber-200", tone: "pending" },
  Positive: { label: "Positive", style: "bg-cyan-100 text-cyan-800 border-cyan-200", tone: "pending" },
  Negative: { label: "Negative", style: "bg-red-100 text-red-800 border-red-200", tone: "error" },
  Won: { label: "Matured", style: "bg-emerald-100 text-emerald-800 border-emerald-200", tone: "success" },
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_DISPLAY);
// "Won" is set only by converting a lead, never chosen on a follow-up.
export const SELECTABLE_LEAD_STATUSES = LEAD_STATUSES.filter((status) => status !== "Won");
export const DEFAULT_LEAD_STATUS = "Contacted";

export const leadStatusLabel = (status) => LEAD_STATUS_DISPLAY[status]?.label || status || DEFAULT_LEAD_STATUS;
export const leadStatusStyle = (status) => (LEAD_STATUS_DISPLAY[status] || LEAD_STATUS_DISPLAY[DEFAULT_LEAD_STATUS]).style;
export const leadStatusTone = (status) => LEAD_STATUS_DISPLAY[status]?.tone || "neutral";
