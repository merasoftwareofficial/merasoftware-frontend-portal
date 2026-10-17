import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowRight,
  LayoutDashboard,
  PlusCircle,
  RefreshCw,
  Wallet,
  TriangleAlert,
  Layers3,
  Users2,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';
import SummaryApi from '../common';
import Context from '../context';
import { OrderList } from '../components/OrderListRow';
import GlassButton from '../components/GlassButton';
import Surface from '../components/Surface';
import displayINRCurrency from '../helpers/displayCurrency';
import { isProjectItem, isPlanItem, sortItemsLatestFirst } from '../helpers/orderType';
import { getRemainingDays, getOrderDisplayName, isActiveWorkItem, getOrderStateCode } from '../helpers/orderPresentation';
import { customerReturnState } from '../helpers/customerReturnNavigation';

const getItemLink = (order) =>
  isPlanItem(order) ? `/plan-details/${order._id}` : `/project-details/${order._id}`;

const MetricCard = ({ icon: Icon, label, value, helper, tone = 'neutral', to, state }) => {
  // The glow used to carry four colours — slate, blue, emerald, violet — and
  // three of them appeared nowhere else in the portal. It is decoration behind
  // a number, not a status, so it no longer tries to mean anything.
  //
  // A `highlight` prop used to paint one card green — but "you have no active
  // work" is not a success, and a green tile beside three plain ones read as a
  // status the others lacked. Emphasis now comes from the arrow affordance and
  // the card being a link, so all four look alike and only badges carry colour.
  // `neutral` used to read `bg-[rgb(var(--tint-rgb))]`, and --tint-rgb is
  // defined nowhere in the stylesheet — the neutral glow has been painting
  // nothing at all. --glow-neutral replaces it with a real value.
  //
  // The label is an eyebrow, not a heading. At text-base/semibold in
  // --text-primary it sat at the same weight as the value under it, so the four
  // tiles read as two competing lines each. It now matches the eyebrow shape
  // already used by Modal and WalletDetails (text-sm, bold, uppercase) but keeps
  // --text-secondary rather than --eyebrow-fg: four green labels would be colour
  // on something that is not a status.
  const glowMap = {
    neutral: 'bg-[var(--glow-neutral)]',
    emerald: 'bg-[var(--glow-accent)]',
  };

  const Wrapper = to ? Link : 'div';
  const wrapperProps = to ? { to, state } : {};

  return (
    <Surface
      as={Wrapper}
      tone="metric"
      sheen
      {...wrapperProps}
      className={[
        'group h-full p-5 transition-all duration-300',
        // A link lifts on hover; a plain measurement does not.
        to ? 'hover:-translate-y-1' : '',
        'hover:bg-[var(--glass-bg-hover)]',
        to ? 'block' : '',
      ].join(' ')}
    >
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full ${glowMap[tone] || glowMap.neutral} blur-3xl`}
        style={{ opacity: 'var(--glow-opacity)' }}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p>
          {helper ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{helper}</p> : null}
        </div>
        <div className={`rounded-2xl border p-3 backdrop-blur-md border-[var(--glass-border-strong)] bg-[var(--glass-bg)]`}>
          {to ? <ArrowRight className="h-5 w-5 text-[var(--text-primary)] transition-transform group-hover:translate-x-0.5" /> : <Icon className="h-5 w-5 text-[var(--text-primary)]" />}
        </div>
      </div>
    </Surface>
  );
};

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state?.user?.user);
  const context = useContext(Context);

  const [orders, setOrders] = useState([]);
  const [referredLeadsCount, setReferredLeadsCount] = useState(0);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(SummaryApi.ordersList.url, {
        method: SummaryApi.ordersList.method,
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        const allOrders = Array.isArray(data.data) ? [...data.data] : [];
        setOrders(allOrders);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchReferredLeadsCount = async () => {
    try {
      const response = await fetch(SummaryApi.myReferredLeads.url, {
        method: SummaryApi.myReferredLeads.method,
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        setReferredLeadsCount(Array.isArray(data.data) ? data.data.length : 0);
      }
    } catch (error) {
      console.error('Error fetching referred leads count:', error);
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchDashboardData();
      fetchReferredLeadsCount();
    }
  }, [user?._id]);

  const dashboardItems = useMemo(
    () =>
      orders
        .filter((order) => isProjectItem(order) || isPlanItem(order))
        .sort(sortItemsLatestFirst)
        .slice(0, 5),
    [orders]
  );

  const activeProjects = useMemo(
    () =>
      orders
        .filter((order) => isProjectItem(order) && isActiveWorkItem(order))
        .sort(sortItemsLatestFirst),
    [orders]
  );

  const activePlans = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            isPlanItem(order) &&
            isActiveWorkItem(order) &&
            // A plan also has to have validity left to be worth showing as active.
            getRemainingDays(order) > 0
        )
        .sort(sortItemsLatestFirst),
    [orders]
  );

  const activeWorkItemsCount = activeProjects.length + activePlans.length;

  const activeProject = useMemo(
    () => orders.find((order) => isProjectItem(order) && isActiveWorkItem(order)) || null,
    [orders]
  );

  const pendingApprovalCount = useMemo(
    () => orders.filter((order) => getOrderStateCode(order) === 'pending_approval').length,
    [orders]
  );

  const rejectedCount = useMemo(
    () => orders.filter((order) => getOrderStateCode(order) === 'rejected').length,
    [orders]
  );

  const openAlertsCount = pendingApprovalCount + rejectedCount;
  // OrderPage.js has separate "Pending" and "Rejected" tabs, no combined one —
  // when both kinds of alert exist, "All orders" is the closest single tab
  // that still shows everything the tile counted.
  const openAlertsTab =
    pendingApprovalCount > 0 && rejectedCount === 0
      ? 'pending'
      : rejectedCount > 0 && pendingApprovalCount === 0
        ? 'rejected'
        : 'all';

  const primaryWorkItem = activeProjects[0] || activePlans[0] || activeProject || null;
  const primaryAction = (() => {
    if (activeProjects.length === 1 && activePlans.length === 0) {
      return { label: 'Track Project', to: `/project-details/${activeProjects[0]._id}` };
    }

    if (activeProjects.length === 0 && activePlans.length === 1) {
      return { label: 'Request Website Update', to: '/my-updates' };
    }

    if (activeProjects.length > 0 && activePlans.length > 0) {
      return { label: `${activeWorkItemsCount} Active Services`, to: '/projects-and-plans' };
    }

    if (activeProjects.length > 1) {
      return { label: `${activeProjects.length} Active Projects`, to: '/projects-and-plans' };
    }

    if (activePlans.length > 1) {
      return { label: `${activePlans.length} Active Plans`, to: '/projects-and-plans' };
    }

    return { label: 'Explore Services', to: '/start-new-project' };
  })();

  useEffect(() => {
    if (typeof context?.updateActiveProject === 'function') {
      context.updateActiveProject(activeProject);
    }
  }, [activeProject, context]);

  const openItem = (order) => {
    navigate(getItemLink(order), { state: customerReturnState('/dashboard') });
  };

  return (
      <DashboardLayout user={user} activeProject={activeProject}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-7xl">
          {user?.isGuest ? (
            <div className="badge mx-auto mb-6 flex max-w-2xl items-center justify-center gap-2 badge-pending rounded-2xl px-4 py-2.5 text-center">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--badge-pending-fg)]" />
              <p className="text-sm font-medium">
                You're exploring a <span className="font-bold">Guest Demo Account</span> with ₹50,000 demo wallet money. Nothing here is real, and this account is cleared after 24 hours of inactivity.
              </p>
            </div>
          ) : null}

          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Dashboard
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Open the live project, check wallet balance, or start new work from here.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AnimatedSection delay={getStaggerDelay(0)} className="h-full"><MetricCard
              icon={LayoutDashboard}
              label={primaryWorkItem ? 'Live project' : 'Services'}
              value={primaryWorkItem ? getOrderDisplayName(primaryWorkItem, 'Active work') : primaryAction.label}
              helper={primaryWorkItem ? activeWorkItemsCount > 1 ? `${activeWorkItemsCount} active items` : primaryAction.label : 'No active work running'}
              to={primaryAction.to} state={customerReturnState('/dashboard')}
            /></AnimatedSection>
            <AnimatedSection delay={getStaggerDelay(1)} className="h-full"><MetricCard icon={Wallet} label="Wallet balance" value={displayINRCurrency(context?.walletBalance || 0)} helper="Available wallet amount" tone="neutral" to="/wallet" state={customerReturnState('/dashboard')} /></AnimatedSection>
            <AnimatedSection delay={getStaggerDelay(2)} className="h-full"><MetricCard
              icon={TriangleAlert}
              label="Open alerts"
              value={String(pendingApprovalCount + rejectedCount)}
              helper="Pending approvals and rejected payments"
              tone="neutral"
              to={openAlertsCount > 0 ? '/order' : undefined}
              state={openAlertsCount > 0 ? { ...customerReturnState('/dashboard'), initialTab: openAlertsTab } : undefined}
            /></AnimatedSection>
            <AnimatedSection delay={getStaggerDelay(3)} className="h-full"><MetricCard icon={Users2} label="People connected" value={String(referredLeadsCount)} helper="Leads you referred" tone="neutral" to="/my-referred-leads" state={customerReturnState('/dashboard')} /></AnimatedSection>
          </div>

          <OrderList
            className="mt-10"
            title="Recent projects & plans"
            actions={(
              <>
                <GlassButton as={Link} to="/order">
                  View all orders
                  <ArrowRight className="h-4 w-4" />
                </GlassButton>
                <GlassButton onClick={fetchDashboardData}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </GlassButton>
              </>
            )}
            items={dashboardItems}
            onOpen={openItem}
            emptyIcon={Layers3}
            empty={(
              <>
                <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">No projects or plans yet</h3>
                <p className="mt-2 text-base text-[var(--text-secondary)]">
                  Your admin-created projects and purchased services will appear here.
                </p>
                <div className="mt-5">
                  <GlassButton as={Link} to="/start-new-project" variant="primary" size="lg">
                    <PlusCircle className="h-4 w-4" />
                    Explore Services
                  </GlassButton>
                </div>
              </>
            )}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CustomerDashboard;
