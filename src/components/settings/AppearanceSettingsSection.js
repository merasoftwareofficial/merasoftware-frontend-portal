import React from 'react';
import { Check } from 'lucide-react';

import Surface from '../Surface';
import { useTheme } from '../../context/ThemeContext';
import { THEME_ICONS, THEME_DESCRIPTIONS } from '../ThemeSwitch';

// Both option groups use the same roving-focus radio keyboard behavior.
const navigateRadioGroup = (event, options, selected, select) => {
  const radios = Array.from(event.currentTarget.querySelectorAll('[role="radio"]'));
  const focused = radios.indexOf(event.target);
  const current = focused >= 0 ? focused : options.indexOf(selected);
  let next;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown': next = (current + 1) % options.length; break;
    case 'ArrowLeft':
    case 'ArrowUp': next = (current - 1 + options.length) % options.length; break;
    case 'Home': next = 0; break;
    case 'End': next = options.length - 1; break;
    default: return;
  }
  event.preventDefault();
  select(options[next]);
  radios[next]?.focus();
};

/**
 * Settings → Appearance: theme (3 modes) + accent colour (8 presets).
 *
 * Reads and writes the same ThemeContext as the header's ThemeSwitch, so the
 * two are one state — change either and the other shows it at once.
 *
 * Swatch colours are not written here. Each swatch carries its own
 * data-accent, and index.css scopes every preset to [data-accent], so
 * `bg-accent-500` inside a swatch resolves to THAT preset's -500.
 */
const AppearanceSettingsSection = () => {
  const { theme, setTheme, themes, labels, accent, setAccent, accents, accentLabels } = useTheme();

  return (
    <section id="appearance" aria-labelledby="settings-appearance-heading">
      <h2 id="settings-appearance-heading" className="text-xl font-bold text-[var(--text-primary)]">Appearance</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose how the portal looks. Saved on this device.</p>

      <Surface radius="panel" sheen className="mt-5 p-6 sm:p-7">
        <div className="relative space-y-8">
          <div role="radiogroup" aria-labelledby="settings-theme-label" onKeyDown={event => navigateRadioGroup(event, themes, theme, setTheme)}>
            <h3 id="settings-theme-label" className="text-base font-bold text-[var(--text-primary)]">Theme</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {themes.map((option) => {
                const Icon = THEME_ICONS[option];
                const isActive = option === theme;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setTheme(option)}
                    className={`flex items-start gap-3 rounded-2xl border-[length:var(--glass-border-width)] p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${
                      isActive
                        ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--text-primary)]'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                    }`}
                  >
                    <Icon size={18} className={`mt-0.5 shrink-0 ${isActive ? 'text-accent-text' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{labels[option]}</span>
                      <span className="block text-xs leading-snug text-[var(--text-muted)]">{THEME_DESCRIPTIONS[option]}</span>
                    </span>
                    {isActive ? <Check size={16} className="mt-0.5 shrink-0 text-accent-text" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div role="radiogroup" aria-labelledby="settings-accent-label" onKeyDown={event => navigateRadioGroup(event, accents, accent, setAccent)}>
            <h3 id="settings-accent-label" className="text-base font-bold text-[var(--text-primary)]">Colour</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Buttons, menus and highlights. Status colours — paid, pending, error — stay the same.
            </p>
            <div className="mt-4 grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-8">
              {accents.map((option) => {
                const isActive = option === accent;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={isActive ? 0 : -1}
                    aria-label={accentLabels[option]}
                    onClick={() => setAccent(option)}
                    className="group flex flex-col items-center gap-1.5 rounded-xl p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-text"
                  >
                    <span
                      data-accent={option}
                      className={`flex h-11 w-11 items-center justify-center rounded-full bg-accent-500 shadow-sm ring-1 ring-black/10 transition ${
                        isActive ? 'outline outline-2 outline-offset-2 outline-[color:var(--text-primary)]' : 'group-hover:scale-105'
                      }`}
                    >
                      {/* Black clears >= 5.31:1 on every preset's -500 (measured). */}
                      {isActive ? <Check size={18} strokeWidth={3} className="text-black" /> : null}
                    </span>
                    <span className={`text-xs ${isActive ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                      {accentLabels[option]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Surface>
    </section>
  );
};

export default AppearanceSettingsSection;
