import React from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import Surface from './Surface';
import GlassButton from './GlassButton';

/**
 * The portal's loading / error panel, used where a whole page's content is not
 * there yet (ServicePlanDetail, StartNewProject).
 *
 * Migrated to tokens: the two icons were `text-amber-300` / `text-emerald-300`,
 * fixed shades picked for a dark page — on the light theme they land on a white
 * card and disappear. They now use the badge foreground tokens, which are the
 * portal's per-theme answer for "this colour means pending / this means going
 * fine" (same tokens TicketDetail.js's empty state already uses for its own
 * AlertTriangle). The "Try again" button was `bg-emerald-500` + `text-white`,
 * one of the hand-written primaries; it is now GlassButton's primary variant,
 * whose fill is the theme's ink and whose label is the page ground, so it
 * inverts correctly in all three themes instead of staying green-on-white.
 *
 * The panel itself was `glass-panel` with a hardcoded `rounded-[1.75rem]` — a
 * corner no other panel in the portal uses. Surface carries the same fill and
 * border with the shared panel radius.
 */

const GlassPageState = ({ type = 'loading', message, onRetry }) => {
  const isError = type === 'error';

  return (
    <Surface
      radius="panel"
      className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center"
    >
      <div className="max-w-md">
        {isError ? (
          <AlertTriangle className="mx-auto h-10 w-10 text-[var(--badge-pending-fg)]" />
        ) : (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--badge-success-fg)]" />
        )}
        <p className="mt-4 text-base font-semibold text-[var(--text-primary)]">
          {message || (isError ? 'Something went wrong.' : 'Loading…')}
        </p>
        {isError && onRetry && (
          <GlassButton variant="primary" size="lg" onClick={onRetry} className="mt-5">
            <RefreshCw className="h-4 w-4" />
            Try again
          </GlassButton>
        )}
      </div>
    </Surface>
  );
};

export default GlassPageState;
