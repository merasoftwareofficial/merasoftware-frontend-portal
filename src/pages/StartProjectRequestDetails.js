import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassButton from '../components/GlassButton';
import GlassPageState from '../components/GlassPageState';
import { BUDGET_OPTIONS, CALL_TIME_OPTIONS, DETAILS_MAX, readProjectRequestCategories, sendProjectRequest } from '../helpers/projectRequest';

// Start a Project → details (/start-new-project/project/:category): budget, time to call and phone
// are required, the note is optional. Sent as a callback request (saved as a lead by the backend).
// An unknown or closed project type goes back to the chooser (pages/StartProjectRequest.js).
// Header and Back follow PlanDetails.js: the project type's name is the heading.

const field = 'w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-4 py-3 text-base text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-soft-border)]';
const Label = ({ children, optional }) => (
  <span className="text-base font-semibold text-[var(--text-primary)]">
    {children}{optional && <small className="ml-1.5 text-sm font-normal text-[var(--text-muted)]">optional</small>}
  </span>
);

const StartProjectRequestDetails = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const { category } = useParams();
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [budget, setBudget] = useState('');
  const [callTime, setCallTime] = useState('');
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => { if (user?.phone) setPhone((value) => value || String(user.phone)); }, [user?.phone]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setCategories(null);
    readProjectRequestCategories(controller.signal)
      .then(setCategories)
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause.message); });
    return () => controller.abort();
  }, [retry]);

  const chosen = categories?.find((row) => row.category === category);
  if (categories && !chosen) return <Navigate to="/start-new-project/project" replace />;

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!budget || !callTime || !phone.trim()) { setError('Please choose a budget and a time to call, and enter your phone number.'); return; }
    setSending(true);
    setError('');
    try {
      const data = await sendProjectRequest({ category, budget, callTime, details, phone });
      setSentTo(data.phone || phone.trim());
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-full max-w-5xl"
        >
          <CustomerPageHeader
            title={chosen?.label || 'Start a Project'}
            subtitle="A few details, then we call you."
            onBack={() => navigate('/start-new-project/project')}
          />

          <div className="mx-auto mt-10 max-w-3xl">
            {loadError ? <GlassPageState type="error" message={loadError} onRetry={() => setRetry((value) => value + 1)} />
              : !categories ? <GlassPageState message="Loading…" />
                : sentTo ? (
                  <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    className="flex flex-col items-center gap-3 rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-6 py-11 text-center shadow-[var(--card-shadow)] backdrop-blur-2xl"
                  >
                    <CheckCircle2 className="h-12 w-12 text-[var(--badge-success-fg)]" strokeWidth={1.75} />
                    <h2 className="text-2xl font-bold text-[var(--text-primary)]">Thanks! We'll call you soon.</h2>
                    <p className="text-base text-[var(--text-secondary)]">{chosen.label} · We will call you on <b className="font-semibold text-[var(--text-primary)]">{sentTo}</b>.</p>
                    <GlassButton as={Link} to="/dashboard" variant="primary" size="lg" className="mt-3">Back to Dashboard</GlassButton>
                  </motion.section>
                ) : (
                  <form onSubmit={submit} noValidate className="relative flex flex-col gap-5 overflow-hidden rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 sm:p-7">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                    <div className="relative grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-2.5">
                        <Label>What is your budget?</Label>
                        <select required value={budget} onChange={(event) => setBudget(event.target.value)} className={`${field} cursor-pointer`}>
                          <option value="">Choose a budget</option>
                          {BUDGET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2.5">
                        <Label>Best time to call you</Label>
                        <select required value={callTime} onChange={(event) => setCallTime(event.target.value)} className={`${field} cursor-pointer`}>
                          <option value="">Choose a time</option>
                          {CALL_TIME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="relative flex flex-col gap-2.5">
                      <Label optional>Anything we should know?</Label>
                      <textarea
                        rows={2}
                        maxLength={DETAILS_MAX}
                        value={details}
                        onChange={(event) => setDetails(event.target.value)}
                        placeholder="For example: a website for my bakery with online orders"
                        className={`${field} resize-none placeholder:text-[var(--text-muted)]`}
                      />
                      <span className="self-end text-xs text-[var(--text-muted)]">{details.length}/{DETAILS_MAX}</span>
                    </label>
                    <label className="relative flex flex-col gap-2.5">
                      <Label>Your phone number</Label>
                      <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} className={`${field} sm:max-w-xs`} />
                    </label>
                    {error && <p role="alert" className="relative rounded-2xl border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)] px-4 py-3 text-sm text-[var(--badge-error-fg)]">{error}</p>}
                    <div className="relative border-t border-[var(--glass-border)] pt-5">
                      <button
                        type="submit"
                        disabled={sending}
                        className="group inline-flex items-center gap-2.5 rounded-2xl bg-[rgb(var(--ink-rgb))] px-5 py-3 text-base font-semibold text-[var(--page-bg)] transition hover:bg-[rgb(var(--ink-rgb)/0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text disabled:cursor-not-allowed disabled:bg-[var(--glass-bg-strong)] disabled:text-[var(--text-muted)]"
                      >
                        {sending ? 'Sending…' : 'Request a callback'}
                        {!sending && <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>}
                      </button>
                    </div>
                  </form>
                )}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default StartProjectRequestDetails;
