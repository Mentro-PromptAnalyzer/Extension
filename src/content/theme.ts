// ---------------------------------------------------------------------------
// Content-script design tokens — single source of truth for all overlay colors,
// sizes, and z-indices. Content scripts inject styles into host pages, so we
// cannot rely on CSS custom properties (the host page may clobber them).
// Instead we export TS constants that the overlay modules interpolate into
// inline styles and injected <style> blocks.
//
// To support future theming, swap the values in this file or load them
// dynamically from chrome.storage.
// ---------------------------------------------------------------------------

// ── Brand ──
export const BRAND = 'rgba(167,139,250,1)';
export const BRAND_90 = 'rgba(167,139,250,0.9)';
export const BRAND_55 = 'rgba(167,139,250,0.55)';
export const BRAND_45 = 'rgba(167,139,250,0.45)';
export const BRAND_35 = 'rgba(167,139,250,0.35)';
export const BRAND_30 = 'rgba(167,139,250,0.30)';
export const BRAND_20 = 'rgba(167,139,250,0.20)';
export const BRAND_18 = 'rgba(167,139,250,0.18)';
export const BRAND_12 = 'rgba(167,139,250,0.12)';
export const BRAND_10 = 'rgba(167,139,250,0.10)';
export const BRAND_04 = 'rgba(167,139,250,0.04)';

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
export const SHADOW_BRAND_INSET = 'inset 0 1px 0 rgba(167,139,250,0.12)';
export const SHADOW_BRAND_INSET_STRONG = 'inset 0 1px 0 rgba(167,139,250,0.18)';

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
