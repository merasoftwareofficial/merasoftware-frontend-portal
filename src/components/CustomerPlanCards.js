import React from 'react';
import { Link } from 'react-router-dom';
import Surface from './Surface';
import GlassButton from './GlassButton';
import { planBenefit } from '../helpers/customerPlanCatalogue';
import { priceRangeText } from '../helpers/serviceTenure';

export default function CustomerPlanCards({ groups, navigationState }) {
  return <div className="space-y-8">
    {groups.map(group => <section key={group.key} aria-label={group.label} className="space-y-4">
      <div><h2 className="text-xl font-bold text-[var(--text-primary)]">{group.label}</h2>
        {group.description && <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{group.description}</p>}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {group.plans.map(plan => <Surface as="article" size="card" key={plan._id} className="flex min-w-0 flex-col gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--eyebrow-fg)]">{plan.servicePlan?.pricingMode === 'flexible' ? 'Customize your plan' : 'Fixed plan'}</p>
            <h3 className="mt-2 break-words text-lg font-bold text-[var(--text-primary)]">{plan.serviceName}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{(plan.formattedDescriptions?.[0]?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</p></div>
          <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{priceRangeText(plan.priceRange) || 'Open plan for pricing'}</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{planBenefit(plan)}</p>
          {plan.servicePlan?.purchaseType === 'one_time' && plan.servicePlan?.capability === 'upload_data' && <p className="text-sm text-[var(--text-muted)]">Use within {plan.servicePlan.oneTimeValidityDays || 90} days of starting.</p>}
          <GlassButton as={Link} to={`/service-plan-detail/${plan._id}`} state={navigationState} variant="primary" className="mt-auto">
            {plan.servicePlan?.pricingMode === 'flexible' ? 'Customize plan' : 'Choose plan'} →
          </GlassButton>
        </Surface>)}
      </div>
    </section>)}
  </div>;
}
