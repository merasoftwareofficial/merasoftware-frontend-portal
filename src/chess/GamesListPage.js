import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import WorkspacePanel from '../components/WorkspacePanel';
import Surface from '../components/Surface';
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

        <div className="relative mx-auto max-w-7xl">
          <header className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
              Games
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
              Play a quick game with a friend while your projects are in progress.
            </p>
          </header>

          <WorkspacePanel className="mt-10" title="Games" icon={Gamepad2}>
          <div className="relative grid grid-cols-1 gap-6 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {GAMES.map((game, index) => (
              <AnimatedSection key={game.id} delay={getStaggerDelay(index)}>
                <Surface as="button" tone="subtle" size="card" sheen
                  type="button"
                  onClick={() => navigate(game.to)}
                  className="group w-full text-left transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--accent-soft-border)] hover:bg-[var(--glass-bg-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft-fg)]"
                >
                {/* The blurred emerald glow that used to sit here is gone: it
                    measured 1.13 against the card in light and 2.17 in dark, so
                    it rendered as nothing on the light page. The lift, border
                    and fill change carry the hover instead. Matches ChessLobby. */}

                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors duration-300 group-hover:border-[var(--accent-soft-border)] group-hover:bg-[var(--accent-soft-bg)]">
                  <Gamepad2 className="h-7 w-7 text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--accent-soft-fg)]" strokeWidth={1.75} />
                </div>

                <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">
                  {game.name}
                </h3>
                <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                  {game.description}
                </p>

                <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-4 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:bg-[var(--glass-bg-strong)]">
                  Play
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </div>
                </Surface>
              </AnimatedSection>
            ))}
          </div>
          </WorkspacePanel>
        </div>
      </div>

    </DashboardLayout>
  );
};

export default GamesListPage;
