// Lead "Source" choices, shared by the Add Lead form (AdminLeadsPage) and the
// Edit Lead modal. "Reference" is a creation-only choice: it links the referrer
// and credits their reward in backend createLead.js, so it is never offered when
// editing a lead (the backend enforces the same rule in updateLead editDetails).
export const REFERENCE_SOURCE = "Reference";

const leadSourceOptions = ["Outbound Call", "Facebook", "Instagram", "Google", "WhatsApp", REFERENCE_SOURCE];

export default leadSourceOptions;
