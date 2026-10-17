import React, { useEffect, useRef, useState } from 'react';
import { Check, Image, Moon, Sun } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

/**
 * Portal theme picker: three modes, so a two-state sun/moon toggle won't do.
 *
 * Rendered only where PortalHeader is given showThemeSwitch — that is, the
 * customer portal. The admin panel never passes it and so never shows this.
 *
 * Styled from the same tokens as the rest of the portal, because the header
 * follows the theme too — fixed dark text disappeared against the light header.
 */

// Keyed by theme, not ordered — the list order comes from THEMES in ThemeContext.
// Exported so Settings → Appearance shows the same icon and wording.
export const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  immersive: Image,
};

export const THEME_DESCRIPTIONS = {
  light: 'Clean white background',
  dark: 'Solid dark, no background image',
  immersive: 'Background image with glass panels',
};

const ThemeSwitch = () => {
  const { theme, setTheme, themes, labels } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Fallback follows DEFAULT_THEME, which is light.
  const ActiveIcon = THEME_ICONS[theme] || Sun;

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]"
        aria-label="Change appearance"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ActiveIcon size={18} />
        <span className="hidden text-sm font-semibold md:inline">{labels[theme]}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--menu-bg)] py-1.5 shadow-xl"
        >
          <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Appearance
          </p>

          {themes.map((option) => {
            const Icon = THEME_ICONS[option];
            const isActive = option === theme;

            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  setTheme(option);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--glass-bg-hover)] ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Icon size={17} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{labels[option]}</span>
                  <span className="block text-xs leading-snug text-[var(--text-muted)]">
                    {THEME_DESCRIPTIONS[option]}
                  </span>
                </span>
                {isActive ? <Check size={16} className="mt-0.5 shrink-0 text-accent-text" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default ThemeSwitch;
