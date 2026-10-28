import React from 'react';
import { ArrowLeft } from 'lucide-react';

// The customer page heading: a centred title with one line under it, as on Dashboard, My Projects
// and Plans and Documents. With `onBack`, the Back button sits at the left of the heading row (as on
// PlanDetails.js); on a phone it gets its own line above the title so a long title never runs under it.
// Used by the Get a Service flow: startproject.js, StartProjectRequest*.js, StartNewProject.js, ServicePlanDetail.js.

const CustomerPageHeader = ({ title, subtitle, onBack }) => (
  <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-center">
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-semibold text-[var(--text-primary)] backdrop-blur-md transition hover:bg-[var(--glass-bg-strong)] sm:absolute sm:left-0"
      >
        <ArrowLeft className="h-5 w-5" />
        Back
      </button>
    )}
    <header className={`w-full text-center ${onBack ? 'sm:px-36' : ''}`}>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">{title}</h1>
      {subtitle && <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">{subtitle}</p>}
    </header>
  </div>
);

export default CustomerPageHeader;
