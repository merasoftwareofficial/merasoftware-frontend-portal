import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  FileText,
  RefreshCw,
} from 'lucide-react';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import { AnimatedSection } from '../components/PageMotion';
import CustomerWorkspaceTabs from '../components/CustomerWorkspaceTabs';
import { OrderList } from '../components/OrderListRow';
import GlassButton from '../components/GlassButton';
import Context from '../context';
import { isProjectItem, isPlanItem, sortItemsLatestFirst } from '../helpers/orderType';
import { getRemainingDays, isActiveWorkItem } from '../helpers/orderPresentation';
import { customerChildState } from '../helpers/customerReturnNavigation';

const ProjectsAndPlans = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector((state) => state?.user?.user);
  const context = useContext(Context);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.ordersList.url, {
        method: SummaryApi.ordersList.method,
        credentials: 'include',
      });

      const result = await response.json();
      if (result.success) {
        const nextOrders = Array.isArray(result.data) ? [...result.data] : [];
        setOrders(nextOrders);
      }
    } catch (error) {
      console.error('Error fetching projects and plans:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchData();
    }
  }, [user?._id]);

  const items = useMemo(
    () => orders.filter((order) => isProjectItem(order) || isPlanItem(order)),
    [orders]
  );

  const activeProjects = useMemo(
    () => items.filter((order) => isProjectItem(order) && isActiveWorkItem(order)),
    [items]
  );

  const activePlans = useMemo(
    () =>
      items.filter(
        (order) =>
          isPlanItem(order) &&
          isActiveWorkItem(order) &&
          // Validity left is a quantity, not a state — the engine does not decide it.
          getRemainingDays(order) > 0
      ),
    [items]
  );

  const visibleItems = useMemo(() => {
    let list = items;
    if (view === 'projects') list = items.filter(isProjectItem);
    else if (view === 'plans') list = items.filter(isPlanItem);
    return [...list].sort(sortItemsLatestFirst);
  }, [items, view]);

  const activeWorkCount = activeProjects.length + activePlans.length;
  const currentWorkItem = context?.activeProject || activeProjects[0] || activePlans[0] || null;

  const openDetails = (order) => {
    if (isPlanItem(order)) {
      navigate(`/plan-details/${order._id}`, { state: customerChildState(location) });
    } else {
      navigate(`/project-details/${order._id}`, { state: customerChildState(location) });
    }
  };

  return (
    <DashboardLayout
      user={user}
      activeProject={currentWorkItem}
      activeWorkItem={currentWorkItem}
      activeWorkItemsCount={activeWorkCount}
    >
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              My Projects and Plans
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              See the progress and details of your projects and plans.
            </p>
          </div>

          <OrderList
            as={AnimatedSection}
            className="mt-10"
            title="My Projects and Plans"
            toolbar={(
              <CustomerWorkspaceTabs
                tabs={[
                  { id: 'all', label: 'All' },
                  { id: 'projects', label: 'Projects' },
                  { id: 'plans', label: 'Plans' },
                ]}
                activeTab={view}
                onChange={setView}
                ariaLabel="Projects and plans filters"
                variant="inline"
              />
            )}
            actions={(
              <>
                {/* Counters, not buttons — rendered as divs so they are not
                    announced as interactive. */}
                <GlassButton as="div">Total: {items.length}</GlassButton>
                <GlassButton as="div">Active: {activeWorkCount}</GlassButton>
                <GlassButton onClick={fetchData}>
                  <RefreshCw size={16} />
                  Refresh
                </GlassButton>
              </>
            )}
            loading={loading}
            loadingLabel="Loading projects and plans..."
            items={visibleItems}
            onOpen={openDetails}
            emptyIcon={FileText}
            empty={(
              <>
                <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">No items found</h3>
                <p className="mt-2 text-base text-[var(--text-secondary)]">There are no projects or plans in this view.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <GlassButton as={Link} to="/dashboard" variant="primary" size="lg">
                    Back to Dashboard
                  </GlassButton>
                  <GlassButton as={Link} to="/start-new-project" size="lg" strong>
                    Get a Service
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

export default ProjectsAndPlans;
