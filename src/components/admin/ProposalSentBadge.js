import React from "react";
import { PROPOSAL_SENT, leadStatusStyle } from "../../helpers/leadStatuses";

/** Shown on a lead once a proposal has gone out; it stays whatever the lead's status becomes. */
const ProposalSentBadge = ({ className = "px-3 py-1 text-xs" }) => (
  <span className={["inline-flex whitespace-nowrap rounded-full border font-semibold", leadStatusStyle(PROPOSAL_SENT), className].join(" ")}>
    {PROPOSAL_SENT}
  </span>
);

export default ProposalSentBadge;
