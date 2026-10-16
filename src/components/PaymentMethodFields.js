import React from "react";
import {
  BANK_TRANSFER_MODE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
} from "../helpers/paymentMethodRules";

// The method picker plus exactly the fields that method needs (helpers/paymentMethodRules.js).
// Renders sibling <label> fields with no wrapper, so it drops into whatever grid or stack the
// host form already uses; the host passes its own class names to keep its look.
const PaymentMethodFields = ({
  entry,
  onChange,
  methods,
  disabled = false,
  fieldClassName = "block",
  labelClassName = "text-sm font-semibold text-slate-700",
  inputClassName = "mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400",
}) => {
  const options = methods
    ? PAYMENT_METHOD_OPTIONS.filter((option) => methods.includes(option.value))
    : PAYMENT_METHOD_OPTIONS;
  const update = (patch) => onChange({ ...entry, ...patch });
  const hintClassName = "mt-1 block text-xs font-normal text-slate-500";

  return (
    <>
      <label className={fieldClassName}>
        <span className={labelClassName}>Payment method</span>
        <select
          value={entry.method}
          // A reference typed for one method is never valid for another, so switching clears it.
          onChange={(event) => onChange({ ...entry, method: event.target.value, reference: "" })}
          disabled={disabled}
          className={inputClassName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {entry.method === "upi" ? (
        <label className={fieldClassName}>
          <span className={labelClassName}>UPI reference number</span>
          <input
            type="text"
            inputMode="numeric"
            value={entry.reference}
            onChange={(event) => update({ reference: event.target.value.replace(/\D/g, "") })}
            disabled={disabled}
            placeholder="e.g. 412345678901"
            className={inputClassName}
          />
          <span className={hintClassName}>Digits only, at least 12.</span>
        </label>
      ) : null}

      {entry.method === "bank_transfer" ? (
        <>
          <label className={fieldClassName}>
            <span className={labelClassName}>Transfer mode</span>
            <select
              value={entry.transferMode}
              onChange={(event) => update({ transferMode: event.target.value })}
              disabled={disabled}
              className={inputClassName}
            >
              <option value="">Select NEFT / IMPS / RTGS</option>
              {BANK_TRANSFER_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Transaction ID / UTR</span>
            <input
              type="text"
              value={entry.reference}
              onChange={(event) => update({ reference: event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })}
              disabled={disabled}
              maxLength={22}
              placeholder="e.g. HDFCN52026101612345"
              className={inputClassName}
            />
            <span className={hintClassName}>Letters and numbers, 6–22 characters.</span>
          </label>
        </>
      ) : null}

      {entry.method === "cheque" ? (
        <>
          <label className={fieldClassName}>
            <span className={labelClassName}>Cheque number</span>
            <input
              type="text"
              inputMode="numeric"
              value={entry.reference}
              onChange={(event) => update({ reference: event.target.value.replace(/\D/g, "").slice(0, 6) })}
              disabled={disabled}
              placeholder="6 digits"
              className={inputClassName}
            />
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Bank name</span>
            <input
              type="text"
              value={entry.chequeBankName}
              onChange={(event) => update({ chequeBankName: event.target.value })}
              disabled={disabled}
              maxLength={80}
              placeholder="Bank printed on the cheque"
              className={inputClassName}
            />
          </label>
          <label className={fieldClassName}>
            <span className={labelClassName}>Cheque date</span>
            <input
              type="date"
              value={entry.chequeDate}
              onChange={(event) => update({ chequeDate: event.target.value })}
              disabled={disabled}
              className={inputClassName}
            />
          </label>
        </>
      ) : null}
    </>
  );
};

export default PaymentMethodFields;
