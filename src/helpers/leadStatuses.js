// The lead statuses as the portal shows them. The stored values come from backend helpers/leadStatuses.js.
// "Won" is the stored value; "Matured" is only what is displayed.
export const PROPOSAL_SENT = "Proposal Sent"; // a permanent badge (lead.proposalSentAt), and the badge on old follow-ups
const LEAD_STATUS_DISPLAY = {
  Inquiry: { label: "Inquiry", style: "bg-violet-100 text-violet-800 border-violet-200", tone: "pending" },
  Contacted: { label: "Neutral", style: "bg-blue-100 text-blue-800 border-blue-200", tone: "pending" },
  Positive: { label: "Positive", style: "bg-cyan-100 text-cyan-800 border-cyan-200", tone: "pending" },
  Reservation: { label: "Reservation", style: "bg-indigo-100 text-indigo-800 border-indigo-200", tone: "pending" },
  Active: { label: "Active", style: "bg-teal-100 text-teal-800 border-teal-200", tone: "pending" },
  Lazy: { label: "Lazy", style: "bg-yellow-100 text-yellow-800 border-yellow-200", tone: "pending" },
  Tough: { label: "Tough", style: "bg-orange-100 text-orange-800 border-orange-200", tone: "pending" },
  NotNow: { label: "Not Now", style: "bg-amber-100 text-amber-800 border-amber-200", tone: "pending" },
  Negative: { label: "Negative", style: "bg-red-100 text-red-800 border-red-200", tone: "error" },
  Unhappy: { label: "Unhappy", style: "bg-rose-100 text-rose-800 border-rose-200", tone: "error" },
  Dead: { label: "Dead", style: "bg-slate-200 text-slate-700 border-slate-300", tone: "neutral" },
  Wrong: { label: "Wrong", style: "bg-zinc-200 text-zinc-700 border-zinc-300", tone: "neutral" },
  Won: { label: "Matured", style: "bg-emerald-100 text-emerald-800 border-emerald-200", tone: "success" },
  [PROPOSAL_SENT]: { label: PROPOSAL_SENT, style: "bg-amber-100 text-amber-800 border-amber-200", tone: "pending" },
};

export const LEAD_STATUSES = ["Inquiry", "Contacted", "Positive", "Reservation", "Active", "Lazy", "Tough", "NotNow", "Negative", "Unhappy", "Dead", "Wrong", "Won"];
// Won is set only by a lead becoming a client, Inquiry only by WhatsApp Auto Reply, and Reservation only while the
// person's offer reservation runs: none of them is chosen.
// Active, Lazy and Tough are only shown on stored leads and old follow-ups (Active is now Positive).
export const SELECTABLE_LEAD_STATUSES = ["Contacted", "Positive", "NotNow", "Negative", "Unhappy", "Dead", "Wrong"];
export const DEFAULT_LEAD_STATUS = "Contacted";

export const leadStatusLabel = (status) => LEAD_STATUS_DISPLAY[status]?.label || status || DEFAULT_LEAD_STATUS;
export const leadStatusStyle = (status) => (LEAD_STATUS_DISPLAY[status] || LEAD_STATUS_DISPLAY[DEFAULT_LEAD_STATUS]).style;
export const leadStatusTone = (status) => LEAD_STATUS_DISPLAY[status]?.tone || "neutral";

const toOption = (status) => ({ value: status, label: leadStatusLabel(status), className: leadStatusStyle(status) });

// A client's general behaviour: whether they may be marketed to (backend CLIENT_BEHAVIOURS). No saved value means Neutral.
export const DEFAULT_CLIENT_BEHAVIOUR = "Contacted";
export const CLIENT_BEHAVIOUR_OPTIONS = ["Contacted", "NotNow", "Negative", "Unhappy", "Dead"].map(toOption);
export const CLIENT_BEHAVIOUR_FILTERS = CLIENT_BEHAVIOUR_OPTIONS;
/** The behaviours to choose from, plus the current one when it can't be chosen (an older value such as Positive). */
export const clientBehaviourOptions = (current) => [
  ...(current && !CLIENT_BEHAVIOUR_OPTIONS.some((option) => option.value === current) ? [toOption(current)] : []),
  ...CLIENT_BEHAVIOUR_OPTIONS,
];
const SELECTABLE_OFFER_STAGES = ["Contacted", "Positive", "Negative"];
/** A person's stage in one offer. Matured comes only from Bought this offer, so a Matured offer keeps the line's own badge.
 *  Reservation and Not Now come only from the reservation: a note may keep them, so they are offered while current. */
export const offerStageOptions = (targetStage, current) => (targetStage === "Won" ? [toOption(current || "Won")] : [
  ...(targetStage && !SELECTABLE_OFFER_STAGES.includes(targetStage) ? [toOption(targetStage)] : []),
  ...SELECTABLE_OFFER_STAGES.map(toOption),
]);

/** The statuses to choose from, plus the current one when it can't be chosen (Won, or an old follow-up's badge). */
export const leadStatusOptions = (current) => [
  ...(current && !SELECTABLE_LEAD_STATUSES.includes(current) ? [toOption(current)] : []),
  ...SELECTABLE_LEAD_STATUSES.map(toOption),
];
