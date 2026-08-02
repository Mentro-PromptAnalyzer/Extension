// ---------------------------------------------------------------------------
// Score badge — the main circle that sits next to the input bar.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import type { PlatformConfig } from './selectors';
import {
  BADGE_SIZE,
  RING_R,
  Z_BADGE,
  ID_BADGE,
  ID_BADGE_SVG,
  ID_BRIDGE,
  CLASS_BUBBLE,
  CLASS_PULSE,
  ID_PULSE_STYLE,
  getScoreColor,
} from './theme';
import {
  buildCircleSvg,
  injectGlassDefs,
  findInputBar,
  findPlusButton,
  positionBadge,
  waitForPlusButtonAndReposition,
} from './dom-utils';
import { showBubbles, hideBubbles, setCurrentScore } from './bubbles';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let detailedMetricsEnabled = false;
let currentScore: LiveScore | null = null;
let scoreAnimFrame: number | null = null;

export function setDetailedMetricsEnabled(enabled: boolean): void {
  detailedMetricsEnabled = enabled;
}

// ---------------------------------------------------------------------------
// Pulse style injection
// ---------------------------------------------------------------------------

function injectPulseStyles(): void {
  if (document.getElementById(ID_PULSE_STYLE)) return;
  const style = document.createElement('style');
  style.id = ID_PULSE_STYLE;
  style.textContent = `
    @keyframes mentro-pulse {
      0%   { filter: drop-shadow(0 0 0px rgba(167,139,250,0.0)); }
      50%  { filter: drop-shadow(0 0 8px rgba(167,139,250,0.9)); }
      100% { filter: drop-shadow(0 0 0px rgba(167,139,250,0.0)); }
    }
    #${ID_BADGE_SVG}.${CLASS_PULSE} {
      animation: mentro-pulse 1.2s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Animated score counter
// ---------------------------------------------------------------------------

function animateScoreTo(textEl: Element, from: number, to: number): void {
  if (scoreAnimFrame !== null) cancelAnimationFrame(scoreAnimFrame);
  if (from === to) {
    textEl.textContent = String(to);
    return;
  }

  const duration = 280;
  const start = performance.now();

  function step(now: number): void {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    textEl.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) {
      scoreAnimFrame = requestAnimationFrame(step);
    } else {
      scoreAnimFrame = null;
    }
  }

  scoreAnimFrame = requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setBadgeLoading(loading: boolean): void {
  injectPulseStyles();
  const svg = document.getElementById(ID_BADGE_SVG);
  if (!svg) return;
  if (loading) svg.classList.add(CLASS_PULSE);
  else svg.classList.remove(CLASS_PULSE);
}

export function renderOverlay(
  score: LiveScore,
  inputEl: HTMLElement,
  platform?: PlatformConfig
): void {
  currentScore = score;
  setCurrentScore(score);
  const inputBar = findInputBar(inputEl, platform);
  const color = getScoreColor(score.overall);

  let badge = document.getElementById(ID_BADGE) as HTMLElement | null;

  if (!badge) {
    injectGlassDefs();

    badge = document.createElement('div');
    badge.id = ID_BADGE;
    badge.style.cssText = `
      position: fixed;
      width: ${BADGE_SIZE}px;
      height: ${BADGE_SIZE}px;
      z-index: ${Z_BADGE};
      cursor: default;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const { svg } = buildCircleSvg(score.overall, color, 'mentro-badge');
    svg.setAttribute('id', ID_BADGE_SVG);
    svg.style.cssText = 'position:absolute;top:0;left:0;transition:filter 0.2s ease;';
    badge.appendChild(svg);

    badge.addEventListener('mouseenter', () => {
      const s = document.getElementById(ID_BADGE_SVG);
      if (s)
        s.style.filter = `drop-shadow(0 3px 16px ${getScoreColor(currentScore?.overall ?? 0)}88)`;
      if (detailedMetricsEnabled) showBubbles(badge!);
    });
    badge.addEventListener('mouseleave', (e: MouseEvent) => {
      const s = document.getElementById(ID_BADGE_SVG);
      if (s)
        s.style.filter = `drop-shadow(0 2px 10px ${getScoreColor(currentScore?.overall ?? 0)}55)`;
      const rel = e.relatedTarget as HTMLElement | null;
      if (rel?.closest(`.${CLASS_BUBBLE}`) || rel?.id === ID_BRIDGE) return;
      hideBubbles();
    });

    document.body.appendChild(badge);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        badge!.style.opacity = '1';
      })
    );
  }

  // Update SVG elements
  const glassBg = badge.querySelector('#mentro-badge-glassbg');
  if (glassBg) {
    glassBg.setAttribute('fill', `${color}18`);
    glassBg.setAttribute('stroke', `${color}38`);
  }
  const arc = badge.querySelector('#mentro-badge-arc');
  if (arc) {
    const circumference = 2 * Math.PI * RING_R;
    const filled = circumference * (score.overall / 100);
    const gap = circumference - filled;
    arc.setAttribute('stroke', color);
    arc.setAttribute('stroke-dasharray', `${filled} ${gap}`);
  }
  const text = badge.querySelector('#mentro-badge-text');
  if (text) {
    text.setAttribute('fill', color);
    const currentVal = parseInt(text.textContent ?? '0', 10);
    animateScoreTo(text, isNaN(currentVal) ? score.overall : currentVal, score.overall);
  }
  const svg = badge.querySelector(`#${ID_BADGE_SVG}`) as HTMLElement | null;
  if (svg) svg.style.filter = `drop-shadow(0 2px 10px ${color}55)`;

  requestAnimationFrame(() => {
    const btn = platform?.plusButtonSelector ? findPlusButton(platform.plusButtonSelector) : null;
    positionBadge(badge!, inputBar, platform);
    if (platform?.plusButtonSelector && !btn) {
      waitForPlusButtonAndReposition(badge!, inputBar, platform);
    }
  });
}

export function hideOverlay(): void {
  hideBubbles();
  const badge = document.getElementById(ID_BADGE);
  if (badge) {
    badge.style.opacity = '0';
    setTimeout(() => badge.remove(), 200);
  }
}
