import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowRight, Gamepad2, Sparkles } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { AnimatedSection, getStaggerDelay } from '../components/PageMotion';

const GAMES = [
  {
    id: 'chess',
    name: 'Chess',
    description: 'Play chess with a friend in real time — create a room, share a code or link, or find a random opponent.',
    to: '/games/chess',
  },
];

const GamesListPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const navigate = useNavigate();

  return (
    <DashboardLayout user={user}>
      <div
        className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
      >
        <div className="pointer-events-none absolute inset-0 bg-[var(--scrim)]" />

        <div className="relative mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
              <Sparkles className="mr-2 h-3.5 w-3.5" />
              Games
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Take a break
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Play a quick game with a friend while your projects are in progress.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {GAMES.map((game, index) => (
              <AnimatedSection key={game.id} delay={getStaggerDelay(index)}>
                <button
                  type="button"
                  onClick={() => navigate(game.to)}
                  className="group relative w-full overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 text-left shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--badge-success-fg)]"
                >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                {/* The blurred emerald glow that used to sit here is gone: it
                    measured 1.13 against the card in light and 2.17 in dark, so
                    it rendered as nothing on the light page. The lift, border
                    and fill change carry the hover instead. Matches ChessLobby. */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-[var(--badge-success-border)]" />

                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors duration-300 group-hover:border-[var(--badge-success-border)] group-hover:bg-[var(--badge-success-bg)]">
                  <Gamepad2 className="h-7 w-7 text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--badge-success-fg)]" strokeWidth={1.75} />
                </div>

                <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">
                  {game.name}
                </h3>
                <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                  {game.description}
                </p>

                <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-4 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:bg-[var(--glass-bg-strong)]">
                  Play
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </div>
                </button>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </div>

    </DashboardLayout>
  );
};

export default GamesListPage;
