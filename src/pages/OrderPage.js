import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  FileText,
  LayoutGrid,
  Layers3,
  RefreshCw,
} from 'lucide-react';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import CustomerWorkspaceTabs from '../components/CustomerWorkspaceTabs';
import displayINRCurrency from '../helpers/displayCurrency';
import { isOrderApproved } from '../helpers/orderVisibility';
import PaymentStatusChip from '../components/PaymentStatusChip';
import Badge from '../components/Badge';
import GlassButton from '../components/GlassButton';
import { OrderList } from '../components/OrderListRow';
import { isProjectItem, isPlanItem } from '../helpers/orderType';
import { getOrderCategoryLabel, getOrderDisplayName, getItemStatusMeta } from '../helpers/orderPresentation';
import { customerChildState } from '../helpers/customerReturnNavigation';

// Display label for one order. Derived by backend/helpers/orderStatusEngine.js and delivered on
// the order as `orderState`, so this page can no longer disagree with the project list or the
// admin workspace about what an order's state is.
//
// This page's own version of these rules had no 'cancelled' branch at all, so a cancelled order
// fell through to its progress and read "Completed"; and it collapsed every approved order into
// "In progress", so an order at 0% and one with a payment due were indistinguishable.
const getOrderStatus = (order) => {
  if (!order) return 'Processing';
  if (order.orderState?.label) return order.orderState.label;

  // ── fallback: payloads that predate the engine ──
  if (order.orderVisibility === 'cancelled') return 'Cancelled';
  if (order.orderVisibility === 'payment-rejected') return 'Rejected';
  if (order.orderVisibility === 'pending-approval') return 'Pending approval';
  if (order.projectProgress >= 100 || order.currentPhase === 'completed') return 'Completed';
  if (isOrderApproved(order)) return 'In progress';
  return 'Processing';
};

// The filter tabs and their counts group orders by MEANING, never by the displayed wording — a
// label change (or a plan reading "Active" where a project reads "In Progress · 40%") must not
// silently empty a tab. `code` is the engine's stable machine value and is what they compare.
const getOrderStatusCode = (order) => {
  if (order?.orderState?.code) return order.orderState.code;

  // ── fallback: derive a code from the same conditions the label fallback uses ──
  if (order?.orderVisibility === 'cancelled') return 'cancelled';
  if (order?.orderVisibility === 'payment-rejected') return 'rejected';
  if (order?.orderVisibility === 'pending-approval') return 'pending_approval';
  if (order?.projectProgress >= 100 || order?.currentPhase === 'completed') return 'completed';
  if (isOrderApproved(order)) return 'in_progress';
  return 'processing';
};

// Which tab an order belongs under. Grouped rather than one-code-per-tab so states the tabs were
// never written for (payment due, not-yet-started, active/closed plans) land somewhere sensible
// instead of vanishing from every tab but "All".
const TAB_CODES = {
  pending: ['pending_approval', 'processing'],
  active: ['in_progress', 'approved_not_started', 'payment_due', 'plan_active'],
  completed: ['completed', 'plan_closed'],
  rejected: ['rejected', 'cancelled'],
};

const matchesTab = (order, tab) => {
  if (tab === 'all') return true;
  return (TAB_CODES[tab] || []).includes(getOrderStatusCode(order));
};

// The status pill.
//
// It used to carry its own five-entry colour map, and two of the five were
// broken: `bg-blue-500 text-[var(--text-primary)]` puts dark slate text on a
// blue fill in light mode (and blue is not in the portal palette at all), and
// `bg-amber-500 text-[var(--text-primary)]` does the same on amber. The
// remaining `text-emerald-300 on bg-emerald-500/20` measures 1.21:1 on the
// light page.
//
// The tone now comes from getItemStatusMeta — the same helper the projects list
// uses — so the same order can no longer be one colour here and another there.
// The label is still this page's own getOrderStatus, so no wording changes.
// The little per-status icons are gone: the portal's status badge (projects and
// plans) has never had one, and two badges for the same thing should not differ.
const OrderStatusBadge = ({ order, status }) => (
  <Badge tone={getItemStatusMeta(order).tone}>{status}</Badge>
);

