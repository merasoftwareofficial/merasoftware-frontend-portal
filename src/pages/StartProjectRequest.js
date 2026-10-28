import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import SummaryApi from '../common';
import DashboardLayout from '../components/DashboardLayout';
import GlassButton from '../components/GlassButton';
import GlassPageState from '../components/GlassPageState';

// Get a Service → Start a Project (/start-new-project/project). The client picks a project type
// (live categories from the backend), may answer a few short questions, and asks for a callback.
// The backend saves it as a lead (controller/lead/customerProjectRequest.js); nothing is priced here.

const QUESTIONS = [
  { key: 'budget', title: 'What is your budget?', options: [['under_30k', 'Under ₹30,000'], ['30k_1l', '₹30,000 – ₹1 lakh'], ['above_1l', 'Above ₹1 lakh'], ['not_sure', 'Not sure yet']] },
  { key: 'start', title: 'When do you want to start?', options: [['asap', 'As soon as possible'], ['within_month', 'Within a month'], ['exploring', 'Just exploring']] },
  { key: 'callTime', title: 'Best time to call you', options: [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['any', 'Any time']] },
];
const DETAILS_MAX = 300;

const choiceClass = (on) => `rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${on
  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]'
  : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--glass-bg)]'}`;

const Heading = ({ children }) => <h2 className="text-lg font-semibold text-[var(--text-primary)]">{children}</h2>;

const StartProjectRequest = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState('');
  const [answers, setAnswers] = useState({ budget: '', start: '', callTime: '' });
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const formRef = useRef(null);

  useEffect(() => { if (user?.phone) setPhone((current) => current || String(user.phone)); }, [user?.phone]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setCategories(null);
    fetch(SummaryApi.projectRequestCategories.url, { method: SummaryApi.projectRequestCategories.method, credentials: 'include', signal: controller.signal })
      .then((response) => response.json().then((result) => ({ response, result })))
      .then(({ response, result }) => {
        if (!response.ok || !result.success) throw new Error(result.message || 'Could not load the project types.');
        setCategories(result.data || []);
      })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause.message || 'Could not load the project types.'); });
    return () => controller.abort();
  }, [retry]);

  const choose = (key) => {
    setCategory(key);
    setError('');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  const toggle = (key, value) => setAnswers((current) => ({ ...current, [key]: current[key] === value ? '' : value }));

  const send = async (skipped) => {
    if (sending) return;
    if (!phone.trim()) { setError('Please enter your phone number so we can call you.'); return; }
    setSending(true);
    setError('');
    try {
      const response = await fetch(SummaryApi.projectRequest.url, {
        method: SummaryApi.projectRequest.method,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(skipped ? { category, phone, skipped: true } : { category, phone, ...answers, details }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not send your request. Please try again.');
      setSentTo(result.data?.phone || phone.trim());
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  };

  const picked = categories?.find((row) => row.category === category);

  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-6">
          <header className="relative flex flex-col items-center gap-2 pt-12 text-center sm:pt-0">
            <button
              type="button"
              onClick={() => navigate('/start-new-project')}
              className="absolute left-0 top-0 inline-flex items-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-base font-semibold text-[var(--text-primary)] transition hover:bg-[var(--glass-bg-strong)]"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent-soft-fg)]">New work</span>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Start a Project</h1>
            <p className="max-w-xl text-base text-[var(--text-secondary)]">Tell us what you want built. Our team will call you to talk it through and send a proposal.</p>
          </header>

          {sentTo ? (
            <section className="flex flex-col items-center gap-3 rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-6 py-10 text-center shadow-[var(--card-shadow)] backdrop-blur-2xl" role="status">
              <CheckCircle2 className="h-12 w-12 text-[var(--badge-success-fg)]" strokeWidth={1.75} />
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Thanks! We'll call you soon.</h2>
              <p className="text-base text-[var(--text-secondary)]">
                {picked ? `${picked.label} · ` : ''}We will call you on <b className="font-semibold text-[var(--text-primary)]">{sentTo}</b>.
              </p>
              <GlassButton as={Link} to="/dashboard" variant="primary" size="lg" className="mt-3">Back to Dashboard</GlassButton>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <Heading>What do you want to build?</Heading>
                {loadError ? <GlassPageState type="error" message={loadError} onRetry={() => setRetry((value) => value + 1)} />
                  : !categories ? <GlassPageState message="Loading project types…" />
                    : !categories.length ? <p className="text-base text-[var(--text-secondary)]">No project types are open right now. Please contact support and we will help you.</p>
                      : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {categories.map((row) => (
                            <button
                              key={row.category}
                              type="button"
                              aria-pressed={category === row.category}
                              onClick={() => choose(row.category)}
                              className={`flex flex-col gap-1 rounded-3xl border p-5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${category === row.category
                                ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] shadow-[inset_0_0_0_1px_var(--accent-soft-border)]'
                                : 'border-[var(--glass-border-strong)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)]'}`}
                            >
                              <span className="text-lg font-semibold text-[var(--text-primary)]">{row.label}</span>
                              {row.description && <span className="text-sm text-[var(--text-secondary)]">{row.description}</span>}
                            </button>
                          ))}
                        </div>
                      )}
              </section>

              {picked && (
                <section ref={formRef} className="flex flex-col gap-6 rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl sm:p-7">
                  <p className="text-sm text-[var(--text-muted)]">A few quick questions about your {picked.label.toLowerCase()}. All of them are optional.</p>
                  {QUESTIONS.map(({ key, title, options }) => (
                    <div key={key} className="flex flex-col gap-3">
                      <Heading>{title}</Heading>
                      <div className="flex flex-wrap gap-2">
                        {options.map(([value, label]) => (
                          <button key={value} type="button" aria-pressed={answers[key] === value} className={choiceClass(answers[key] === value)} onClick={() => toggle(key, value)}>{label}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <label className="flex flex-col gap-3">
                    <Heading>Anything we should know?</Heading>
                    <textarea
                      rows={2}
                      maxLength={DETAILS_MAX}
                      value={details}
                      onChange={(event) => setDetails(event.target.value)}
                      placeholder="For example: a website for my bakery with online orders"
                      className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-soft-border)]"
                    />
                    <span className="self-end text-xs text-[var(--text-muted)]">{details.length}/{DETAILS_MAX}</span>
                  </label>
                  <label className="flex flex-col gap-3">
                    <Heading>Your phone number</Heading>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent-soft-border)] sm:max-w-xs"
                    />
                  </label>
                  {error && <p className="rounded-2xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-4 py-3 text-sm text-[var(--badge-error-fg)]" role="alert">{error}</p>}
                  <div className="flex flex-wrap items-center gap-4 border-t border-[var(--glass-border)] pt-5">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => send(false)}
                      className="inline-flex items-center justify-center rounded-2xl bg-[rgb(var(--ink-rgb))] px-5 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
                    >
                      {sending ? 'Sending…' : 'Request a callback'}
                    </button>
                    <button type="button" disabled={sending} onClick={() => send(true)} className="text-base font-semibold text-[var(--text-secondary)] underline-offset-4 transition hover:text-[var(--text-primary)] hover:underline disabled:opacity-50">
                      Skip questions, just call me
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StartProjectRequest;
