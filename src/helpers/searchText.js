// Admin list search (Leads, Clients). Text fields match as typed, ignoring case. Phone fields
// ignore spaces, dashes and brackets: "98765 43210" and "9876543210" are one number. An Indian code
// typed in front (+91, 0091, 91 on a full number, or a leading 0) is dropped.
// Keep in step with backend/helpers/searchText.js, which the global search uses.
const PHONE_QUERY = /^[\d\s+\-().]+$/;
const digitsOf = (value) => String(value || "").replace(/\D/g, "");

/** The digits of a phone search, without an Indian country code or trunk 0 in front. */
export function searchDigits(query) {
  const digits = digitsOf(query);
  if (/^\s*(\+|00)91/.test(query)) return digits.replace(/^(00)?91/, "");
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^0[6-9]\d{9}$/.test(digits)) return digits.slice(1);
  return digits;
}

/** True when `query` (already lowercase and trimmed) is found in any of the texts or phones. */
export function matchesSearch(query, { texts = [], phones = [] }) {
  if (!query) return true;
  if (texts.some((text) => String(text || "").toLowerCase().includes(query))) return true;
  const digits = PHONE_QUERY.test(query) ? searchDigits(query) : "";
  if (digits.length >= 3) return phones.some((phone) => digitsOf(phone).includes(digits));
  return phones.some((phone) => String(phone || "").toLowerCase().includes(query));
}
