import React from 'react';

// Decorative pictures for Get a Service (pages/startproject.js) and the Start a Project chooser
// (pages/StartProjectRequest.js). Nothing in them is clickable. They move a little on the parent
// `group` hover, or when `lifted` is set (the chooser sets it each time the chosen type changes).

const line = 'block h-1.5 rounded bg-[var(--glass-border)]';
const stage = 'relative h-44 overflow-hidden rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] lg:h-48';
const glow = <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300/20 blur-3xl" />;

// New work: a dashed sketch behind, the finished site in front, a phone beside it.
export const ProjectArt = ({ lifted = false }) => (
  <div aria-hidden="true" className={stage}>
    {glow}
    <div className={`absolute left-[14%] top-[20%] grid h-[62%] w-[46%] content-start gap-2 rounded-xl border-[1.5px] border-dashed border-[var(--glass-border-strong)] p-3.5 transition-transform duration-300 group-hover:-translate-x-1 group-hover:translate-y-0.5 ${lifted ? '-translate-x-1 translate-y-0.5' : ''}`}>
      <i className="block h-1.5 w-3/5 rounded border border-dashed border-[var(--glass-border-strong)]" />
      <i className="block h-1.5 rounded border border-dashed border-[var(--glass-border-strong)]" />
      <i className="block h-1.5 w-2/5 rounded border border-dashed border-[var(--glass-border-strong)]" />
    </div>
    <div className={`absolute left-[32%] top-[14%] h-[66%] w-1/2 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--page-bg)] shadow-[0_20px_40px_-24px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1 ${lifted ? '-translate-y-1' : ''}`}>
      <div className="flex gap-1 border-b border-[var(--glass-border)] px-2.5 py-2">
        {[0, 1, 2].map((dot) => <i key={dot} className="h-1.5 w-1.5 rounded-full bg-[var(--glass-border-strong)]" />)}
      </div>
      <div className="m-2.5 h-[34%] rounded-lg bg-gradient-to-r from-[var(--accent-soft-bg)] to-transparent" />
      <i className={`${line} mx-2.5 mb-1.5`} />
      <i className={`${line} mx-2.5 w-2/5`} />
    </div>
    <div className={`absolute left-[74%] top-[38%] grid h-1/2 w-[13%] min-w-[42px] content-start gap-1.5 rounded-[10px] border border-[var(--glass-border)] bg-[var(--page-bg)] p-1.5 shadow-[0_16px_30px_-18px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1.5 ${lifted ? '-translate-y-1.5' : ''}`}>
      <i className="block h-5 rounded bg-[var(--accent-soft-bg)]" />
      <i className={line} />
      <i className={line} />
    </div>
  </div>
);

// Ongoing work: three months of updates, the next one waiting.
const MONTHS = [['October', ['done', 'done', 'done']], ['November', ['done', 'next', '']], ['December', ['', '', '']]];
export const PlansArt = () => (
  <div aria-hidden="true" className={stage}>
    {glow}
    <div className="absolute inset-0 grid grid-cols-3 items-end gap-3.5 px-6 pb-5 pt-6">
      {MONTHS.map(([month, updates]) => (
        <div key={month} className="flex flex-col items-center gap-2">
          <div className="flex w-full max-w-[92px] flex-col-reverse gap-1.5">
            {updates.map((state, index) => (
              <span
                key={index}
                className={`relative h-[22px] rounded-[7px] border transition-colors duration-300 ${state === 'done'
                  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)]'
                  : state === 'next'
                    ? 'border-dashed border-[var(--accent-soft-border)] bg-[var(--page-bg)] group-hover:bg-[var(--accent-soft-bg)]'
                    : 'border-[var(--glass-border)] bg-[var(--page-bg)]'}`}
              >
                {state === 'done' && <span className="absolute left-1/2 top-[44%] h-[5px] w-[9px] -translate-x-1/2 -translate-y-1/2 -rotate-45 border-b-2 border-l-2 border-[var(--accent-soft-fg)]" />}
              </span>
            ))}
          </div>
          <b className="text-xs font-semibold text-[var(--text-muted)]">{month}</b>
        </div>
      ))}
    </div>
  </div>
);
