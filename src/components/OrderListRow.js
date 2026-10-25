import React from 'react';
import { ArrowRight, Layers3, LayoutGrid } from 'lucide-react';
import Badge from './Badge';
import WorkspacePanel, { WorkspaceColumns } from './WorkspacePanel';
import { isProjectItem, isPlanItem } from '../helpers/orderType';
import {
  getItemStatusMeta,
  getItemSummary,
  getItemTypeLabel,
  getOrderCategoryLabel,
  getOrderDisplayName,
} from '../helpers/orderPresentation';

const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Single source of truth for the project/plan list layout, shared by
// CustomerDashboard.js (recent list) and ProjectsAndPlans.js (full list).
// The ProjectsAndPlans layout is the canonical one.

// The projects/plans column set. Purchase history shows the same rows against a
// different set (Order / Type / Status / Purchased / Price), which is the only
// reason it had its own hand-written panel — so the columns are a prop now
// rather than a reason to copy the frame.
export const ORDER_LIST_COLUMNS = [
  { label: 'Item', className: 'col-span-12 lg:col-span-5' },
  { label: 'Type', className: 'col-span-6 lg:col-span-2' },
  { label: 'Status', className: 'col-span-6 lg:col-span-2' },
  { label: 'Updated', className: 'col-span-6 lg:col-span-2' },
  { label: 'Open', className: 'col-span-6 lg:col-span-1 text-right' },
];

export const OrderListHeader = ({ columns = ORDER_LIST_COLUMNS }) => (
  <WorkspaceColumns columns={columns} />
);

// A 4px coloured left bar used to encode the item TYPE — emerald for a project,
// amber for a plan. It is gone, for three reasons that all point the same way:
// the badge beside it was already made `neutral` on the grounds that a type is a
// label and not a status; the row states its type twice in words anyway (the
// badge and the TYPE column); and on a Completed row the green bar simply read
// as "success". Dropping it also aligns the rows with their own column header —
// OrderListHeader never had the matching border-l-4, so every row's content sat
// 4px to the right of the header label above it.
//
// The `index` prop went with it: its only use was a zebra-stripe ternary whose
// two branches were the same class.
const OrderListRow = ({ order, onClick }) => {
  const status = getItemStatusMeta(order);
  const isProject = isProjectItem(order);
  const isPlan = isPlanItem(order);
  const summary = getItemSummary(order);
  const category = getOrderCategoryLabel(order);
  // A plan's remaining allowance used to be computed here as well as in getItemSummary — the
  // same legacy catalogue read (productId.updateCount), which is not where a service plan's
  // allowance lives, so every service row said "0 update(s) left". It is gone: the chip beside
  // the name already carries the helper's answer, and it said the same thing three times in
  // one row.

  return (
    <button
      type="button"
      onClick={() => onClick?.(order)}
      className={[
        'grid w-full grid-cols-12 gap-3 bg-[var(--glass-bg-subtle)] px-5 py-4 text-left transition hover:bg-[var(--glass-bg-hover)] sm:px-6',
      ].join(' ')}
    >
      <div className="col-span-12 lg:col-span-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-primary)] backdrop-blur-md">
            {isProject ? <LayoutGrid className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" className="uppercase">
                {getItemTypeLabel(order)}
              </Badge>
              {summary && (
                <Badge tone="neutral" className="uppercase">
                  {summary}
                </Badge>
              )}
            </div>
            <h3 className="mt-2 truncate text-lg font-semibold text-[var(--text-primary)]">
              {/* Shared SSOT: productId while it exists, else the name frozen on the order
                  itself, so a retired or deleted plan never blanks a purchase history row. */}
              {getOrderDisplayName(order)}
            </h3>
            {category ? <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{category}</p> : null}
            <p className="mt-2 text-sm text-[var(--text-secondary)] sm:hidden">
              Updated {formatDate(order.updatedAt || order.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <div className="space-y-1">
          <p className="text-base font-semibold text-[var(--text-primary)]">{isPlan ? 'Plan' : 'Project'}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {isPlan ? (order.productId?.isMonthlyRenewablePlan || order.productId?.isMonthlyLimitedPlan ? 'Monthly' : 'Update based') : 'Work item'}
          </p>
        </div>
      </div>

      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <Badge tone={status.tone} className="w-fit">
          {status.label}
        </Badge>
      </div>

      <div className="col-span-6 lg:col-span-2 lg:flex lg:items-center">
        <p className="text-base font-semibold text-[var(--text-primary)]">{formatDate(order.updatedAt || order.createdAt)}</p>
      </div>

      <div className="col-span-6 flex items-center justify-end lg:col-span-1">
        <ArrowRight className="h-5 w-5 text-[var(--text-muted)]" />
      </div>
    </button>
  );
};

// The whole list panel — frame, title bar, column header, rows, empty state.
//
// WHY THIS EXISTS
// The rows were already shared, but everything around them was written twice.
// CustomerDashboard and ProjectsAndPlans each had their own panel, their own
// title bar, their own divide wrapper and their own empty state, so the two
// drifted on the frame while agreeing on the rows: at one point the dashboard
// list and the projects list had different corners, and the pages had to be
// compared side by side to notice. A "recent projects" list is the projects
// list with fewer rows; it should not be a second implementation of it.
//
// What stays per-page is what genuinely differs: the heading, the controls in
// the title bar, and the empty state. Everything structural comes from here.
export const OrderList = ({
  title,
  icon: Icon = Layers3,
  actions,
  toolbar,
  items = [],
  onOpen,
  columns,
  // Purchase history renders its own row (different columns, its own click
  // target). Everything around the row still comes from here.
  renderRow,
  loading = false,
  loadingLabel = 'Loading...',
  emptyIcon: EmptyIcon,
  empty,
  // ProjectsAndPlans animates its panel in on mount and the dashboard does not,
  // so the wrapper element stays the caller's choice rather than being baked in.
  as,
  className = '',
  ...rest
}) => (
  <WorkspacePanel as={as} title={title} icon={Icon} toolbar={toolbar} actions={actions} className={className} {...rest}>
    {loading ? (
      <div className="relative px-5 py-10 text-center text-base text-[var(--text-secondary)] sm:px-6">{loadingLabel}</div>
    ) : items.length > 0 ? (
      <>
        <OrderListHeader columns={columns} />
        <div className="relative divide-y divide-[var(--divider)]">
          {items.map((order) => (
            <React.Fragment key={order._id}>
              {renderRow ? renderRow(order) : <OrderListRow order={order} onClick={onOpen} />}
            </React.Fragment>
          ))}
        </div>
      </>
    ) : (
      <div className="relative px-5 py-12 text-center sm:px-6">
        {/* The round glass tile above an empty state is written out 11 times
            across the portal, always at h-14 w-14. Passing the icon is enough. */}
        {EmptyIcon && (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-[length:var(--glass-border-width)] border-[var(--glass-border-strong)] bg-[var(--glass-bg)] text-[var(--text-primary)]">
            <EmptyIcon className="h-6 w-6" />
          </div>
        )}
        {empty}
      </div>
    )}
  </WorkspacePanel>
);

export default OrderListRow;
