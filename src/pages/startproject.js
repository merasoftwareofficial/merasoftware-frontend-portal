import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from '../components/DashboardLayout';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';

// "Get a Service" (/start-new-project): one screen with two choices, each with one button.
// Start a Project → pages/StartProjectRequest.js (callback request); Buy a Service → the plans
// page (pages/StartNewProject.js). The pictures are decoration only, nothing in them is clickable.

const line = 'block h-1.5 rounded bg-[var(--glass-border)]';

// New work: a dashed sketch behind, the finished site in front, a phone beside it.
const ProjectArt = () => (
  <div aria-hidden="true" className="relative h-44 overflow-hidden rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] lg:h-48">
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300/20 blur-3xl" />
    <div className="absolute left-[14%] top-[20%] grid h-[62%] w-[46%] content-start gap-2 rounded-xl border-[1.5px] border-dashed border-[var(--glass-border-strong)] p-3.5 transition-transform duration-300 group-hover:-translate-x-1 group-hover:translate-y-0.5">
      <i className="block h-1.5 w-3/5 rounded border border-dashed border-[var(--glass-border-strong)]" />
      <i className="block h-1.5 rounded border border-dashed border-[var(--glass-border-strong)]" />
      <i className="block h-1.5 w-2/5 rounded border border-dashed border-[var(--glass-border-strong)]" />
    </div>
    <div className="absolute left-[32%] top-[14%] h-[66%] w-1/2 overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--page-bg)] shadow-[0_20px_40px_-24px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1">
      <div className="flex gap-1 border-b border-[var(--glass-border)] px-2.5 py-2">
        {[0, 1, 2].map((dot) => <i key={dot} className="h-1.5 w-1.5 rounded-full bg-[var(--glass-border-strong)]" />)}
      </div>
      <div className="m-2.5 h-[34%] rounded-lg bg-gradient-to-r from-[var(--accent-soft-bg)] to-transparent" />
      <i className={`${line} mx-2.5 mb-1.5`} />
      <i className={`${line} mx-2.5 w-2/5`} />
    </div>
    <div className="absolute left-[74%] top-[38%] grid h-1/2 w-[13%] min-w-[42px] content-start gap-1.5 rounded-[10px] border border-[var(--glass-border)] bg-[var(--page-bg)] p-1.5 shadow-[0_16px_30px_-18px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-1.5">
      <i className="block h-5 rounded bg-[var(--accent-soft-bg)]" />
      <i className={line} />
      <i className={line} />
    </div>
  </div>
);

// Ongoing work: three months of updates, the next one waiting.
const MONTHS = [['October', ['done', 'done', 'done']], ['November', ['done', 'next', '']], ['December', ['', '', '']]];
const PlansArt = () => (
  <div aria-hidden="true" className="relative h-44 overflow-hidden rounded-[22px] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] lg:h-48">
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-300/20 blur-3xl" />
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

const CHOICES = [
  {
    id: 'project',
    kind: 'New work',
    title: 'Start a Project',
    text: 'A new website, online store or app, built for you. Tell us what you need and our team will call you with a proposal.',
    action: 'Start a Project',
    to: '/start-new-project/project',
    Art: ProjectArt,
  },
  {
    id: 'plans',
    kind: 'Ongoing work',
    title: 'Buy a Service',
    text: 'Monthly plans for regular website updates. Pick what you need, see the price, and pay right here.',
    action: 'Browse Plans',
    to: '/start-new-project/services',
    Art: PlansArt,
  },
];

const StartProject = () => {
  const user = useSelector((state) => state?.user?.user);

  return (
    <DashboardLayout user={user}>
      <div className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
              Get a Service
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              What would you like to do?
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Start something new with us, or keep your website fresh every month.
            </p>
          </div>

          {CHOICES.map(({ id, kind, title, text, action, to, Art }, index) => (
            <AnimatedSection key={id} delay={getStaggerDelay(index)}>
              <section className="group relative grid items-center gap-6 overflow-hidden rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300 hover:border-[var(--accent-soft-border)] sm:p-7 md:grid-cols-2 md:gap-9">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                <div className={`relative flex min-w-0 flex-col items-start gap-2 ${index % 2 ? 'md:order-2' : ''}`}>
                  <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent-soft-fg)]">{kind}</span>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] lg:text-3xl">{title}</h2>
                  <p className="max-w-md text-base text-[var(--text-secondary)]">{text}</p>
                  <Link
                    to={to}
                    className="mt-2 inline-flex items-center gap-2.5 rounded-2xl bg-[rgb(var(--ink-rgb))] px-5 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
                  >
                    {action}
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                  </Link>
                </div>
                <div className="relative order-first md:order-none"><Art /></div>
              </section>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StartProject;
