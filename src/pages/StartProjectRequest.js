import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';
import { formatCurrency } from '../helpers/paymentLedger';
import { CALLBACK_PATH, packagePath, readPackageCatalogue } from '../helpers/packageStart';

// Get a Service → Start a Project (/start-new-project/project): the website's ready-made packages, each a
// compact card with its price and one "What's included" link to the package's own page
// (pages/StartProjectPackage.js, where it is chosen and paid for). Anything custom goes through the last
// card: the call-back form (pages/StartProjectRequestDetails.js). While the package system is off, or no
// package is open, there is nothing to choose from, so the client lands straight on the call-back form.

const card = 'group relative flex flex-col gap-3 overflow-hidden rounded-[28px] border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-5 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-colors duration-300 hover:border-[var(--accent-soft-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text sm:p-6';
const Sheen = () => <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />;
const Arrow = () => <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>;

const StartProjectRequest = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(''); setCatalogue(null);
    readPackageCatalogue(controller.signal)
      .then(setCatalogue)
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [retry]);

  if (catalogue && (!catalogue.enabled || !catalogue.packages.length)) return <Navigate to={CALLBACK_PATH} replace />;

  return (
    <DashboardLayout user={user}>
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />
        <div className="relative mx-auto w-full max-w-5xl">
          <CustomerPageHeader
            title="Start a Project"
            subtitle="Pick a ready-made package and start right here, or ask us for a call back."
            onBack={() => navigate('/start-new-project')}
          />

          <div className="mt-10">
            {error ? <GlassPageState type="error" message={error} onRetry={() => setRetry((value) => value + 1)} />
              : !catalogue ? <GlassPageState message="Loading packages…" />
                : (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogue.packages.map((item, index) => (
                      <AnimatedSection key={item.id} delay={getStaggerDelay(index)} className="flex">
                        <Link to={packagePath(item.id)} className={`${card} w-full`}>
                          <Sheen />
                          <div className="relative flex flex-1 flex-col gap-2">
                            {item.offer && <span className="w-fit rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-[var(--accent-soft-fg)]">{item.offer.title}</span>}
                            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{item.name}</h2>
                            {item.description && <p className="line-clamp-3 text-base text-[var(--text-secondary)]">{item.description}</p>}
                          </div>
                          <div className="relative flex items-baseline gap-2">
                            <strong className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(item.price)}</strong>
                            {item.mainPrice > item.price && <s className="text-base text-[var(--text-muted)]">{formatCurrency(item.mainPrice)}</s>}
                          </div>
                          <span className="relative inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-soft-fg)]">What's included <Arrow /></span>
                        </Link>
                      </AnimatedSection>
                    ))}
                  </div>
                )}

            {/* Always offered, also when the packages could not load: a custom project is asked for by a call back. */}
            {(catalogue || error) && (
              <AnimatedSection className="mt-5">
                <Link to={CALLBACK_PATH} state={{ fromPackages: Boolean(catalogue) }} className={card}>
                  <Sheen />
                  <div className="relative flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent-soft-fg)]">Something different?</span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Arrange a call back</h2>
                    <p className="text-base text-[var(--text-secondary)]">Tell us what you need and our team will call you with a proposal.</p>
                  </div>
                  <span className="relative inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-soft-fg)]">Ask for a call <Arrow /></span>
                </Link>
              </AnimatedSection>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StartProjectRequest;
