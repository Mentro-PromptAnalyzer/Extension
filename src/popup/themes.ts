// ---------------------------------------------------------------------------
// Theme definitions — each theme overrides the CSS custom properties from
// tokens.css by setting them on [data-theme="<id>"].
// ---------------------------------------------------------------------------

import { ThemeId } from './settings';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  brandRgb: string; // for the preview swatch
  bgPrimary: string;
}

export const THEMES: ThemeMeta[] = [
  { id: 'dark', label: 'Dark', brandRgb: '167, 139, 250', bgPrimary: '#111113' },
  { id: 'midnight', label: 'Midnight', brandRgb: '99, 148, 255', bgPrimary: '#0b0f1a' },
  { id: 'emerald', label: 'Emerald', brandRgb: '52, 211, 153', bgPrimary: '#0a1210' },
  { id: 'rose', label: 'Rosé', brandRgb: '244, 114, 182', bgPrimary: '#140b10' },
  { id: 'sunset', label: 'Sunset', brandRgb: '251, 146, 60', bgPrimary: '#13100a' },
  { id: 'nord', label: 'Nord', brandRgb: '136, 192, 208', bgPrimary: '#1a1e26' },
];

/** Apply the theme to the document root so CSS overrides take effect. */
export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
}
