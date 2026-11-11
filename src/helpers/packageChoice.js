// A customer's choice on a package's customize page (merasoftware/src/docs/package.md §3): one-time
// { paymentOption } or monthly { billingCycle, tenureMonths } (no per file, merasoftware/src/docs/monthlypackage.md). Words and defaults only;
// the backend checks and prices every choice (helpers/salesPackages.js quoteChoice).
export const PAYMENT_OPTION_WORDS = { full: 'Full payment', installments_2: '2 installments', installments_3: '3 installments' };
export const CYCLE_WORDS = { monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: '6 months', yearly: 'Yearly' };
export const CYCLE_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

// "2 installments", or "Quarterly · 12 months" (an older request may still say its files and updates).
export const packageChoiceText = (choice) => {
  if (!choice) return '';
  if (choice.paymentOption) return `${PAYMENT_OPTION_WORDS[choice.paymentOption] || choice.paymentOption}${choice.advanceAmount ? ` · ₹${Number(choice.advanceAmount).toLocaleString('en-IN')} advance` : ''}`;
  return [CYCLE_WORDS[choice.billingCycle], choice.tenureMonths ? `${choice.tenureMonths} month${choice.tenureMonths === 1 ? '' : 's'}` : '',
    choice.files ? `${choice.files} files × ${choice.updates} updates a month` : ''].filter(Boolean).join(' · ');
};

// A monthly package's first choice: its shortest cycle and its longest length.
export const defaultMonthlyChoice = (item) => {
  const monthly = item?.monthly;
  if (!monthly) return null;
  const cycle = [...monthly.billingOptions].sort((a, b) => CYCLE_MONTHS[a.billingCycle] - CYCLE_MONTHS[b.billingCycle])[0]?.billingCycle;
  const months = CYCLE_MONTHS[cycle] || 1;
  return { billingCycle: cycle, tenureMonths: Math.floor(Math.min(monthly.maxTenureMonths, 12) / months) * months };
};
