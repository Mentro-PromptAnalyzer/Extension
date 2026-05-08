// ---------------------------------------------------------------------------
// Score badge UI — main circle badge, fans out 4 sub-bubbles with score rings.
// Each sub-bubble has a thin SVG arc showing score 0-100 = 0-360deg.
// Also renders 3 feedback pills that fly up from the input bar.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import type { PlatformConfig } from './selectors';

const BADGE_ID = 'askbetter-badge';
const BUBBLE_CLASS = 'askbetter-bubble';
const PULSE_STYLE_ID = 'askbetter-pulse-style';
const PULSE_CLASS = 'askbetter-pulsing';
const FEEDBACK_CLASS = 'askbetter-feedback-pill';
const FEEDBACK_STYLE_ID = 'askbetter-feedback-style';
const BASE_Z = 999998;
const BADGE_Z = 999999;

// Sub-bubble sizing
const BUBBLE_SIZE = 44;       // outer diameter of the SVG
const INNER_R = 14;           // radius of the dark circle inside
const RING_R = 19;            // radius of the progress arc
const RING_STROKE = 3;

// Wider spacing so bubbles never overlap
const ARC = [
  { x: -72, y: -70 },
  { x: -24, y: -88 },
  { x:  24, y: -88 },
  { x:  72, y: -70 },
];

const LABELS = ['Ownership', 'Depth', 'Critical', 'Clarity'];
const KEYS: (keyof LiveScore)[] = ['ownership', 'depth', 'critical', 'clarity'];

let currentScore: LiveScore | null = null;
let bubblesVisible = false;
let mouseMoveListener: ((e: MouseEvent) => void) | null = null;
let hullPoints: [number, number][] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 70) return '#4ade80';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}

function findInputBar(inputEl: HTMLElement, _platform?: PlatformConfig): HTMLElement {
  const composerSurface = document.querySelector<HTMLElement>('[data-composer-surface="true"]');
  if (composerSurface) return composerSurface;
  let el: HTMLElement = inputEl;
  while (el.parentElement && el.parentElement !== document.body) {
    if (el.parentElement.children.length > 1) return el;
    el = el.parentElement;
  }
  return el;
}

function positionBadge(badge: HTMLElement, inputBar: HTMLElement): void {
  const rect = inputBar.getBoundingClientRect();
  const size = 36;
  badge.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
  badge.style.left = `${rect.left - size - 10}px`;
}

// ---------------------------------------------------------------------------
// Point-in-polygon & convex hull
// ---------------------------------------------------------------------------

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function buildHull(badgeCx: number, badgeCy: number): [number, number][] {
  const pad = 24;
  const badgeR = 18 + pad;
  const allPoints: [number, number][] = [
    [badgeCx - badgeR, badgeCy - badgeR],
    [badgeCx + badgeR, badgeCy - badgeR],
    [badgeCx + badgeR, badgeCy + badgeR],
    [badgeCx - badgeR, badgeCy + badgeR],
  ];
  ARC.forEach(off => {
    const cx = badgeCx + off.x;
    const cy = badgeCy + off.y;
    // Include label space below each bubble
    const r = BUBBLE_SIZE / 2 + pad;
    allPoints.push([cx - r, cy - r]);
    allPoints.push([cx + r, cy - r]);
    allPoints.push([cx + r, cy + r + 18]); // +18 for label
    allPoints.push([cx - r, cy + r + 18]);
  });
  return convexHull(allPoints);
}

// ---------------------------------------------------------------------------
// Sub-bubble SVG with score ring
// ---------------------------------------------------------------------------

