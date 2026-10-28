import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import { AnimatedSection } from '../components/PageMotion';
import { ProjectArt } from '../components/GetServiceArt';
import { readProjectRequestCategories } from '../helpers/projectRequest';

// Get a Service → Start a Project (/start-new-project/project): a chooser. Each project type
// (live from the backend, any number) is its own pill on the left; the pills share the height of
// the right panel. Hover or keyboard focus previews a type in the right panel; a click on the pill,
// or the panel's button, opens the details form (pages/StartProjectRequestDetails.js). On a phone
// there is no hover, so the panel is hidden and a tap on a pill goes straight on.

const StartProjectRequest = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [current, setCurrent] = useState(0);
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setCategories(null);
    readProjectRequestCategories(controller.signal)
      .then((rows) => { setCategories(rows); setCurrent(0); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [retry]);

  const focus = (index) => {
    if (index === current) return;
    setCurrent(index);
    setLifted((value) => !value);
  };
  const open = (row) => navigate(`/start-new-project/project/${encodeURIComponent(row.category)}`);
  const chosen = categories?.[current];

  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto w-full max-w-5xl">
          <CustomerPageHeader
            title="What do you want to build?"
            subtitle="Choose a type, then tell us a little about it on the next step."
            onBack={() => navigate('/start-new-project')}
          />

          <div className="mt-10">
            {error ? <GlassPageState type="error" message={error} onRetry={() => setRetry((value) => value + 1)} />
              : !categories ? <GlassPageState message="Loading project types…" />
                : !categories.length ? <GlassPageState type="error" message="No project types are open right now. Please contact support and we will help you." />
                  : (
                    <AnimatedSection className="grid items-stretch gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                      <div role="listbox" aria-label="Project types" className="flex flex-col gap-2.5">
                        {categories.map((row, index) => (
                          <button
                            key={row.category}
                            type="button"
                            role="option"
                            aria-selected={index === current}
                            onClick={() => open(row)}
                            onMouseEnter={() => focus(index)}
                            onFocus={() => focus(index)}
                            className={`relative flex min-h-[76px] flex-1 items-center gap-3 rounded-[20px] border border-[var(--glass-border)] bg-[var(--glass-bg)] py-3.5 pl-6 pr-5 text-left backdrop-blur-2xl transition-colors hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${index === current
                              ? 'md:border-[var(--accent-soft-border)] md:bg-[var(--accent-soft-bg)] md:shadow-[inset_0_0_0_1px_var(--accent-soft-border)]'
                              : ''}`}
                          >
                            <span className={`absolute bottom-4 left-2.5 top-4 w-[3px] scale-y-0 rounded-full bg-[var(--accent-soft-fg)] transition-transform duration-300 ${index === current ? 'md:scale-y-100' : ''}`} />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <b className="text-base font-semibold text-[var(--text-primary)]">{row.label}</b>
                              {row.description && <span className="truncate text-sm text-[var(--text-muted)]">{row.description}</span>}
                            </span>
                            {/* Shows the pill itself opens the next step: always on a phone, on the type in focus on wider screens. */}
                            <span aria-hidden="true" className={`shrink-0 text-lg font-semibold text-[var(--accent-soft-fg)] transition duration-200 ${index === current ? '' : 'md:-translate-x-1 md:opacity-0'}`}>→</span>
                          </button>
                        ))}
                      </div>

                      <section className="relative hidden flex-col gap-5 overflow-hidden rounded-[28px] md:flex border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 sm:p-6">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                        <div className="relative"><ProjectArt lifted={lifted} /></div>
                        <motion.div
                          key={chosen.category}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="relative flex min-h-[92px] flex-col gap-1.5"
                        >
                          <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent-soft-fg)]">New work</span>
                          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] lg:text-3xl">{chosen.label}</h2>
                          {chosen.description && <p className="max-w-md text-base text-[var(--text-secondary)]">{chosen.description}</p>}
                        </motion.div>
                        <button
                          type="button"
                          onClick={() => open(chosen)}
                          className="group relative inline-flex items-center gap-2.5 self-start rounded-2xl bg-[rgb(var(--ink-rgb))] px-5 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
                        >
                          Continue with {chosen.label}
                          <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                        </button>
                      </section>
                    </AnimatedSection>
                  )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StartProjectRequest;
