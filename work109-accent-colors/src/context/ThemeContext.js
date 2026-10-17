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

const isValid = (value) => THEMES.includes(value);

/** Read the stored choice. Private-mode browsers throw on localStorage. */
export const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValid(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  themes: THEMES,
  labels: THEME_LABELS,
});

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(readStoredTheme);

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

  const setTheme = useCallback((next) => {
    if (isValid(next)) setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, themes: THEMES, labels: THEME_LABELS }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
