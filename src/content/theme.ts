// ---------------------------------------------------------------------------
// Content-script design tokens — single source of truth for all overlay colors,
// sizes, and z-indices. Content scripts inject styles into host pages, so we
// cannot rely on CSS custom properties (the host page may clobber them).
// Instead we export TS constants that the overlay modules interpolate into
// inline styles and injected <style> blocks.
//
// Brand color is dynamic — controlled by the user's theme selection stored in
// chrome.storage.sync. Call `setThemeBrand(rgb)` to change it at runtime.
// ---------------------------------------------------------------------------

// ── Theme brand RGB — default purple, overwritten on init / settings update ──
let _brandRgb = '167,139,250';

export function setThemeBrand(rgb: string): void {
  _brandRgb = rgb;
}

export function getBrandRgb(): string {
  return _brandRgb;
}

// ── Brand (dynamic) ──
export function brand(alpha = 1): string {
  return `rgba(${_brandRgb},${alpha})`;
}

// For template literal usage modules should call the getter functions.
export function getBrand(): string {
  return `rgba(${_brandRgb},1)`;
}
export function getBrand90(): string {
  return `rgba(${_brandRgb},0.9)`;
}
export function getBrand55(): string {
  return `rgba(${_brandRgb},0.55)`;
}
export function getBrand45(): string {
  return `rgba(${_brandRgb},0.45)`;
}
export function getBrand35(): string {
  return `rgba(${_brandRgb},0.35)`;
}
export function getBrand30(): string {
  return `rgba(${_brandRgb},0.30)`;
}
export function getBrand20(): string {
  return `rgba(${_brandRgb},0.20)`;
}
export function getBrand18(): string {
  return `rgba(${_brandRgb},0.18)`;
}
export function getBrand12(): string {
  return `rgba(${_brandRgb},0.12)`;
}
export function getBrand10(): string {
  return `rgba(${_brandRgb},0.10)`;
}
export function getBrand04(): string {
  return `rgba(${_brandRgb},0.04)`;
}

// ── Score colors ──
export const SCORE_GOOD = '#4ade80';
export const SCORE_MID = '#fbbf24';
export const SCORE_LOW = '#f87171';

export function getScoreColor(score: number): string {
  if (score >= 70) return SCORE_GOOD;
  if (score >= 40) return SCORE_MID;
  return SCORE_LOW;
}

// ── Feedback pill colors ──
export const PILL_GREEN = '#4ade80';
export const PILL_GREEN_GLOW = 'rgba(74, 222, 128, 0.18)';
export const PILL_GREEN_BORDER = 'rgba(74, 222, 128, 0.35)';
export const PILL_RED = '#f87171';
export const PILL_RED_GLOW = 'rgba(248, 113, 113, 0.18)';
export const PILL_RED_BORDER = 'rgba(248, 113, 113, 0.35)';

// ── Glass / surface ──
export const GLASS_BG =
  'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)';
export const GLASS_BLUR = 'blur(14px) saturate(160%)';
export const GLASS_GRAD_ID = 'mentro-glass-grad';

// ── Shadows ──
export const SHADOW_CARD = '0 4px 16px rgba(0,0,0,0.18)';
export function getShadowBrandInset(): string {
  return `inset 0 1px 0 rgba(${_brandRgb},0.12)`;
}
export function getShadowBrandInsetStrong(): string {
  return `inset 0 1px 0 rgba(${_brandRgb},0.18)`;
}

// ── Typography ──
export const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Layout ──
export const BADGE_SIZE = 48;
export const INNER_R = 15;
export const RING_R = 20;
export const RING_STROKE = 3;
export const BUBBLE_GAP = 8;

// ── Z-indices ──
export const Z_BADGE = 999999;
export const Z_BASE = 999998;

// ── DOM IDs and classes (centralized to avoid magic strings) ──
export const ID_BADGE = 'mentro-badge';
export const ID_BADGE_LABEL = 'mentro-badge-label';
export const ID_BADGE_SVG = 'mentro-badge-svg';
export const ID_GLASS_DEFS = 'mentro-glass-defs';
export const ID_BRIDGE = 'mentro-bridge';
export const ID_FEEDBACK_BRIDGE = 'mentro-feedback-bridge';
export const CLASS_BUBBLE = 'mentro-bubble';
export const CLASS_FEEDBACK = 'mentro-feedback-pill';
export const ID_PULSE_STYLE = 'mentro-pulse-style';
export const CLASS_PULSE = 'mentro-pulsing';
export const ID_FEEDBACK_STYLE = 'mentro-feedback-style';
export const ID_BUBBLE_STYLE = 'mentro-bubble-style';

// ── Dimension labels ──
export const DIMENSION_LABELS = ['Ownership', 'Depth', 'Critical', 'Clarity'] as const;

// ── Theme brand lookup table (must match popup/themes.ts) ──
const THEME_BRAND_MAP: Record<string, string> = {
  dark: '167,139,250',
  midnight: '99,148,255',
  emerald: '52,211,153',
  rose: '244,114,182',
  sunset: '251,146,60',
  nord: '136,192,208',
};

export function themeIdToBrandRgb(themeId: string): string {
  return THEME_BRAND_MAP[themeId] ?? THEME_BRAND_MAP['dark'];
}
