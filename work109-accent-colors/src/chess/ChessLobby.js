import { useState } from 'react';
import { ArrowLeft, ArrowRight, PlusCircle, KeyRound, Shuffle } from 'lucide-react';
import { BOARD_PALETTES } from './chessPalette';
import { AnimatedSection } from '../components/PageMotion';

const MODE_OPTIONS = [
  {
    value: 'create',
    icon: PlusCircle,
    title: 'Create a Game',
    description: 'Start a new room and share the code or link with a friend.',
  },
  {
    value: 'join',
    icon: KeyRound,
    title: 'Join with Code',
    description: 'Already have a room code or link? Jump straight into that game.',
  },
  {
    value: 'random',
    icon: Shuffle,
    title: 'Random Match',
    description: "Don't have anyone to play with? We'll find you an opponent.",
  },
];

const COLOR_OPTIONS = [
  { value: 'white', title: 'Play as White', description: 'You move first.' },
  { value: 'black', title: 'Play as Black', description: 'Your opponent moves first.' },
];

/* The card recipe from StartNewWebsiteBuild.js — the portal's other Typeform
   flow, and the page this one has to match. Written out here rather than taken
   from <Surface> because that is the shape the converted choice-card already
   has; see the note on the glow below for the one deliberate difference. */
const CHOICE_CARD =
  'group relative w-full overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 text-left shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--badge-success-fg)]';

export default function ChessLobby({ onCreateRoom, onJoinByCode, onFindRandomMatch, onExit, status }) {
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState(0);
  const [chosenColor, setChosenColor] = useState(null);
  const [chosenPalette, setChosenPalette] = useState(null);
  const [joinCode, setJoinCode] = useState('');

  const flowKeys = mode === 'create' ? ['color', 'palette'] : mode ? [mode] : [];

  const handleSelectMode = (value) => {
    setMode(value);
    setStep(0);
  };

  const handleSelectColor = (value) => {
    setChosenColor(value);
    setStep(1);
  };

  const handleSelectPalette = (key) => {
    setChosenPalette(key);
    onCreateRoom(chosenColor, key);
  };

  /* One Back for the whole lobby, so a screen never shows two of them with two
     different meanings. It unwinds one level at a time and leaves the page only
     from the first screen, which is where "back" means /games. */
  const handleBack = () => {
    if (!mode) {
      onExit();
      return;
    }
    if (step === 0) {
      setMode(null);
      return;
    }
    setStep(step - 1);
  };

  const header = (
    <div className="relative flex items-center justify-center">
      <button
        type="button"
        onClick={handleBack}
        className="absolute left-0 inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-5 py-3 text-lg font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl transition-all duration-300 hover:border-[var(--badge-success-border)] hover:bg-[var(--glass-bg-strong)]"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        Back
      </button>
      <span className="inline-flex items-center rounded-full border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--card-shadow)] backdrop-blur-2xl">
        Chess
      </span>
    </div>
  );

  if (!mode) {
    return (
      <div className="w-full space-y-8">
        {header}

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            Choose how you want to play
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-[var(--text-secondary)]">
            The next step will match your choice.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {MODE_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            return (
              <div
                key={option.value}
                style={{ animationDelay: `${index * 90}ms` }}
                className="animate-[fadeSlideUp_0.5s_ease-out_both]"
              >
                <button type="button" onClick={() => handleSelectMode(option.value)} className={CHOICE_CARD}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                  {/* The reference also paints a blurred glow blob here. It is
                      left out on purpose: measured against the card it is 1.12
                      in light and 1.27 in dark, so it renders as nothing on the
                      light page. The lift, border and fill change carry the
                      hover instead, and those measure 17.53 / 14.03. */}
                  <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-[var(--badge-success-border)]" />

                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-colors duration-300 group-hover:border-[var(--badge-success-border)] group-hover:bg-[var(--badge-success-bg)]">
                    <Icon
                      className="h-7 w-7 text-[var(--text-primary)] transition-colors duration-300 group-hover:text-[var(--badge-success-fg)]"
                      strokeWidth={1.75}
                    />
                  </div>

                  <h3 className="relative mt-5 text-xl font-semibold text-[var(--text-primary)]">{option.title}</h3>
                  <p className="relative mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
                    {option.description}
                  </p>

                  <div className="relative mt-5 inline-flex items-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-4 py-2 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 group-hover:gap-3 group-hover:bg-[var(--glass-bg-strong)]">
                    Select
                    <ArrowRight className="h-4 w-4" strokeWidth={2} />
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <AnimatedSection className="mx-auto w-full max-w-xl space-y-6">
      {header}

      {flowKeys.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {flowKeys.map((key, i) => (
            <div
              key={key}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step
                  ? 'w-10 bg-[var(--badge-success-fg)]'
                  : i < step
                    ? 'w-6 bg-[var(--badge-success-border)]'
                    : 'w-6 bg-[var(--glass-bg-strong)]'
              }`}
            />
          ))}
        </div>
      )}

      {mode === 'create' && step === 0 && (
        <div>
          <p className="text-center text-base text-[var(--text-secondary)]">Which color do you want to play?</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelectColor(option.value)}
                className={CHOICE_CARD}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-[var(--badge-success-border)]" />

                <h3 className="relative text-lg font-semibold text-[var(--text-primary)]">{option.title}</h3>
                <p className="relative mt-1 text-sm text-[var(--text-secondary)]">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'create' && step === 1 && (
        <div>
          <p className="text-center text-base text-[var(--text-secondary)]">Choose your board style</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(BOARD_PALETTES).map(([key, palette]) => (
              <button key={key} type="button" onClick={() => handleSelectPalette(key)} className={CHOICE_CARD}>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />
                <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-[var(--glass-border)] transition-all duration-300 group-hover:ring-[var(--badge-success-border)]" />

                <span className="relative flex items-center gap-3">
                  {/* The swatch shows the real board colours, so these two fills
                      stay literal in every theme — same reason the board itself
                      does. A token here would misreport what you are picking. */}
                  <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-md border border-[var(--glass-border-strong)]">
                    <span className="w-1/2" style={{ backgroundColor: palette.light }} />
                    <span className="w-1/2" style={{ backgroundColor: palette.dark }} />
                  </span>
                  <span className="text-base font-medium text-[var(--text-primary)]">{palette.name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

          <p className="relative text-center text-base text-[var(--text-secondary)]">
            Enter the room code your friend shared with you
          </p>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            className="relative mt-4 w-full rounded-xl border border-[var(--field-border)] bg-[var(--field-bg)] px-4 py-3 text-center text-lg tracking-widest text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="button"
            onClick={() => onJoinByCode(joinCode)}
            disabled={!joinCode}
            className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-6 py-3 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:gap-3 hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
          >
            Join Room
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {mode === 'random' && (
        <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border-strong)] bg-[var(--glass-bg)] p-6 text-center shadow-[var(--card-shadow)] backdrop-blur-2xl backdrop-saturate-150">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[var(--glass-sheen)] to-transparent" />

          <p className="relative text-base text-[var(--text-secondary)]">
            We'll match you with the next available player.
          </p>
          <button
            type="button"
            onClick={onFindRandomMatch}
            className="relative mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--badge-success-border)] bg-[var(--badge-success-bg)] px-6 py-3 text-base font-medium text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md transition-all duration-300 hover:gap-3 hover:bg-[var(--glass-bg-strong)]"
          >
            Find Opponent
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>
          {status === 'waiting-for-match' && (
            <p className="relative mt-3 text-sm text-[var(--text-secondary)]">Waiting for an opponent...</p>
          )}
        </div>
      )}
    </AnimatedSection>
  );
}
