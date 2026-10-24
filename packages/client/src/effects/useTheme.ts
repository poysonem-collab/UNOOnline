import { useEffect, useState } from 'react';
import { getTheme, onThemeChange, setTheme } from './theme';

/** The chosen table theme, kept in sync across the app. */
export function useTheme(): [string, (theme: string) => void] {
  const [theme, setState] = useState(getTheme);
  useEffect(() => {
    const stop = onThemeChange(setState);
    return () => {
      stop();
    };
  }, []);
  return [theme, setTheme];
}
