import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import SummaryApi from '../common';
import { RefreshCw, Sparkles, CalendarClock, AlertTriangle, Lock } from 'lucide-react';
import TriangleMazeLoader from '../components/TriangleMazeLoader';
import DashboardLayout from '../components/DashboardLayout';
import UpdateRequestModal from '../components/UpdateRequestModal'
import { getNextCycleOutcome, getTimeUntilText, CYCLE_OUTCOME } from '../helpers/servicePlanCycle';

// ---------------------------------------------------------------------------
// UI-ONLY MOCK DATA
// Temporary sample plans used to design/review every card state side-by-side.
// Shaped like real order objects, but not fetched from the API.
// Will be removed once this design is wired to live data in a later phase.
// ---------------------------------------------------------------------------
const MOCK_PLANS = [
  {
    _id: 'mock-simple-active',
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatesUsed: 2,
    planStatus: 'active',
    productId: {
      serviceName: 'Basic Website Support',
      updateCount: 5,
      validityPeriod: 30,
      isMonthlyLimitedPlan: false,
      isMonthlyRenewablePlan: false,
    },
  },
  {
    _id: 'mock-simple-usedup',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatesUsed: 3,
    planStatus: 'active',
    productId: {
      serviceName: 'Website Single Section Addition',
      updateCount: 3,
      validityPeriod: 30,
      isMonthlyLimitedPlan: false,
      isMonthlyRenewablePlan: false,
    },
  },
  {
    _id: 'mock-simple-expired',
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updatesUsed: 1,
    planStatus: 'active',
    productId: {
      serviceName: 'Landing Page Refresh Plan',
      updateCount: 4,
      validityPeriod: 30,
      isMonthlyLimitedPlan: false,
      isMonthlyRenewablePlan: false,
    },
  },
  {
    _id: 'mock-recurring-active',
    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
    planStatus: 'active',
    autoRenewalStatus: 'active',
    currentMonthUpdatesUsed: 0,
    currentMonthUpdatesLimit: 1,
    currentMonthExpiryDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyLimitResetDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    totalYearlyDaysRemaining: 210,
    productId: {
      serviceName: 'Support Portal — Monthly Care Plan',
      isMonthlyLimitedPlan: true,
      isMonthlyRenewablePlan: false,
      monthlyUpdateLimit: 1,
      yearlyPlanDuration: 365,
    },
  },
  {
    _id: 'mock-recurring-usedup',
    createdAt: new Date(Date.now() - 55 * 24 * 60 * 60 * 1000).toISOString(),
    planStatus: 'active',
    autoRenewalStatus: 'active',
    currentMonthUpdatesUsed: 1,
    currentMonthUpdatesLimit: 1,
    currentMonthExpiryDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyLimitResetDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    totalYearlyDaysRemaining: 155,
    productId: {
      serviceName: 'Support Portal — Single Update',
      isMonthlyLimitedPlan: true,
      isMonthlyRenewablePlan: false,
      monthlyUpdateLimit: 1,
      yearlyPlanDuration: 365,
    },
  },
  {
    _id: 'mock-recurring-paused',
    createdAt: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString(),
    planStatus: 'active',
    autoRenewalStatus: 'paused',
    currentMonthUpdatesUsed: 0,
    currentMonthUpdatesLimit: 1,
    currentMonthExpiryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyLimitResetDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    totalYearlyDaysRemaining: 90,
    productId: {
      serviceName: 'Yearly Renewable Plan',
      isMonthlyLimitedPlan: false,
      isMonthlyRenewablePlan: true,
      monthlyRenewalPrice: 3000,
      yearlyPlanDuration: 365,
    },
  },
  {
    _id: 'mock-recurring-yearly-ended',
    createdAt: new Date(Date.now() - 360 * 24 * 60 * 60 * 1000).toISOString(),
    planStatus: 'active',
    autoRenewalStatus: 'expired',
    currentMonthUpdatesUsed: 0,
    currentMonthUpdatesLimit: 1,
    currentMonthExpiryDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyLimitResetDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    totalYearlyDaysRemaining: 0,
    productId: {
      serviceName: 'Yearly Renewable Plan',
      isMonthlyLimitedPlan: false,
      isMonthlyRenewablePlan: true,
      monthlyRenewalPrice: 3000,
      yearlyPlanDuration: 365,
    },
  },
  {
    _id: 'mock-closed',
    createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    planStatus: 'closed',
    autoRenewalStatus: 'paused',
    currentMonthUpdatesUsed: 0,
    currentMonthUpdatesLimit: 1,
    currentMonthExpiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    monthlyLimitResetDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalYearlyDaysRemaining: 40,
    productId: {
      serviceName: 'Support Portal — Closed by Admin',
      isMonthlyLimitedPlan: true,
      isMonthlyRenewablePlan: false,
      monthlyUpdateLimit: 1,
      yearlyPlanDuration: 365,
    },
  },
];

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getCardVisualStatus = (plan) => {
  const snapshot = plan.servicePlanSnapshot || {};
  const limit = Number(snapshot.portalAccessCount || 0);
  const used = Number(plan.serviceAccessUsedInCycle || 0);
  const remaining = Math.max(0, limit - used);
  const nextCycle = getNextCycleOutcome(plan);

  if (plan.servicePlanStatus === 'paused') return { badge: 'Payment overdue', tone: 'paused', remaining, limit, nextCycle };
  if (['expired', 'inactive', 'cancelled'].includes(plan.servicePlanStatus)) return { badge: 'Plan ended', tone: 'expired', remaining, limit, nextCycle };
  if (remaining <= 0) return { badge: 'Updates used', tone: 'used_up', remaining, limit, nextCycle };
  return { badge: 'Active', tone: 'active', remaining, limit, nextCycle };
};

