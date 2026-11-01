import SummaryApi from '../common';
import { useResource } from '../hooks/useResource';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import GlassPageState from '../components/GlassPageState';
import CustomerPlanCards from '../components/CustomerPlanCards';
import CustomerPageHeader from '../components/CustomerPageHeader';
import { customerChildState, goToCustomerReturn } from '../helpers/customerReturnNavigation';
import { planGroups } from '../helpers/customerPlanCatalogue';
import { SURFACE, canBuyOnSurface } from '../helpers/serviceDependency';

export default function StartNewProject() {
  const user = useSelector(state => state?.user?.user);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: catalogue, error, refresh } = useResource(SummaryApi.customerPlanCatalogue.url);
  const plans = (catalogue?.plans || []).filter(plan => canBuyOnSurface(plan, SURFACE.STANDALONE));
  const groups = planGroups(plans, catalogue?.categories || []);
  return <DashboardLayout user={user}>
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
      <div className="relative mx-auto max-w-7xl">
        <CustomerPageHeader
          title="Choose a plan for your work"
          subtitle="Browse by category, see what is included, then choose your options and pay in the portal."
          onBack={() => goToCustomerReturn(navigate, location, '/start-new-project')}
        />
        <div className="mt-10">
          {error ? <GlassPageState type="error" message={error} onRetry={() => refresh()} />
            : !catalogue ? <GlassPageState message="Loading plans and categories…" />
              : !plans.length ? <Surface size="card"><p className="text-[var(--text-secondary)]">No standalone services are available right now. Services that need a project are available from that project's Add a Service option.</p></Surface>
                : <CustomerPlanCards groups={groups} navigationState={customerChildState(location)} />}
        </div>
      </div>
    </main>
  </DashboardLayout>;
}