const getPurchaseTypeLabel = (order) => {
  if (isPlanItem(order)) {
    return order.productId?.isMonthlyRenewablePlan || order.productId?.isMonthlyLimitedPlan
      ? 'Monthly plan'
      : 'Plan';
  }

  if (isProjectItem(order)) {
    return 'Project';
  }

  return 'Order';
};

// Purchase history shows the same orders as the projects list against its own
// columns. That difference was the whole reason this page had a second copy of
// the list panel; now it is five lines of data.
//
// These headers are what names each value in a row, which is why the rows themselves no
// longer repeat the names underneath. The panel's old "Total: n" chip went for the same
// reason — the All orders tab already carries that count in its label.
const PURCHASE_COLUMNS = [
  { label: 'Order', className: 'col-span-12 lg:col-span-5' },
  { label: 'Type', className: 'col-span-6 lg:col-span-2' },
  { label: 'Status', className: 'col-span-6 lg:col-span-2' },
  { label: 'Purchased', className: 'col-span-6 lg:col-span-2' },
  { label: 'Price', className: 'col-span-6 lg:col-span-1 text-right' },
];

const OrderRow = ({ order, navigate, location, formatDate }) => {
  const handleClick = () => {
    navigate(`/order-detail/${order._id}`, { state: customerChildState(location) });
  };

  const status = getOrderStatus(order);
  const purchaseType = getPurchaseTypeLabel(order);
  const isProject = isProjectItem(order);
  const isPlan = isPlanItem(order);
  const category = getOrderCategoryLabel(order);
  const price = displayINRCurrency(order.price || order.totalPrice || 0);

  return (
    <button
      onClick={handleClick}
      type="button"
      className="grid w-full grid-cols-12 gap-3 bg-[var(--glass-bg-subtle)] px-5 py-4 text-left transition hover:bg-[var(--glass-bg-hover)] sm:px-6"
    >
      <div className="col-span-12 lg:col-span-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-primary)] backdrop-blur-md">
            {isProject ? <LayoutGrid className="h-5 w-5" /> : isPlan ? <Layers3 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </div>
          {/* The type badge that sat above the name is gone: the row's own Type column,
              four columns to the right, already carries that same word. */}
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-[var(--text-primary)]">
              {getOrderDisplayName(order)}
            </h3>
            {category ? <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{category}</p> : null}
            <p className="mt-2 text-sm text-[var(--text-secondary)] sm:hidden">
              Purchased {formatDate(order.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Each column is already named by the header above it, so naming it again inside
          every row said nothing twice: "Purchased" over a date with "Purchased on" beneath
          it, "Price" over an amount with "Price" beneath it, and "Type" over the word
          Project with "Project purchase" beneath that — a sentence explaining a word by
          repeating it. The values stay exactly as they were; only the restated labels go. */}
      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <p className="text-base font-semibold text-[var(--text-primary)]">{purchaseType}</p>
      </div>

      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <OrderStatusBadge order={order} status={status} />
      </div>

      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <div className="flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          <Calendar size={14} />
          <span>{formatDate(order.createdAt)}</span>
        </div>
      </div>

      <div className="col-span-6 flex items-center justify-between lg:col-span-1 lg:justify-end">
        <div className="text-right">
          <p className="text-base font-semibold text-[var(--text-primary)]">{price}</p>
          <div className="mt-1 flex lg:justify-end">
            <PaymentStatusChip order={order} />
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-[var(--text-muted)]" />
      </div>
    </button>
  );
};

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Lets a caller (e.g. the Dashboard "Open alerts" tile) deep-link straight
  // into a specific tab instead of always landing on "All orders".
  const [activeTab, setActiveTab] = useState(location.state?.initialTab || 'all');
  const [activeProject, setActiveProject] = useState(null);

  useEffect(() => {
    fetchOrders();

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.ordersList.url, {
        method: SummaryApi.ordersList.method,
        credentials: 'include',
      });

      const data = await response.json();
      if (data.success) {
        const allOrders = Array.isArray(data.data) ? [...data.data] : [];
        allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setOrders(allOrders);

        // The one project still being worked on. Derived from the engine's state code so a
        // cancelled project cannot qualify — the previous version excluded only pending and
        // rejected, so a cancelled project was still picked up as the customer's active work.
        const activeProj = allOrders.find((order) => {
          // The shared orderType.js rule, so a project in any admin-created category counts.
          if (!isProjectItem(order)) return false;

          const code = getOrderStatusCode(order);
          if (code) return ['in_progress', 'approved_not_started', 'payment_due'].includes(code);

          // ── fallback: payloads that predate the engine ──
          if (['pending-approval', 'payment-rejected', 'cancelled'].includes(order.orderVisibility)) {
            return false;
          }
          return order.projectProgress < 100 || order.currentPhase !== 'completed';
        });

        setActiveProject(activeProj || null);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
  };

  const filteredOrders = orders.filter((order) => matchesTab(order, activeTab));

  const statusCounts = {
    all: orders.length,
    pending: orders.filter((order) => matchesTab(order, 'pending')).length,
    active: orders.filter((order) => matchesTab(order, 'active')).length,
    completed: orders.filter((order) => matchesTab(order, 'completed')).length,
    rejected: orders.filter((order) => matchesTab(order, 'rejected')).length,
  };

  const filterTabs = [
    { id: 'all', label: 'All orders' },
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
    { id: 'rejected', label: 'Rejected' },
  ].map((tab) => ({ ...tab, label: `${tab.label} (${statusCounts[tab.id] || 0})` }));

  const emptyTitle =
    activeTab === 'pending'
      ? 'No pending orders'
      : activeTab === 'active'
        ? 'No active orders'
        : activeTab === 'completed'
          ? 'No completed orders'
          : activeTab === 'rejected'
            ? 'No rejected orders'
            : 'No orders yet';

  const emptyMessage =
    activeTab === 'pending'
      ? 'Pending approvals will appear here.'
      : activeTab === 'active'
        ? 'Active orders will appear here.'
        : activeTab === 'completed'
          ? 'Completed orders will appear here.'
          : activeTab === 'rejected'
            ? 'Rejected orders will appear here.'
            : 'You do not have any orders yet.';

  return (
    <DashboardLayout
      user={user}
      activeProject={activeProject}
    >
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Purchase history
            </h1>
            {/* Was a note written for whoever built the page — it listed the table's own
                column names back to the reader and ended with "Detail pages stay unchanged",
                which is a development status, not something a customer has any use for. */}
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Everything you have bought, and where each one stands.
            </p>
          </div>

          <OrderList
            className="mt-10"
            title="Orders"
            icon={FileText}
            columns={PURCHASE_COLUMNS}
            toolbar={(
              <CustomerWorkspaceTabs
                tabs={filterTabs}
                activeTab={activeTab}
                onChange={setActiveTab}
                ariaLabel="Order status filters"
                variant="inline"
              />
            )}
            actions={(
              <GlassButton onClick={fetchOrders}>
                <RefreshCw size={16} />
                Refresh
              </GlassButton>
            )}
            items={filteredOrders}
            loading={loading}
            loadingLabel="Loading orders..."
            renderRow={(order) => (
              <OrderRow
                order={order}
                navigate={navigate}
                location={location}
                formatDate={formatDate}
              />
            )}
            emptyIcon={FileText}
            empty={(
              <>
                <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{emptyTitle}</h3>
                <p className="mt-2 text-base text-[var(--text-secondary)]">{emptyMessage}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <GlassButton variant="primary" size="lg" onClick={() => navigate('/start-new-project')}>
                    Browse Services
                  </GlassButton>
                  <GlassButton size="lg" strong onClick={fetchOrders}>
                    Refresh Orders
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

export default OrdersPage;