function makeBubbleSVG(value: number, index: number): HTMLElement {
  const color = getScoreColor(value);
  const circumference = 2 * Math.PI * RING_R;
  const filled = circumference * (value / 100);
  const gap = circumference - filled;

  // Wrapper div (positions the SVG + label together)
  const wrapper = document.createElement('div');
  wrapper.className = BUBBLE_CLASS;
  wrapper.dataset.index = String(index);
  wrapper.style.cssText = `
    position: fixed;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    pointer-events: auto;
    opacity: 0;
    transform: translate(0px, 0px) scale(0.5);
    transition: opacity 0.22s ease, transform 0.22s ease;
    cursor: default;
    z-index: ${BASE_Z};
  `;

  // SVG circle with progress ring
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(BUBBLE_SIZE));
  svg.setAttribute('height', String(BUBBLE_SIZE));
  svg.setAttribute('viewBox', `0 0 ${BUBBLE_SIZE} ${BUBBLE_SIZE}`);
  svg.style.cssText = `
    filter: drop-shadow(0 2px 8px ${color}44);
    transition: filter 0.15s ease;
  `;

  const cx = BUBBLE_SIZE / 2;
  const cy = BUBBLE_SIZE / 2;

  // Background track
  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', String(cx));
  track.setAttribute('cy', String(cy));
  track.setAttribute('r', String(RING_R));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'rgba(255,255,255,0.07)');
  track.setAttribute('stroke-width', String(RING_STROKE));
  svg.appendChild(track);

  // Progress arc — starts from top (-90deg rotation)
  const arc = document.createElementNS(svgNS, 'circle');
  arc.setAttribute('cx', String(cx));
  arc.setAttribute('cy', String(cy));
  arc.setAttribute('r', String(RING_R));
  arc.setAttribute('fill', 'none');
  arc.setAttribute('stroke', color);
  arc.setAttribute('stroke-width', String(RING_STROKE));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', `${filled} ${gap}`);
  arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
  arc.style.transition = 'stroke-dasharray 0.4s ease';
  svg.appendChild(arc);

  // Inner dark circle
  const inner = document.createElementNS(svgNS, 'circle');
  inner.setAttribute('cx', String(cx));
  inner.setAttribute('cy', String(cy));
  inner.setAttribute('r', String(INNER_R));
  inner.setAttribute('fill', 'rgba(15, 10, 30, 0.95)');
  svg.appendChild(inner);

  // Score number
  const text = document.createElementNS(svgNS, 'text');
  text.setAttribute('x', String(cx));
  text.setAttribute('y', String(cy));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('fill', color);
  text.setAttribute('font-size', '11');
  text.setAttribute('font-weight', '800');
  text.setAttribute('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
  text.textContent = String(value);
  svg.appendChild(text);

  wrapper.appendChild(svg);

  // Label below
  const label = document.createElement('div');
  label.style.cssText = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #a78bfa;
    white-space: nowrap;
    pointer-events: none;
  `;
  label.textContent = LABELS[index];
  wrapper.appendChild(label);

  // Hover: raise z + glow
  wrapper.addEventListener('mouseenter', () => {
    wrapper.style.zIndex = String(BADGE_Z + 1);
    svg.style.filter = `drop-shadow(0 3px 14px ${color}88)`;
    document.querySelectorAll<HTMLElement>(`.${BUBBLE_CLASS}`).forEach(b => {
      if (b !== wrapper) b.style.zIndex = String(BASE_Z - 1);
    });
  });

  wrapper.addEventListener('mouseleave', () => {
    svg.style.filter = `drop-shadow(0 2px 8px ${color}44)`;
    document.querySelectorAll<HTMLElement>(`.${BUBBLE_CLASS}`).forEach(b => {
      b.style.zIndex = String(BASE_Z);
    });
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------

function startMouseTracking(): void {
  if (mouseMoveListener) return;
  mouseMoveListener = (e: MouseEvent) => {
    if (!bubblesVisible) return;
    if (!pointInPolygon(e.clientX, e.clientY, hullPoints)) hideBubbles();
  };
  document.addEventListener('mousemove', mouseMoveListener);
}

function stopMouseTracking(): void {
  if (mouseMoveListener) {
    document.removeEventListener('mousemove', mouseMoveListener);
    mouseMoveListener = null;
  }
}

function showBubbles(badge: HTMLElement): void {
  if (!currentScore) return;

  // If bubblesVisible is true but no bubble elements exist in the DOM,
  // the state is stale (e.g. after a tab switch). Reset and re-render.
  if (bubblesVisible) {
    const existing = document.querySelectorAll<HTMLElement>(`.${BUBBLE_CLASS}`);
    if (existing.length === 0) {
      bubblesVisible = false;
      stopMouseTracking();
    } else {
      return;
    }
  }

  bubblesVisible = true;

  const badgeRect = badge.getBoundingClientRect();
  const badgeCx = badgeRect.left + badgeRect.width / 2;
  const badgeCy = badgeRect.top + badgeRect.height / 2;

  hullPoints = buildHull(badgeCx, badgeCy);
  startMouseTracking();

  KEYS.forEach((key, i) => {
    const value = currentScore![key] as number;
    const wrapper = makeBubbleSVG(value, i);

    // Start at badge center (offset by half bubble size)
    wrapper.style.left = `${badgeCx - BUBBLE_SIZE / 2}px`;
    wrapper.style.top = `${badgeCy - BUBBLE_SIZE / 2}px`;
    document.body.appendChild(wrapper);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrapper.style.opacity = '1';
        wrapper.style.transform = `translate(${ARC[i].x}px, ${ARC[i].y}px) scale(1)`;
      });
    });
  });
}

function hideBubbles(): void {
  if (!bubblesVisible) return;
  bubblesVisible = false;
  stopMouseTracking();

  document.querySelectorAll<HTMLElement>(`.${BUBBLE_CLASS}`).forEach(b => {
    b.style.opacity = '0';
    b.style.transform = 'translate(0px, 0px) scale(0.5)';
    setTimeout(() => b.remove(), 220);
  });
}

// ---------------------------------------------------------------------------
// Feedback pills — 3 bullet suggestions that fly up from the input bar
// ---------------------------------------------------------------------------

function injectFeedbackStyles(): void {
  if (document.getElementById(FEEDBACK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FEEDBACK_STYLE_ID;
  style.textContent = `
    @keyframes askbetter-fly-up {
      0%   { opacity: 0; transform: translateY(18px) scale(0.92); }
      60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0px) scale(1); }
    }
    @keyframes askbetter-fly-down {
      0%   { opacity: 1; transform: translateY(0px) scale(1); }
      100% { opacity: 0; transform: translateY(14px) scale(0.92); }
    }
    .${FEEDBACK_CLASS} {
      animation: askbetter-fly-up 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .${FEEDBACK_CLASS}.hiding {
      animation: askbetter-fly-down 0.22s ease-in both;
    }
  `;
  document.head.appendChild(style);
}

let feedbackVisible = false;

// Pending feedback — stored when Ollama responds, rendered on input bar hover
let pendingSuggestions: string[] = [];
let pendingScores: Pick<LiveScore, 'ownership' | 'depth' | 'critical' | 'clarity'> | null = null;
let pendingInputEl: HTMLElement | null = null;
let pendingPlatform: PlatformConfig | undefined;

// Input bar hover listeners — kept so we can remove them on re-attach
let inputBarHoverEl: HTMLElement | null = null;
let inputBarEnterListener: (() => void) | null = null;
let inputBarLeaveListener: (() => void) | null = null;
let mouseInsideInputBar = false;

function showPendingPills(): void {
  console.log('[AskBetter:pills] mouseenter fired — pendingScores:', pendingScores, 'suggestions:', pendingSuggestions, 'inputEl:', pendingInputEl);
  if (!pendingScores || pendingSuggestions.length === 0 || !pendingInputEl) {
    console.log('[AskBetter:pills] showPendingPills bailed — missing data');
    return;
  }
  injectFeedbackStyles();

  // Remove any existing pill DOM nodes without touching pending state
  document.querySelectorAll<HTMLElement>(`.${FEEDBACK_CLASS}`).forEach(p => p.remove());
  feedbackVisible = true;

  // Use the already-resolved input bar element for positioning
  const inputBar = inputBarHoverEl ?? findInputBar(pendingInputEl, pendingPlatform);
  const rect = inputBar.getBoundingClientRect();
  console.log('[AskBetter:pills] rendering pills at rect:', rect.left, rect.top, rect.width);

  const dimOrder: (keyof typeof pendingScores)[] = ['ownership', 'depth', 'critical', 'clarity'];
  const lowDims = dimOrder.filter(k => pendingScores![k] < 60);

  pendingSuggestions.slice(0, 3).forEach((text, i) => {
    const isGreen = lowDims.length === 0 || (lowDims[i] === undefined);
    const color = isGreen ? '#4ade80' : '#f87171';
    const glowColor = isGreen ? 'rgba(74, 222, 128, 0.18)' : 'rgba(248, 113, 113, 0.18)';
    const borderColor = isGreen ? 'rgba(74, 222, 128, 0.35)' : 'rgba(248, 113, 113, 0.35)';

    const pill = document.createElement('div');
    pill.className = FEEDBACK_CLASS;

    pill.style.cssText = `
      position: fixed;
      left: ${rect.left + 12}px;
      top: ${rect.top - 44 - i * 40}px;
      max-width: ${Math.min(rect.width - 24, 520)}px;
      background: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%);
      border: 1px solid ${borderColor};
      border-top: 1px solid rgba(255,255,255,0.18);
      border-radius: 20px;
      padding: 7px 14px 7px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: ${color};
      box-shadow: 0 0 20px 3px ${glowColor}, 0 4px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12);
      z-index: ${BADGE_Z + 10 + i};
      pointer-events: auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      animation-delay: ${i * 60}ms;
      backdrop-filter: blur(14px) saturate(160%);
      -webkit-backdrop-filter: blur(14px) saturate(160%);
      cursor: default;
    `;

    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${color};
      flex-shrink: 0;
      box-shadow: 0 0 6px 1px ${color}88;
    `;

    const label = document.createElement('span');
    label.textContent = text;

    pill.appendChild(dot);
    pill.appendChild(label);
    document.body.appendChild(pill);
  });
}

