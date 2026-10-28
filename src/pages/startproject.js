import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';
import { ProjectArt, PlansArt } from '../components/GetServiceArt';

// "Get a Service" (/start-new-project): one screen with two choices, each with one button.
// Start a Project → pages/StartProjectRequest.js (callback request); Buy a Service → the plans
// page (pages/StartNewProject.js). The pictures (components/GetServiceArt.js) are decoration only.

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
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto w-full max-w-5xl">
          <CustomerPageHeader title="What would you like to do?" subtitle="Start something new with us, or keep your website fresh every month." />

          <div className="mt-10 flex flex-col gap-5">
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
      </div>
    </DashboardLayout>
  );
};

export default StartProject;
