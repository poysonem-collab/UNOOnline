/** Table backgrounds each player can pick for themselves (remembered on this device). */
export interface ThemeInfo {
  id: string;
  name: string;
}

export const THEMES: ThemeInfo[] = [
  { id: 'classic', name: 'Classic Felt' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'wood', name: 'Wooden Table' },
  { id: 'neon', name: 'Neon Arcade' },
  { id: 'candy', name: 'Candy' },
];

const THEME_KEY = 'uno.theme';
const listeners = new Set<(theme: string) => void>();
let theme = readTheme();

function readTheme(): string {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === saved) ? saved! : 'classic';
  } catch {
    return 'classic';
  }
}

/** Puts the theme on the page (styles.css draws each one). */
export function applyTheme(): void {
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): string {
  return theme;
}

export function setTheme(id: string): void {
  theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // Not remembered; that's fine.
  }
  applyTheme();
  listeners.forEach((l) => l(id));
}

export function onThemeChange(listener: (theme: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
