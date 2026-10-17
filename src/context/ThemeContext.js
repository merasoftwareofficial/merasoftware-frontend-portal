import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme SSOT for the customer portal.
 *
 * Three modes, applied as `data-theme` on <html>; every colour token lives in
 * index.css keyed off that attribute, so this file owns the *choice* and the
 * CSS owns the *values*. Nothing here knows a single colour.
 *
 *   light     — solid white. The default.
 *   dark      — the same glass on a solid background, no image.
 *   immersive — BG.png over dark glass.
 *
 * THEMES is also the order the picker lists them in, so the array is the one
 * place that decides both.
 *
 * `light` is the default as of 15-09-2026, owner's decision. It was `immersive`
 * before, chosen so that an existing customer who had never touched the switch
 * saw no change when the theme system shipped. That protection has now been
 * deliberately given up: anyone who never picked a theme moves to light. A
 * customer who DID pick one is unaffected — their choice is in localStorage and
 * still wins.
 *
 * Persisted under the 'theme' key, which DatabaseContext already preserves
 * across its cache clear (see keysToKeep there) — so the choice survives a
 * logout without any extra work.
 *
 * Customer portal only. AdminLayout never mounts this provider.
 */

export const THEMES = ['light', 'dark', 'immersive'];
export const DEFAULT_THEME = 'light';
const STORAGE_KEY = 'theme';

export const THEME_LABELS = {
  light: 'Light',
  dark: 'Solid Dark',
  immersive: 'Immersive',
};

/**
 * Accent colour — the portal's brand colour (buttons, selected nav, focus,
 * highlights), chosen independently of the theme. Applied as `data-accent` on
 * <html>; the colour values live in index.css (ACCENT SSOT). Cyan is the
 * default because it is the website's brand colour.
 *
 * ACCENTS is also the picker order. Adding one needs a CSS preset block, an
 * entry here, and the allow-list in the index.html pre-paint script.
 * Status colours (Paid / Pending / Error) never follow the accent.
 * Persisted under 'accent', which DatabaseContext preserves across its logout
 * cache clear alongside 'theme'.
 */
export const ACCENTS = ['cyan', 'red', 'green', 'purple', 'yellow', 'orange', 'magenta', 'pink'];
export const DEFAULT_ACCENT = 'cyan';
const ACCENT_STORAGE_KEY = 'accent';

export const ACCENT_LABELS = {
  cyan: 'Cyan',
  red: 'Red',
  green: 'Green',
  purple: 'Purple',
  yellow: 'Yellow',
  orange: 'Orange',
  magenta: 'Magenta',
  pink: 'Pink',
};

const isValid = (value) => THEMES.includes(value);
const isValidAccent = (value) => ACCENTS.includes(value);

/** Read a stored choice. Private-mode browsers throw on localStorage. */
const readStored = (key, valid, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    return valid(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
};

export const readStoredTheme = () => readStored(STORAGE_KEY, isValid, DEFAULT_THEME);
export const readStoredAccent = () => readStored(ACCENT_STORAGE_KEY, isValidAccent, DEFAULT_ACCENT);

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  themes: THEMES,
  labels: THEME_LABELS,
  accent: DEFAULT_ACCENT,
  setAccent: () => {},
  accents: ACCENTS,
  accentLabels: ACCENT_LABELS,
});

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);
  const [accent, setAccentState] = useState(readStoredAccent);

  // The inline script in index.html has already set this before first paint;
  // re-applying keeps the attribute correct after every later change.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* private mode — the theme still applies for this session */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    } catch {
      /* private mode — the accent still applies for this session */
    }
  }, [accent]);

  const setTheme = useCallback((next) => {
    if (isValid(next)) setThemeState(next);
  }, []);

  const setAccent = useCallback((next) => {
    if (isValidAccent(next)) setAccentState(next);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      themes: THEMES,
      labels: THEME_LABELS,
      accent,
      setAccent,
      accents: ACCENTS,
      accentLabels: ACCENT_LABELS,
    }),
    [theme, setTheme, accent, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
