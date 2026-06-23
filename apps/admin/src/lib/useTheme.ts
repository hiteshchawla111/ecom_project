import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'admin.theme';

function readStored(): Theme {
  const raw = localStorage.getItem(KEY);
  return raw === 'dark' || raw === 'light' ? raw : 'light';
}

/**
 * Theme state for the admin SPA. Reads the stored preference (default light),
 * reflects it onto <html data-theme> so the semantic tokens flip, and persists
 * any change. Default is light — dark mode is opt-in (PRD doesn't require it).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
