import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers3,
  BriefcaseBusiness,
  ArrowRight,
  X,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';
import { useSelector } from 'react-redux';

const CATEGORIES = [
  {
    id: 'custom-project',
    title: 'Create a Custom Project',
    description: 'Build a private website, software, or app project for your own workspace.',
    action: 'Customize Project',
    icon: BriefcaseBusiness,
  },
  {
    id: 'services',
    title: 'Start a Service or Add-ons',
    description: 'Start a standalone service or add a service to an existing project.',
    action: 'Explore Services',
    icon: Layers3,
  },
];

const StartProject = () => {
  const navigate = useNavigate();
  const user = useSelector((state) => state?.user?.user);
  const [serviceChoiceOpen, setServiceChoiceOpen] = useState(false);

  const handleSelect = (category) => {
    if (category.id === 'custom-project') {
      navigate('/start-new-project/build/new_website');
      return;
    }
    setServiceChoiceOpen(true);
  };

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
              Explore Services
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Choose a service
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Start a standalone service or add one to a project your admin has created for you.
            </p>
          </div>

          <div className="mt-10 grid w-full grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2">
            {CATEGORIES.map((category, index) => {
              const Icon = category.icon;
              return (
                <AnimatedSection key={category.id} delay={getStaggerDelay(index)}>
                  <button
                    type="button"
                    onClick={() => handleSelect(category)}
                    className="group relative w-full overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 text-left shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1.5 hover:border-emerald-300/60 hover:bg-[var(--glass-bg-strong)] hover:shadow-[0_24px_48px_rgba(16,185,129,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                  {/* glass sheen */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                  <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-300/30 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-emerald-300/40" />

                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors duration-300 group-hover:border-emerald-400/50 group-hover:bg-emerald-500/15">
                    <Icon className="h-7 w-7 text-[var(--text-primary)] transition-colors duration-300 group-hover:text-emerald-400" strokeWidth={1.75} />
                  </div>

                  <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">
                    {category.title}
                  </h3>
                  <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                    {category.description}
                  </p>

                  <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:border-emerald-300/60 group-hover:bg-emerald-500/35">
                    {category.action}
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </div>
                  </button>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </div>

      {serviceChoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[var(--glass-bg-subtle)] backdrop-blur-sm"
            onClick={() => setServiceChoiceOpen(false)}
          />
          <AnimatedSection className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-7 shadow-[0_24px_64px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

            <button
              type="button"
              onClick={() => setServiceChoiceOpen(false)}
              className="absolute right-4 top-4 rounded-lg border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-1.5 text-[var(--text-primary)] transition-colors duration-200 hover:border-emerald-300/60 hover:bg-[var(--glass-bg-strong)]"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>

            <h3 className="relative text-center text-xl font-semibold text-[var(--text-primary)]">
              Choose how you want to continue
            </h3>
            <p className="relative mt-2 text-center text-base leading-relaxed text-[var(--text-secondary)]">
              Services can start independently, or be attached to a project you already own.
            </p>

            <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => navigate('/start-new-project/services?tab=services')} className="rounded-2xl border border-emerald-400/40 bg-emerald-500/20 p-4 text-left text-[var(--text-primary)] transition hover:border-emerald-300/70 hover:bg-emerald-500/30">
                <Layers3 className="h-6 w-6 text-emerald-200" strokeWidth={1.75} />
                <span className="mt-3 block text-base font-semibold">Start a Service</span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">Browse services that can begin without a project.</span>
              </button>
              <button type="button" onClick={() => navigate('/projects-and-plans')} className="rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-4 text-left text-[var(--text-primary)] transition hover:border-sky-300/60 hover:bg-[var(--glass-bg-strong)]">
                <BriefcaseBusiness className="h-6 w-6 text-sky-200" strokeWidth={1.75} />
                <span className="mt-3 block text-base font-semibold">Add to a Project</span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">Open your project, then add its service or add-on.</span>
              </button>
            </div>
          </AnimatedSection>
        </div>
      )}

    </DashboardLayout>
  );
};

export default StartProject;
