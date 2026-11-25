import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  STORAGE_KEYS,
  parseThemePreference,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from './settings';
import { readSetting, useMediaQuery, writeSetting } from './storage';

interface ThemeState {
  preference: ThemePreference;
  /** What is applied: the preference, with `system` resolved. */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeState>({
  preference: 'system',
  theme: 'light',
  setPreference: () => undefined,
});

/**
 * Owns the theme once React runs. index.html applies the stored theme before
 * first paint; this keeps `data-theme` on <html> in step afterwards.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(() =>
    parseThemePreference(readSetting(STORAGE_KEYS.theme)),
  );
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const state = useMemo(
    (): ThemeState => ({
      preference,
      theme,
      setPreference: (next) => {
        setPreference(next);
        writeSetting(STORAGE_KEYS.theme, next);
      },
    }),
    [preference, theme],
  );
  return (
    <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
