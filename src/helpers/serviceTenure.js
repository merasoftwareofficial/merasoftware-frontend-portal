// SSOT for how long a service can be bought for.
//
// A recurring service is sold for a fixed term, and the backend requires that
// term to be a whole number of billing periods (serviceBillingSchedule.js
// refuses anything else). Letting the customer type a number meant they could
// enter one that cannot resolve into cycles and only learn on submit, so the
// valid terms are listed instead of typed.
//
// Both purchase surfaces — the in-project Add-a-Service modal and the standalone
// service page — read the cap and the option list from here, so the two can
// never offer different terms.

export const BILLING_CYCLE_MONTHS = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
  every_2_years: 24,
  every_3_years: 36,
};

// Nothing longer than one year is sold. The backend enforces the same cap
// (servicePlanPurchase.js MAX_SERVICE_TENURE_MONTHS); this only keeps longer terms out of the list.
export const MAX_TENURE_MONTHS = 12;

// Every whole multiple of the billing period, up to the cap. A period longer
// than the cap yields no options at all — it cannot produce a valid term.
export const buildTenureOptions = (cycleMonths) => {
  const cycle = Number(cycleMonths);
  if (!cycle || cycle > MAX_TENURE_MONTHS) return [];

  const options = [];
  for (let months = cycle; months <= MAX_TENURE_MONTHS; months += cycle) {
    const years = months / 12;
    options.push({
      months,
      label:
        months % 12 === 0
          ? `${years} year${years === 1 ? '' : 's'} (${months} months)`
          : `${months} months`,
    });
  }
  return options;
};