/**
 * Attach mouseenter/mouseleave listeners to the input bar element so pills
 * appear on hover and disappear when the mouse leaves.
 * Safe to call multiple times — removes previous listeners first.
 */
export function attachInputBarHover(inputEl: HTMLElement, platform?: PlatformConfig): void {
  // Remove previous listeners if re-attaching
  if (inputBarHoverEl && inputBarEnterListener && inputBarLeaveListener) {
    inputBarHoverEl.removeEventListener('mouseenter', inputBarEnterListener);
    inputBarHoverEl.removeEventListener('mouseleave', inputBarLeaveListener);
  }

  const inputBar = findInputBar(inputEl, platform);
  console.log('[AskBetter:pills] attachInputBarHover — resolved inputBar:', inputBar.tagName, inputBar.className.slice(0, 80));
  inputBarHoverEl = inputBar;

  inputBarEnterListener = () => { mouseInsideInputBar = true; showPendingPills(); };
  inputBarLeaveListener = () => { mouseInsideInputBar = false; hideFeedback(); };

  inputBar.addEventListener('mouseenter', inputBarEnterListener);
  inputBar.addEventListener('mouseleave', inputBarLeaveListener);

  // On page load the mouse may already be over the input bar without a
  // mouseenter ever firing — seed the flag using :hover.
  if (inputBar.matches(':hover')) {
    mouseInsideInputBar = true;
  }
}

