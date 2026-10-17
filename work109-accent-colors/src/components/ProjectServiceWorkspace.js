import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Layers3, ShieldCheck } from 'lucide-react';
import { getOrderDisplayName } from '../helpers/orderPresentation';
import Surface from './Surface';
import Badge from './Badge';

const formatDate = (date) => {
  if (!date) return 'Not started';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getServicePresentation = (service) => {
  const status = service.servicePlanStatus || 'active';
  if (status === 'pending_activation') return { label: 'Waiting for activation', tone: 'amber', priority: 1 };
  if (status === 'active') return { label: 'Active', tone: 'emerald', priority: 0 };
  if (status === 'paused') return { label: 'Paused', tone: 'amber', priority: 2 };
  if (status === 'expired') return { label: 'Expired', tone: 'slate', priority: 3 };
  if (status === 'cancelled' || status === 'inactive') return { label: 'Inactive', tone: 'slate', priority: 4 };
  return { label: status.replace(/_/g, ' '), tone: 'slate', priority: 4 };
};

// The status pill's colours are Badge's job. This file used to restate them in
// dark-only shades (`text-emerald-100` on `bg-emerald-400/15`), which read as
// colour-on-colour once the light theme put the pill on a white card. The local
// tone names are mapped to Badge's instead of renaming them at every call site.
const BADGE_TONE = {
  emerald: 'success',
  amber: 'pending',
  slate: 'neutral',
};

const ProjectServiceWorkspace = ({ project, onAddService, onBack, onOpenService, onOpenProject }) => {
  const services = useMemo(
    () => [...(project.linkedServices || [])].sort((left, right) => {
      const priority = getServicePresentation(left).priority - getServicePresentation(right).priority;
      if (priority !== 0) return priority;
      return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    }),
    [project.linkedServices]
  );

  const projectName = getOrderDisplayName(project, 'Project');

  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
    >
      <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-base font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <Surface tone="strong" radius="panel">
          <div className="p-5 sm:p-7">
            <button
              type="button"
              onClick={onOpenProject}
              className="group flex w-full items-center gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-left transition hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg)] sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--eyebrow-fg)]">Project workspace</p>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">{projectName}</h1>
                <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">{Math.round(Number(project.projectProgress || 0))}% complete · open project timeline</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-[var(--text-secondary)] transition group-hover:translate-x-1 group-hover:text-[var(--text-primary)]" />
            </button>
          </div>

          <div className="border-t border-[var(--glass-border)] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5 text-[var(--badge-success-fg)]" />
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Linked services</h2>
                <p className="text-sm text-[var(--text-secondary)]">Active services appear first; their history remains attached to this project.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {services.map((service) => {
                const presentation = getServicePresentation(service);
                const name = service.productId?.serviceName || service.orderItems?.[0]?.name || 'Service';
                return (
                  <button
                    key={service._id}
                    type="button"
                    onClick={() => onOpenService(service._id)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-4 text-left transition hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg)]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]"><ShieldCheck className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-[var(--text-primary)]">{name}</span>
                        <Badge tone={BADGE_TONE[presentation.tone] || 'neutral'}>{presentation.label}</Badge>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"><Clock3 className="h-4 w-4" />{service.servicePlanStartDate ? `Started ${formatDate(service.servicePlanStartDate)}` : 'Starts when the project is eligible'}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
                  </button>
                );
              })}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
};

export default ProjectServiceWorkspace;
