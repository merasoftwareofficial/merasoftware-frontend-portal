import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { goToCustomerReturn } from '../helpers/customerReturnNavigation';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import PlanBuilder from '../components/PlanBuilder';
import { initialPlanChoice, isFlexiblePlan } from '../helpers/serviceTenure';
import { readCustomerPlanCatalogue } from '../helpers/customerPlanCatalogue';
import { evaluateServiceSurface, SURFACE } from '../helpers/serviceDependency';
import { checkoutPath } from '../helpers/planCheckout';

const LIMIT_SCOPE_LABELS = {
  per_day: 'per day',
  per_week: 'per week',
  per_month: 'per month',
  per_quarter: 'per quarter',
  per_6_month: 'every 6 months',
  per_year: 'per year',
  per_plan: 'per plan',
  manual: 'per custom cycle',
};

const MANUAL_UNIT_LABELS = {
  day: 'day(s)',
  week: 'week(s)',
  month: 'month(s)',
};

// How to buy, for how long and the price come from the plan builder (components/PlanBuilder.js):
// its choices from helpers/serviceTenure.js, its price from the backend quote.

const getPortalAccessLine = (servicePlan) => {
  if (!servicePlan) return null;

  if (servicePlan.limitScope === 'unlimited') {
    return 'Unlimited portal access';
  }

  if (servicePlan.limitScope === 'manual') {
    const unitLabel = MANUAL_UNIT_LABELS[servicePlan.manualUnit] || '';
    return `${servicePlan.manualCount} use(s) per ${servicePlan.manualCount === 1 ? unitLabel.replace('(s)', '') : unitLabel}`;
  }

  const scopeLabel = LIMIT_SCOPE_LABELS[servicePlan.limitScope] || '';
  return `${servicePlan.portalAccessCount} use(s) ${scopeLabel}`;
};

const SectionHeading = ({ children }) => (
  <h2 className="border-b border-[var(--glass-border)] pb-2 text-xl font-bold text-[var(--text-primary)]">
    {children}
  </h2>
);

const ServicePlanDetailScreen = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { planId } = useParams();
  const [plan, setPlan] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState('More plans');
  const [loadError, setLoadError] = useState('');

  // What the builder chose + the backend quote for it. Paying happens on the checkout page
  // (pages/PlanCheckout.js), which this page opens with the same choice.
  const [builder, setBuilder] = useState({ ready: false, quote: null, body: null });

  useEffect(() => {
    const controller = new AbortController();
    readCustomerPlanCatalogue(controller.signal).then(catalogue => {
      if (controller.signal.aborted) return;
      const found = catalogue.plans.find(row => row._id === planId);
      setPlan(found || null);
      setCategoryLabel(catalogue.categories.find(row => row.key === found?.servicePlan?.categoryKey)?.label || 'More plans');
      if (!found) setLoadError('This plan is no longer available. Explore the current plans instead.');
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error.message || 'Could not load this service.');
    }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => controller.abort();
  }, [planId]);

  const handleBack = () => goToCustomerReturn(navigate, location, '/start-new-project/services?tab=services');

  // overflow-clip (not hidden) on the page wrapper: an overflow-hidden ancestor would stop the
  // builder's bill from staying sticky (PlanBuilder.js). Header and Back: components/CustomerPageHeader.js.
  const page = (header, content) => (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-clip px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto w-full max-w-7xl">
          {header}
          <div className={header ? 'mt-10' : ''}>{content}</div>
        </div>
      </div>
    </DashboardLayout>
  );

  if (!loaded) return page(null, <GlassPageState message="Loading service details…" />);

  if (!plan) {
    return page(
      <CustomerPageHeader title="Plan not available" onBack={handleBack} />,
      <GlassPageState type="error" message={loadError || 'This service could not be found.'} onRetry={() => window.location.reload()} />,
    );
  }

  const servicePlan = plan.servicePlan || {};
  const description = plan.formattedDescriptions?.[0]?.content || '';
  const eligibility = evaluateServiceSurface(plan, SURFACE.STANDALONE);
  const isReminderOnly = servicePlan.capability === 'send_reminders';
  // A flexible plan's files and updates are chosen in the builder, so its fixed limits are not listed.
  const flexible = isFlexiblePlan(plan);
  const portalAccessLine = flexible ? null : getPortalAccessLine(servicePlan);
  const showWhatYouGet = !isReminderOnly && !flexible && (portalAccessLine || servicePlan.filesLimit);

  // The plan's own information, shown above the builder steps (left column).
  const intro = (description || showWhatYouGet || isReminderOnly) ? (
    <section className="flex flex-col gap-6 rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-5 sm:p-6">
      {description && (
        <div>
          <SectionHeading>What is this plan?</SectionHeading>
          <div
            className="prose prose-lg prose-invert mt-3 max-w-none text-base leading-7 text-[var(--text-secondary)]"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        </div>
      )}
      {/* A reminder-only service has no portal allowance to list. */}
      {showWhatYouGet && (
        <div>
          <SectionHeading>What You Get</SectionHeading>
          <ul className="mt-3 space-y-2">
            {portalAccessLine && (
              <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-soft-fg)]" />
                {portalAccessLine}
              </li>
            )}
            {servicePlan.filesLimit && (
              <li className="flex items-start gap-2.5 text-base text-[var(--text-secondary)]">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-soft-fg)]" />
                Up to {servicePlan.filesLimit} file(s) per request
              </li>
            )}
          </ul>
        </div>
      )}
      {isReminderOnly && <p className="text-sm text-[var(--text-secondary)]">We do the work and post progress updates on your plan. No file uploads are needed.</p>}
    </section>
  ) : null;

  // Purchase action — shown inside the builder's sticky bill (prototype layout). Paying, a payment
  // offer and the result are on the checkout page, which opens with this exact choice.
  const purchaseAction = (
    <div>
      <button
        type="button"
        onClick={() => navigate(checkoutPath(plan._id, builder.body, 'portal'))}
        disabled={!builder.ready}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
      >
        {builder.ready ? 'Continue to checkout →' : 'Working out the price…'}
      </button>
    </div>
  );

  // Not buyable here (needs a project, or not sold on its own): the plan's information and the reason.
  const notBuyable = (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {intro}
      <section className="flex flex-col gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] p-5 text-[var(--text-secondary)] sm:p-6">
        <SectionHeading>{eligibility.dependency === 'project_required' ? 'This plan needs a project' : 'This plan cannot be bought here'}</SectionHeading>
        <p>{eligibility.reason}</p>
        {eligibility.dependency === 'project_required' && <p>Open the project you want us to work on, then choose Add a Service and select this plan. If you have no eligible project, contact us before buying.</p>}
        <button type="button" className="self-start rounded-xl border border-[var(--glass-border-strong)] px-4 py-2 font-semibold text-[var(--text-primary)]" onClick={() => navigate('/projects-and-plans')}>Open my projects</button>
      </section>
    </div>
  );

  return page(
    <CustomerPageHeader title={plan.serviceName} subtitle={categoryLabel} onBack={handleBack} />,
    eligibility.allowed
      // The address may carry the choice made on the website's plan page (?purchase=&months=…).
      ? <PlanBuilder plan={plan} initial={initialPlanChoice(plan, location.search)} onChange={setBuilder} action={purchaseAction} intro={intro} />
      : notBuyable,
  );
};

// A plan-ID change remounts the purchase screen: no previous quote/payment state can leak.
export default function ServicePlanDetail() {
  const { planId } = useParams();
  return <ServicePlanDetailScreen key={planId} />;
}