/**
 * Store feedback from Ollama/heuristic. Pills will show on next input bar hover.
 */
export function renderFeedback(
  suggestions: string[],
  scores: Pick<LiveScore, 'ownership' | 'depth' | 'critical' | 'clarity'>,
  inputEl: HTMLElement,
  platform?: PlatformConfig,
): void {
  console.log('[AskBetter:pills] renderFeedback called — suggestions:', suggestions, 'scores:', scores);
  // Save pending state — pills render on hover, not immediately.
  // Also dismiss any currently visible pills so they refresh on next hover.
  pendingSuggestions = suggestions;
  pendingScores = scores;
  pendingInputEl = inputEl;
  pendingPlatform = platform;
  if (feedbackVisible) {
    document.querySelectorAll<HTMLElement>(`.${FEEDBACK_CLASS}`).forEach(p => p.remove());
    feedbackVisible = false;
  }
  // If the mouse is already inside the input bar, show pills immediately
  if (mouseInsideInputBar) {
    showPendingPills();
  }
}

export function hideFeedback(instant = false): void {
  if (!feedbackVisible && !instant) return;
  feedbackVisible = false;

  // Only clear pending state when explicitly resetting (user started typing),
  // not on a normal mouseleave hide — pending should survive hover cycles.
  if (instant) {
    pendingSuggestions = [];
    pendingScores = null;
    pendingInputEl = null;
  }

  const pills = document.querySelectorAll<HTMLElement>(`.${FEEDBACK_CLASS}`);
  if (pills.length === 0) return;

  if (instant) {
    pills.forEach(p => p.remove());
    return;
  }

  pills.forEach(p => {
    p.classList.add('hiding');
    setTimeout(() => p.remove(), 240);
  });
}

