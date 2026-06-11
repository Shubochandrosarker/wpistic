// Light/dark theme manager. The no-flash boot script in dashboard.php sets the
// initial data-theme on <html> before React mounts; this module keeps it in
// sync, persists the choice, and reacts to OS-level changes when on "system".

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'wpistic-theme'; // 'light' | 'dark' | 'system'
const root = typeof document !== 'undefined' ? document.documentElement : null;

const prefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/** The stored preference, defaulting to following the OS. */
export function getPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'system';
  } catch {
    return 'system';
  }
}

/** The concrete theme actually applied right now ('light' | 'dark'). */
export function resolveTheme(pref = getPreference()) {
  return pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref;
}

/** Apply a concrete theme to <html> without persisting. */
function applyTheme(theme) {
  if (!root) return;
  root.setAttribute('data-theme', theme);
}

/** Persist a preference and apply it. */
export function setPreference(pref) {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage blocked — session-only is fine */
  }
  applyTheme(resolveTheme(pref));
  window.dispatchEvent(new CustomEvent('wpistic:themechange', { detail: pref }));
}

/**
 * React hook: returns the current applied theme and a toggle.
 * Toggling flips between an explicit light/dark choice (leaving "system" mode).
 */
export function useTheme() {
  const [pref, setPref] = useState(getPreference);

  useEffect(() => {
    const onChange = (e) => setPref(e.detail ?? getPreference());
    window.addEventListener('wpistic:themechange', onChange);

    // Follow OS changes only while in "system" mode.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onOS = () => {
      if (getPreference() === 'system') applyTheme(resolveTheme('system'));
    };
    mq?.addEventListener?.('change', onOS);

    return () => {
      window.removeEventListener('wpistic:themechange', onChange);
      mq?.removeEventListener?.('change', onOS);
    };
  }, []);

  const theme = resolveTheme(pref);
  const toggle = () => setPreference(theme === 'dark' ? 'light' : 'dark');

  return { theme, preference: pref, setPreference, toggle };
}
