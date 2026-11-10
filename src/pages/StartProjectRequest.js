import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Clock3 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import CustomerPageHeader from '../components/CustomerPageHeader';
import GlassPageState from '../components/GlassPageState';
import Surface from '../components/Surface';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';
import useServerNow from '../hooks/useServerNow';
import { formatCurrency } from '../helpers/paymentLedger';
import { CALLBACK_PATH, offerEnded, packagePath, readPackageCatalogue, timeLeft } from '../helpers/packageStart';

// Get a Service → Start a Project (/start-new-project/project): the website's ready-made packages, each a
// compact card with its price and one "What's included" link to the package's own page
// (pages/StartProjectPackage.js, where it is chosen and paid for). Anything custom goes through the last
// card: the call-back form (pages/StartProjectRequestDetails.js). While the package system is off, or no
// package is open, there is nothing to choose from, so the client lands straight on the call-back form.
// A package with a running offer is set apart with the portal's own accent and a countdown on the server's
// clock; when the offer ends the list is asked for again, so the card shows the real price.

// The portal's choose-a-card look and hover (pages/StartNewWebsiteBuild.js): the card lifts and glows in the accent.
const card = 'group flex w-full flex-col gap-3 p-5 transition-all duration-300 hover:-translate-y-1.5 hover:bg-[var(--glass-bg-strong)] hover:shadow-[0_24px_48px_rgb(var(--accent-500)/0.28)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)] sm:p-6';
// A running offer: the card keeps its own fill; only its outline and the glow around it are in the portal accent.
const plainEdge = 'hover:border-[var(--accent-soft-border)]';
const offerEdge = 'border-[rgb(var(--accent-500)/0.6)] shadow-[0_0_36px_rgb(var(--accent-500)/0.3)]';
const pill = 'inline-flex items-center gap-1.5 px-3 py-1 font-semibold tabular-nums';
const Arrow = () => <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>;

const StartProjectRequest = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const now = useServerNow(catalogue?.serverNow);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    readPackageCatalogue(controller.signal)
      .then(setCatalogue)
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [revision]);

  // An offer that has just ended: ask again (quietly, the cards stay), so the card shows the normal price.
  const ended = Boolean(catalogue?.packages.some((item) => offerEnded(item.offer, now)));
  useEffect(() => { if (ended) setRevision((value) => value + 1); }, [ended]);

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
            {error && !catalogue ? <GlassPageState type="error" message={error} onRetry={() => setRevision((value) => value + 1)} />
              : !catalogue ? <GlassPageState message="Loading packages…" />
                : (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogue.packages.map((item, index) => {
                      const offer = item.offer && !offerEnded(item.offer, now) ? item.offer : null;
                      return (
                        <AnimatedSection key={item.id} delay={getStaggerDelay(index)} className="flex">
                          <Surface as={Link} to={packagePath(item.id)} sheen data-offer={offer ? 'running' : undefined} className={`${card} ${offer ? offerEdge : plainEdge}`}>
                            <div className="relative flex flex-1 flex-col gap-2">
                              {offer && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`${pill} rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-xs text-[var(--accent-soft-fg)]`}>{offer.title}</span>
                                  {item.discountAmount > 0 && <span className={`${pill} badge badge-success text-xs`}>Save {formatCurrency(item.discountAmount)}</span>}
                                </div>
                              )}
                              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">{item.name}</h2>
                              {item.description && <p className="line-clamp-3 text-base text-[var(--text-secondary)]">{item.description}</p>}
                            </div>
                            <div className="relative flex items-baseline gap-2">
                              <strong className="text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(item.price)}</strong>
                              {item.mainPrice > item.price && <s className="text-base text-[var(--text-muted)]">{formatCurrency(item.mainPrice)}</s>}
                            </div>
                            {offer && (
                              <span role="timer" aria-label="Time left on this offer" className={`${pill} badge badge-pending relative w-fit text-sm`}>
                                <Clock3 size={14} aria-hidden="true" />{now === null ? '—' : `Ends in ${timeLeft(offer.endsAt, now)}`}
                              </span>
                            )}
                            <span className="relative inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-soft-fg)]">What's included <Arrow /></span>
                          </Surface>
                        </AnimatedSection>
                      );
                    })}
                  </div>
                )}

            {/* Always offered, also when the packages could not load: a custom project is asked for by a call back. */}
            {(catalogue || error) && (
              <AnimatedSection className="mt-5">
                <Surface as={Link} to={CALLBACK_PATH} state={{ fromPackages: Boolean(catalogue) }} sheen className={`${card} ${plainEdge}`}>
                  <div className="relative flex flex-col gap-1">
                    <span className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--accent-soft-fg)]">Something different?</span>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Arrange a call back</h2>
                    <p className="text-base text-[var(--text-secondary)]">Tell us what you need and our team will call you with a proposal.</p>
                  </div>
                  <span className="relative inline-flex items-center gap-2 text-base font-semibold text-[var(--accent-soft-fg)]">Ask for a call <Arrow /></span>
                </Surface>
              </AnimatedSection>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StartProjectRequest;