// Light-only pairs before this: `bg-emerald-100 text-emerald-700` reads fine on a
// white card but measures 2.99 on a dark one, and the opaque -100 fills sat on the
// dark page as lit patches (14.4:1). Badge's recipes define both directions.
const BADGE_TONE_CLASSES = {
  active: 'badge badge-success',
  used_up: 'badge badge-pending',
  expired: 'badge badge-neutral',
  paused: 'badge badge-error',
  closed: 'badge badge-neutral',
};

const UserUpdateDashboard = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state?.user?.user);
  const [updatePlans, setUpdatePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Fetch user's orders using your existing getUserOrders API
  const fetchUserUpdatePlans = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.ordersList.url, {
        method: SummaryApi.ordersList.method,
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        // Service plans own their upload allowance on the frozen order snapshot. Reminder-only
        // services have no customer upload action, so they do not belong on this screen.
        const userUpdatePlans = data.data.filter(order =>
          order.isServicePlan &&
          order.isActive &&
          order.servicePlanSnapshot?.serviceBehavior !== 'reminder_only' &&
          Number(order.servicePlanSnapshot?.portalAccessCount || 0) > 0
        );
        setUpdatePlans(userUpdatePlans || []);
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error('Error fetching update plans:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserUpdatePlans();
  }, []);

  const handleRequestUpdate = (plan) => {
    setSelectedPlan(plan);
    setShowRequestModal(true);
  };

  if (loading) {
    return (
      <DashboardLayout user={user}>
        <div className="fixed inset-0 flex items-center justify-center">
          <TriangleMazeLoader />
        </div>
      </DashboardLayout>
    );
  }

  const plansToRender = updatePlans;

  return (
    <DashboardLayout user={user}>
      <div
        className="min-h-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
      >
        <section className="glass-panel mx-auto max-w-7xl overflow-hidden rounded-[2rem]">
          <div className="rounded-t-[2rem] border-b border-[var(--divider)] bg-[var(--glass-bg-subtle)] px-5 py-5 text-[var(--text-primary)] sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-3 py-1 text-sm font-semibold uppercase text-[var(--badge-success-fg)]">
              <Sparkles className="h-3.5 w-3.5" />
              My Updates
            </div>
            <h1 className="mt-3 max-w-xl text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              My Website Update Plans
            </h1>
          </div>

          <div className="p-5 sm:p-6">
            {plansToRender.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-8 text-center">
                <p className="text-base text-[var(--text-primary)] mb-4">You don't have any active update plans.</p>
                <button
                  onClick={() => window.location.href = '/website-updates'}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[rgb(var(--ink-rgb))] px-4 py-2.5 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)]"
                >
                  Browse Update Plans
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {plansToRender.map(plan => {
                  const status = getCardVisualStatus(plan);
                  const product = plan.productId || {};
                  const canRequest = status.tone === 'active';

                  return (
                    <div key={plan._id} className="glass-panel rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{product.serviceName}</h3>
                        <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONE_CLASSES[status.tone]}`}>
                          {status.badge}
                        </span>
                      </div>

                      {status.isRecurring ? (
                        <div className="space-y-4 mb-4">
                          {/* This month's updates */}
                          <div>
                            <div className="flex justify-between text-sm text-[var(--text-primary)] mb-1">
                              <span>This Month's Updates</span>
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {Math.max(0, (plan.currentMonthUpdatesLimit || product.monthlyUpdateLimit || 1) - (plan.currentMonthUpdatesUsed || 0))} of {plan.currentMonthUpdatesLimit || product.monthlyUpdateLimit || 1}
                              </span>
                            </div>
                            <div className="w-full bg-[var(--glass-bg-strong)] rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-[rgb(var(--ink-rgb))]"
                                style={{
                                  width: `${Math.min(100, ((plan.currentMonthUpdatesUsed || 0) / (plan.currentMonthUpdatesLimit || product.monthlyUpdateLimit || 1)) * 100)}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          {/* Resets on */}
                          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] bg-[var(--glass-bg-subtle)] rounded-lg px-3 py-2">
                            <CalendarClock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                            <span>Resets on <span className="font-medium text-[var(--text-primary)]">{formatDate(plan.monthlyLimitResetDate || plan.currentMonthExpiryDate)}</span></span>
                          </div>

                          {/* Yearly plan */}
                          <div>
                            <div className="flex justify-between text-sm text-[var(--text-primary)] mb-1">
                              <span>Yearly Plan</span>
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {plan.totalYearlyDaysRemaining ?? 0} of {product.yearlyPlanDuration || 365} days left
                              </span>
                            </div>
                            <div className="w-full bg-[var(--glass-bg-strong)] rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-[rgb(var(--ink-rgb))]"
                                style={{
                                  width: `${Math.min(100, ((plan.totalYearlyDaysRemaining ?? 0) / (product.yearlyPlanDuration || 365)) * 100)}%`
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 mb-4">
                          {/* Updates Remaining */}
                          <div>
                            <div className="flex justify-between text-sm text-[var(--text-primary)] mb-1">
                              <span>{plan.servicePlanSnapshot?.limitScope === 'per_month' ? 'Updates this cycle' : 'Updates remaining'}</span>
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {status.remaining} of {status.limit}
                              </span>
                            </div>
                            <div className="w-full bg-[var(--glass-bg-strong)] rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-[rgb(var(--ink-rgb))]"
                                style={{
                                  width: `${Math.min(100, ((status.remaining || 0) / (status.limit || 1)) * 100)}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          {/* A cycle is only promised when the server's own renewal facts say it is. */}
                          <div>
                            <div className="flex justify-between text-sm text-[var(--text-primary)] mb-1">
                              <span>{status.nextCycle.outcome === CYCLE_OUTCOME.RETURNS ? 'Resets on' : 'Plan status'}</span>
                              <span className="text-base font-medium text-[var(--text-primary)]">
                                {status.nextCycle.outcome === CYCLE_OUTCOME.RETURNS
                                  ? formatDate(status.nextCycle.returnsOn)
                                  : status.nextCycle.outcome === CYCLE_OUTCOME.FINISHED ? 'Complete' : 'One-time plan'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4">
                        <button
                          onClick={() => handleRequestUpdate(plan)}
                          disabled={!canRequest}
                          className={`w-full py-2 rounded-lg text-base font-medium flex items-center justify-center ${
                            canRequest
                              ? 'bg-[rgb(var(--ink-rgb))] text-[var(--page-bg)] hover:bg-[rgb(var(--ink-rgb)/0.85)]'
                              : 'bg-[var(--glass-bg-subtle)] text-[var(--text-muted)] cursor-not-allowed'
                          }`}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Request Website Update
                        </button>

                        {/* This page lists plans, not uploads — a customer could send data
                            from here but had nowhere to see what they had already sent.
                            The plan's own page carries the full history and the zip
                            download, so it links there rather than repeating the list.
                            Hidden for the MOCK_PLANS rows this page still renders, whose
                            ids resolve to no real order. */}
                        <button
                          type="button"
                          onClick={() => navigate(`/plan-details/${plan._id}`)}
                          className="mt-2 w-full rounded-lg border border-[var(--glass-border)] py-2 text-base font-medium text-[var(--text-secondary)] transition hover:bg-[var(--glass-bg-subtle)]"
                        >
                          View uploaded data
                        </button>

                        {status.tone === 'used_up' && (
                          <p className="mt-2 text-center text-sm text-[var(--badge-pending-fg)]">
                            {status.nextCycle.outcome === CYCLE_OUTCOME.RETURNS
                              ? `You can send again ${getTimeUntilText(status.nextCycle.returnsOn)}.`
                              : status.nextCycle.outcome === CYCLE_OUTCOME.FINISHED
                                ? 'This plan has delivered everything it was bought for. Buy a new plan to keep sending.'
                                : 'You have used everything on this plan. Buy a new plan to keep sending.'}
                          </p>
                        )}

                        {status.tone === 'expired' && (
                          <p className="text-[var(--text-secondary)] text-sm mt-2 text-center">
                            Your update plan has expired. Please purchase a new plan.
                          </p>
                        )}

                        {status.tone === 'paused' && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-3 py-2 text-sm text-[var(--badge-error-fg)]">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              Payment overdue for this plan. Clear the pending invoice to continue requesting updates.{' '}
                              <a href="/my-invoices" className="font-semibold underline underline-offset-2 hover:text-[var(--text-primary)]">
                                View invoices
                              </a>
                            </span>
                          </div>
                        )}

                        {status.tone === 'closed' && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--glass-bg-strong)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>This plan was closed. Contact support if this looks wrong.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {showRequestModal && selectedPlan && (
        <UpdateRequestModal
          plan={selectedPlan}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedPlan(null);
          }}
          onSubmitSuccess={fetchUserUpdatePlans}
        />
      )}
    </DashboardLayout>
  );
};

export default UserUpdateDashboard;