// ---------------------------------------------------------------------------
// Pulsing border — shown while the Ollama AI score is pending
// ---------------------------------------------------------------------------

function injectPulseStyles(): void {
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes askbetter-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0.7), 0 2px 10px rgba(0,0,0,0.4); border-color: #a78bfa; }
      50%  { box-shadow: 0 0 0 4px rgba(167, 139, 250, 0), 0 2px 10px rgba(0,0,0,0.4); border-color: #c4b5fd; }
      100% { box-shadow: 0 0 0 0 rgba(167, 139, 250, 0), 0 2px 10px rgba(0,0,0,0.4); border-color: #a78bfa; }
    }
    #${BADGE_ID}.${PULSE_CLASS} {
      animation: askbetter-pulse 1.2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Toggle the pulsing border on the badge.
 * Call with true when Ollama scoring starts, false when it resolves.
 */
export function setBadgeLoading(loading: boolean): void {
  injectPulseStyles();
  const badge = document.getElementById(BADGE_ID);
  if (!badge) return;
  if (loading) {
    badge.classList.add(PULSE_CLASS);
  } else {
    badge.classList.remove(PULSE_CLASS);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderOverlay(score: LiveScore, inputEl: HTMLElement, platform?: PlatformConfig): void {
  currentScore = score;
  const inputBar = findInputBar(inputEl, platform);
  let badge = document.getElementById(BADGE_ID) as HTMLElement | null;

  if (!badge) {
    badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.style.cssText = `
      position: fixed;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(15, 10, 30, 0.92);
      border: 2px solid rgba(139, 92, 246, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
      box-shadow: 0 2px 10px rgba(0,0,0,0.4);
      z-index: ${BADGE_Z};
      cursor: default;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s ease, border-color 0.2s ease;
    `;
    badge.addEventListener('mouseenter', () => showBubbles(badge!));
    document.body.appendChild(badge);

    // Fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        badge!.style.opacity = '1';
      });
    });
  }

  const color = getScoreColor(score.overall);
  badge.style.color = color;
  badge.style.borderColor = `${color}99`;
  badge.textContent = String(score.overall);

  requestAnimationFrame(() => positionBadge(badge!, inputBar));
}

export function hideOverlay(): void {
  hideBubbles();
  const badge = document.getElementById(BADGE_ID);
  if (badge) {
    badge.style.opacity = '0';
    setTimeout(() => badge.remove(), 200);
  }
}

// When the tab is hidden, bubble DOM nodes may be cleaned up by the browser
// or simply become stale. Reset all state so hovering the badge on return
// always shows fresh bubbles.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab is being hidden — tear down bubbles and reset state cleanly
    stopMouseTracking();
    document.querySelectorAll<HTMLElement>(`.${BUBBLE_CLASS}`).forEach(b => b.remove());
    bubblesVisible = false;
  }
});
