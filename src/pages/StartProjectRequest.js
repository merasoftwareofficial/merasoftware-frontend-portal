import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import DashboardLayout from '../components/DashboardLayout';
import GlassPageState from '../components/GlassPageState';
import { AnimatedSection } from '../components/PageMotion';
import { ProjectArt } from '../components/GetServiceArt';
import { readProjectRequestCategories } from '../helpers/projectRequest';

// Get a Service → Start a Project (/start-new-project/project): a chooser. The project types
// (live from the backend, any number) are listed on the left; the right panel shows the one in
// focus with the only button, which opens the details form (pages/StartProjectRequestDetails.js).

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
  const chosen = categories?.[current];

  return (
    <DashboardLayout user={user}>
      <div className="relative flex min-h-[calc(100vh-4rem)] flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6">
          <header className="relative flex flex-col items-center gap-3 pt-12 text-center sm:pt-0">
            <button
              type="button"
              onClick={() => navigate('/start-new-project')}
              className="absolute left-0 top-0 inline-flex items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)]"
            >
              ← Back
            </button>
            <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
              Start a Project
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">What do you want to build?</h1>
            <p className="max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">Choose a type, then tell us a little about it on the next step.</p>
          </header>

          {error ? <GlassPageState type="error" message={error} onRetry={() => setRetry((value) => value + 1)} />
            : !categories ? <GlassPageState message="Loading project types…" />
              : !categories.length ? <GlassPageState type="error" message="No project types are open right now. Please contact support and we will help you." />
                : (
                  <AnimatedSection className="grid items-stretch gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                    <div role="listbox" aria-label="Project types" className="flex flex-col gap-1.5 rounded-[26px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-2 shadow-[var(--card-shadow)] backdrop-blur-2xl">
                      {categories.map((row, index) => (
                        <button
                          key={row.category}
                          type="button"
                          role="option"
                          aria-selected={index === current}
                          onClick={() => focus(index)}
                          onMouseEnter={() => focus(index)}
                          onFocus={() => focus(index)}
                          className={`relative flex flex-col gap-0.5 rounded-[18px] py-3.5 pl-5 pr-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${index === current ? 'bg-[var(--accent-soft-bg)]' : 'hover:bg-[var(--glass-bg-subtle)]'}`}
                        >
                          <span className={`absolute bottom-3.5 left-2 top-3.5 w-[3px] origin-center rounded-full bg-[var(--accent-soft-fg)] transition-transform duration-300 ${index === current ? 'scale-y-100' : 'scale-y-0'}`} />
                          <b className="text-base font-semibold text-[var(--text-primary)]">{row.label}</b>
                          {row.description && <span className="truncate text-sm text-[var(--text-muted)]">{row.description}</span>}
                        </button>
                      ))}
                    </div>

                    <section className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 sm:p-6">
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
                        onClick={() => navigate(`/start-new-project/project/${encodeURIComponent(chosen.category)}`)}
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
    </DashboardLayout>
  );
};

export default StartProjectRequest;
