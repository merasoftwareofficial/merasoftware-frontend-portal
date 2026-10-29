import React from 'react';
import { CYCLE_OUTCOME, getNextCycleOutcome } from '../helpers/servicePlanCycle';

// One card per update of the current period on the customer plan page (pages/PlanDetails.js;
// owner decision Q7, merasoftware/src/docs/plan.md). Built only from what the backend sends:
//   uploads        — orderUploadHistory.js rows (files, status, allowanceReturned)
//   uploadAllowance — helpers/serviceAllowance.js (limit open now, used, remaining, cycleLimit,
//                     nextReleaseAt); nothing about the allowance is worked out here.
//   next period    — helpers/servicePlanCycle.js getNextCycleOutcome(), the same answer the rest
//                     of the page gives. It never promises an automatic renewal or a change of
//                     choices at renewal (owner decision Q6: no changes at renewal).

const formatDate = (date) => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS = {
  pending: { label: 'Sent', className: 'badge badge-neutral', bar: 'bg-[var(--text-muted)]' },
  in_progress: { label: 'In progress', className: 'badge badge-pending', bar: 'bg-[rgb(var(--accent-solid))]' },
  completed: { label: 'Done', className: 'badge badge-success', bar: 'bg-[var(--badge-success-fg)]' },
};

const Card = ({ pill, pillClass, title, children }) => (
  <div className="flex flex-col gap-2.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
    <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${pillClass}`}>{pill}</span>
    <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
    {children}
  </div>
);

const Bar = ({ percent, className }) => (
  <div className="h-2 overflow-hidden rounded-full bg-[var(--glass-bg-subtle)]">
    <i className={`block h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
  </div>
);

const PlanUpdateCards = ({ plan, uploads = [] }) => {
  const allowance = plan?.uploadAllowance;
  if (!allowance || allowance.unlimited) return null;
  const total = Number(allowance.cycleLimit || allowance.limit || 0);
  if (!(total > 0)) return null;

  const filesLimit = Number(plan.servicePlanSnapshot?.filesLimit || 0);
  const periodStart = plan.serviceCurrentCycleStart ? new Date(plan.serviceCurrentCycleStart) : null;
  // Uploads of this period, oldest first; a rejected upload that was given back is not an update.
  const counted = uploads
    .filter((upload) => !periodStart || new Date(upload.createdAt) >= periodStart)
    .filter((upload) => !(upload.status === 'rejected' && upload.allowanceReturned))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const remaining = Number(allowance.remaining || 0);
  const locked = Math.max(0, total - Number(allowance.limit || 0));
  const next = getNextCycleOutcome(plan);

  const cards = counted.map((upload, index) => {
    const look = STATUS[upload.status] || STATUS.pending;
    const sent = upload.files?.length || 0;
    return (
      // Older orders can hold more uploads than their allowance (counted before the period rules).
      <Card key={upload.id} pill={look.label} pillClass={look.className} title={index < total ? `Update ${index + 1} of ${total}` : 'Earlier update'}>
        {filesLimit > 0 && <Bar percent={(sent / filesLimit) * 100} className={look.bar} />}
        <p className="font-mono text-sm text-[var(--text-secondary)]">
          {filesLimit > 0 ? `${sent} / ${filesLimit} files` : `${sent} file${sent === 1 ? '' : 's'}`} · sent {formatDate(upload.createdAt)}
        </p>
      </Card>
    );
  });
  // No upload before the payment is confirmed (plan.md decision 10): the open updates wait for it.
  const [openPill, openClass] = plan.orderVisibility === 'pending-approval' ? ['Opens after payment approval', 'badge badge-pending']
    : plan.orderVisibility === 'payment-rejected' ? ['Not available', 'badge badge-neutral']
    : ['Ready to use', 'badge badge-success'];
  for (let i = 0; i < remaining; i += 1) {
    cards.push(
      <Card key={`open-${i}`} pill={openPill} pillClass={openClass} title={`Update ${counted.length + i + 1} of ${total}`}>
        <p className="text-sm text-[var(--text-secondary)]">{filesLimit > 0 ? `Send up to ${filesLimit} files.` : 'Send your data any time.'}</p>
      </Card>
    );
  }
  for (let i = 0; i < locked; i += 1) {
    cards.push(
      <Card key={`locked-${i}`} pill="Opens later" pillClass="badge badge-neutral" title={`Update ${counted.length + remaining + i + 1} of ${total}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          {allowance.nextReleaseAt ? `Next updates open on ${formatDate(allowance.nextReleaseAt)}.` : 'Opens later in this period.'}
        </p>
      </Card>
    );
  }
  if (next.outcome === CYCLE_OUTCOME.RETURNS) {
    cards.push(
      <Card key="next" pill="Next period" pillClass="badge badge-neutral" title={next.totalCycles ? `Period ${next.cycleNumber + 1} of ${next.totalCycles}` : 'Next period'}>
        <p className="text-sm text-[var(--text-secondary)]">
          Starts on {formatDate(next.returnsOn)} with {total} new update{total === 1 ? '' : 's'}, same plan and price. Its bill comes with the period.
        </p>
      </Card>
    );
  } else if (next.outcome === CYCLE_OUTCOME.FINISHED) {
    cards.push(
      <Card key="last" pill="Last period" pillClass="badge badge-neutral" title="Your plan ends with this period">
        <p className="text-sm text-[var(--text-secondary)]">To keep going after it, buy a new plan.</p>
      </Card>
    );
  }

  return (
    <section className="relative border-b border-[var(--glass-border)] px-5 py-4 sm:px-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{periodStart ? 'Your updates this period' : 'Your updates'}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards}</div>
    </section>
  );
};

export default PlanUpdateCards;
