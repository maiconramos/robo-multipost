'use client';

import { createContext, useContext, type ReactNode } from 'react';
import useCookie from 'react-use-cookie';
import {
  DEFAULT_THEME,
  resolveTheme,
  type ThemeMode,
} from '@gitroom/helpers/utils/theme';

const ThemeContext = createContext<ThemeMode>(DEFAULT_THEME);

/** The server cookie seeds both markup and the first client render. */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeMode;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={resolveTheme(initialTheme)}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const initialTheme = useContext(ThemeContext);
  const [value, setMode] = useCookie('mode', initialTheme);
  return [resolveTheme(value), setMode] as const;
}
