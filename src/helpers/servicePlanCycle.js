// IS ANOTHER CYCLE COMING? — one question, one answer, matching the server.
//
// A service plan's allowance comes back each billing cycle, so when a customer has spent it
// the screen has to say when it returns. That is only true if another cycle is actually
// coming, and three different kinds of service live in the data:
//
//   fixed tenure  — bought for N cycles (serviceTotalCycles). The allowance returns until
//                   the last one, then the plan is finished.
//   recurring     — billed on a date with no agreed end. The allowance keeps returning.
//   one-off       — sold on plain validity, no billing cycle at all. What was bought is
//                   all there is.
//
// PlanDetails.js used to assume the first two and print "More on <cycle end>" whatever the
// service was. On a one-off plan that promises a renewal that will never happen, and on a
// service with no cycle end recorded it prints "More on Invalid Date". Live data at the time
// of writing: 8 service orders — 2 fixed-tenure, 2 recurring, 4 with no next cycle at all.
//
// THE RULE IS THE SERVER'S, NOT A NEW ONE. cron/servicePlanRenewalCron.js decides exactly
// this when it runs:
//
//     find services with serviceNextBillingDate <= now
//     if isFixedTenureService(service) && isFinalCycle(service, currentCycleNumber)
//        -> mark expired, stop billing
//     else -> bill the next cycle
//
// (backend/helpers/serviceBillingSchedule.js holds isFixedTenureService / isFinalCycle.)
// This asks the same two things in the same order, so the page and the cron can never tell
// the customer two different stories. If that rule ever changes, it changes in one place and
// this comment says where to look.

const CYCLE_OUTCOME = {
  // Another cycle is coming; `returnsOn` says when.
  RETURNS: 'returns',
  // This was the last cycle of a fixed tenure — the plan has delivered what was bought.
  FINISHED: 'finished',
  // The service has no cycle system at all: bought once, used once.
  ONE_OFF: 'one_off',
};

/** Mirrors isFixedTenureService: a tenure is only fixed if a whole positive count was agreed. */
const hasFixedTenure = (plan) => {
  const total = Number(plan?.serviceTotalCycles);
  return Number.isInteger(total) && total > 0;
};

/**
 * Does this service's allowance come back, and when?
 *
 * @returns {{ outcome: 'returns'|'finished'|'one_off', returnsOn: Date|null,
 *             cycleNumber: number, totalCycles: number|null }}
 */
export const getNextCycleOutcome = (plan) => {
  const totalCycles = hasFixedTenure(plan) ? Number(plan.serviceTotalCycles) : null;
  const cycleNumber = Number(plan?.serviceCurrentCycleNumber || 1);

  // Stopped by the client (backend serviceLifecycle.js stopServiceRenewal): the cron ends it after the paid
  // cycle, whatever length was bought, so nothing comes back after this cycle.
  if (plan?.serviceAutoRenewalStoppedAt) {
    return { outcome: CYCLE_OUTCOME.FINISHED, returnsOn: null, cycleNumber, totalCycles };
  }

  // The cron's own terminal test, asked first for the same reason it asks it first: a final
  // cycle ends the plan even though a billing date is still sitting on the record.
  if (totalCycles && cycleNumber >= totalCycles) {
    return { outcome: CYCLE_OUTCOME.FINISHED, returnsOn: null, cycleNumber, totalCycles };
  }

  // The billing date is what the cron selects on, so it is what decides that a cycle is
  // genuinely coming. serviceCurrentCycleEnd is NOT enough on its own: a one-off service has
  // an end date (its validity runs out) with nothing scheduled after it.
  const nextDate = plan?.serviceNextBillingDate || (totalCycles ? plan?.serviceCurrentCycleEnd : null);
  if (nextDate) {
    const parsed = new Date(nextDate);
    // A date the page cannot read is not a date. Saying nothing beats "Invalid Date".
    if (!Number.isNaN(parsed.getTime())) {
      return { outcome: CYCLE_OUTCOME.RETURNS, returnsOn: parsed, cycleNumber, totalCycles };
    }
  }

  return { outcome: CYCLE_OUTCOME.ONE_OFF, returnsOn: null, cycleNumber, totalCycles };
};

/**
 * How long until the allowance comes back, as a customer would say it.
 *
 * A date answers "when" but not "how soon" — "11 Oct 2026" leaves the reader counting on a
 * calendar, and on the last day it reads as though nothing is about to change. What is being
 * waited on here is a wait, so it is stated as one, and it gets finer as it gets closer:
 * days while there are days left, hours inside the final day, and "now" once it has passed
 * (the cron runs on its own schedule, so a customer can be looking at this in the gap
 * between the cycle ending and the renewal being written).
 *
 * @param {Date|string} date the moment the allowance returns
 * @param {Date} now injectable so this can be tested at a fixed point
 * @returns {string|null} null when the date is unusable — the caller then says nothing
 */
export const getTimeUntilText = (date, now = new Date()) => {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;

  const msLeft = target.getTime() - now.getTime();
  if (msLeft <= 0) return 'now';

  const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
  if (hoursLeft <= 1) return 'in less than an hour';
  if (hoursLeft < 24) return `in ${hoursLeft} hours`;

  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  return daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
};

/**
 * How much of the plan's own term is left — months and days, not a day count.
 *
 * "164 days" is arithmetic, not an answer. Nobody holds a plan's remaining life as a number
 * of days; they hold it as "about five months". Past a month the figure is therefore given
 * in months with the odd days beside it, and below a month it falls back to days, where the
 * day count is what a person would actually say.
 *
 * Months are counted on the calendar, not as 30-day blocks: a customer comparing this
 * against the date they bought the plan is reading real months, and 365/30 does not land on
 * the same day.
 *
 * @param {Date|string} endDate when the plan's term runs out
 * @param {Date} now injectable for testing
 * @returns {string|null} null when there is no end date — a plan with no expiry says so
 *                        elsewhere rather than showing a zero here
 */
export const getTermRemainingText = (endDate, now = new Date()) => {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;

  const msLeft = end.getTime() - now.getTime();
  if (msLeft <= 0) return 'ended';

  // Walk whole calendar months forward from today; whatever will not fit is the days part.
  // Counting the months FIRST is what makes "exactly one month away" read as "1 month": a
  // day-count threshold cannot do that, because a calendar month is 28-31 days depending on
  // which one it is, so "30 days" was printed for a term that was exactly a month long.
  let months = 0;
  const marker = new Date(now);
  for (;;) {
    const next = new Date(marker);
    next.setMonth(next.getMonth() + 1);
    if (next.getTime() > end.getTime()) break;
    marker.setTime(next.getTime());
    months += 1;
  }
  const days = Math.max(0, Math.ceil((end.getTime() - marker.getTime()) / (1000 * 60 * 60 * 24)));

  // Under a month there is nothing to express in months, so the day count is the answer.
  if (!months) return days === 1 ? '1 day' : `${days} days`;

  const monthPart = `${months} month${months === 1 ? '' : 's'}`;
  if (!days) return monthPart;
  return `${monthPart} ${days} day${days === 1 ? '' : 's'}`;
};

export { CYCLE_OUTCOME };
