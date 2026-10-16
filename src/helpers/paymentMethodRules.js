// Payment-method rules for every payment an ADMIN records by hand. Mirrors the server's
// backend/helpers/paymentEvidence.js, which re-checks all of this — this copy only lets the
// form ask for the right fields and refuse a bad entry before the request is sent.
//
//   cash / wallet   → nothing to record
//   upi             → UPI reference, digits only, at least 12
//   bank_transfer   → transfer mode (NEFT / IMPS / RTGS) + transaction ID / UTR (letters + numbers)
//   cheque          → 6-digit cheque number + bank name + cheque date

export const PAYMENT_METHOD_OPTIONS = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer (NEFT / IMPS / RTGS)" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
];

export const BANK_TRANSFER_MODE_OPTIONS = [
  { value: "neft", label: "NEFT" },
  { value: "imps", label: "IMPS" },
  { value: "rtgs", label: "RTGS" },
];

const UPI_REFERENCE_PATTERN = /^\d{12,}$/;
const BANK_REFERENCE_PATTERN = /^[A-Z0-9]{6,22}$/;
const CHEQUE_NUMBER_PATTERN = /^\d{6}$/;

// One object per payment being entered — what <PaymentMethodFields> edits.
export const createPaymentEntry = (method = "upi", reference = "") => ({
  method,
  reference,
  transferMode: "",
  chequeBankName: "",
  chequeDate: "",
});

// The message to show for an entry that cannot be saved yet, or "" when it is complete.
export const getPaymentEntryError = (entry) => {
  const reference = String(entry?.reference || "").trim();
  switch (entry?.method) {
    case "upi":
      return UPI_REFERENCE_PATTERN.test(reference)
        ? ""
        : "UPI reference must be digits only, at least 12";
    case "bank_transfer":
      if (!entry.transferMode) return "Choose the transfer mode (NEFT, IMPS or RTGS)";
      return BANK_REFERENCE_PATTERN.test(reference.toUpperCase())
        ? ""
        : "Transaction ID / UTR must be 6–22 letters or numbers";
    case "cheque":
      if (!CHEQUE_NUMBER_PATTERN.test(reference)) return "Cheque number must be exactly 6 digits";
      if (String(entry.chequeBankName || "").trim().length < 2) return "Enter the bank name printed on the cheque";
      return entry.chequeDate ? "" : "Enter the cheque date";
    case "cash":
    case "wallet":
      return "";
    default:
      return "Choose a payment method";
  }
};

// The request fields every admin payment endpoint accepts: paymentMethod + the reference
// (named per endpoint by the caller) + paymentDetails for the method-specific extras.
export const toPaymentRequest = (entry) => {
  const method = entry?.method;
  const reference = String(entry?.reference || "").trim();
  return {
    paymentMethod: method,
    reference: ["upi", "bank_transfer", "cheque"].includes(method)
      ? (method === "bank_transfer" ? reference.toUpperCase() : reference)
      : "",
    paymentDetails: method === "bank_transfer"
      ? { transferMode: entry.transferMode }
      : method === "cheque"
      ? { chequeBankName: String(entry.chequeBankName || "").trim(), chequeDate: entry.chequeDate }
      : {},
  };
};
