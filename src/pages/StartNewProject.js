import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import GlassPageState from '../components/GlassPageState';
import CustomerPlanCards from '../components/CustomerPlanCards';
import { customerChildState } from '../helpers/customerReturnNavigation';
import { readCustomerPlanCatalogue, planGroups } from '../helpers/customerPlanCatalogue';
import { SURFACE, canBuyOnSurface } from '../helpers/serviceDependency';

export default function StartNewProject() {
  const user = useSelector(state => state?.user?.user);
  const location = useLocation();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setCatalogue(null);
    readCustomerPlanCatalogue(controller.signal).then(setCatalogue).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [retry]);
  const plans = (catalogue?.plans || []).filter(plan => canBuyOnSurface(plan, SURFACE.STANDALONE));
  const groups = planGroups(plans, catalogue?.categories || []);
  return <DashboardLayout user={user}>
    <main className="relative min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <Surface as="header" size="card">
          <p className="text-sm font-semibold text-[var(--eyebrow-fg)]">Explore Services</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">Choose a plan for your work</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Browse by category, see what is included, then choose your options and pay in the portal.</p>
        </Surface>
        {error ? <GlassPageState type="error" message={error} onRetry={() => setRetry(value => value + 1)} />
          : !catalogue ? <GlassPageState message="Loading plans and categories…" />
            : !plans.length ? <Surface size="card"><p className="text-[var(--text-secondary)]">No standalone services are available right now. Services that need a project are available from that project's Add a Service option.</p></Surface>
              : <CustomerPlanCards groups={groups} navigationState={customerChildState(location)} />}
      </div>
    </main>
  </DashboardLayout>;
}
