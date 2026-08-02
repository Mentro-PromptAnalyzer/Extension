// ---------------------------------------------------------------------------
// Metric bubble circles — the 4 vertical circles that stack above the badge.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import {
  BADGE_SIZE,
  BUBBLE_GAP,
  Z_BADGE,
  Z_BASE,
  ID_BADGE,
  ID_BADGE_LABEL,
  ID_BRIDGE,
  CLASS_BUBBLE,
  ID_BUBBLE_STYLE,
  DIMENSION_LABELS,
  FONT_FAMILY,
  BRAND_90,
  getScoreColor,
} from './theme';
import { buildCircleSvg, injectGlassDefs } from './dom-utils';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const KEYS: (keyof LiveScore)[] = ['ownership', 'depth', 'critical', 'clarity'];
const LABELS = DIMENSION_LABELS;
const BUBBLE_SIZE = BADGE_SIZE;
const ROW_H = BUBBLE_SIZE + 11 + BUBBLE_GAP;

let currentScore: LiveScore | null = null;
let bubblesVisible = false;
let badgeLabelRemoveTimeout: ReturnType<typeof setTimeout> | null = null;

export function setCurrentScore(score: LiveScore | null): void {
  currentScore = score;
}

export function isBubblesVisible(): boolean {
  return bubblesVisible;
}

// ---------------------------------------------------------------------------
// Style injection
// ---------------------------------------------------------------------------

function injectBubbleStyles(): void {
  if (document.getElementById(ID_BUBBLE_STYLE)) return;
  const style = document.createElement('style');
  style.id = ID_BUBBLE_STYLE;
  style.textContent = `
    .${CLASS_BUBBLE} {
      position: fixed;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      width: ${BUBBLE_SIZE}px;
      overflow: visible;
      pointer-events: auto;
      cursor: default;
      z-index: ${Z_BASE};
      opacity: 0;
      transform: translateY(12px) scale(0.85);
      transition: opacity 0.25s cubic-bezier(0.22,1,0.36,1),
                  transform 0.25s cubic-bezier(0.22,1,0.36,1);
    }
    .${CLASS_BUBBLE}.visible {
      opacity: 1;
      transform: translateY(0px) scale(1);
    }
    .mentro-bubble-svg {
      transition: filter 0.15s ease;
      flex-shrink: 0;
    }
    .mentro-bubble-label {
      font-family: ${FONT_FAMILY};
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: ${BRAND_90};
      white-space: nowrap;
      pointer-events: none;
      width: max-content;
      text-align: center;
      align-self: center;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Bubble construction
// ---------------------------------------------------------------------------

function makeBubble(value: number, index: number): HTMLElement {
  const color = getScoreColor(value);

  const wrapper = document.createElement('div');
  wrapper.className = CLASS_BUBBLE;
  wrapper.dataset.index = String(index);

  const { svg } = buildCircleSvg(value, color);
  svg.classList.add('mentro-bubble-svg');
  svg.style.filter = `drop-shadow(0 2px 10px ${color}55)`;
  wrapper.appendChild(svg);

  const label = document.createElement('div');
  label.className = 'mentro-bubble-label';
  label.textContent = LABELS[index];
  wrapper.appendChild(label);

  wrapper.addEventListener('mouseenter', () => {
    svg.style.filter = `drop-shadow(0 3px 16px ${color}88)`;
  });
  wrapper.addEventListener('mouseleave', (e: MouseEvent) => {
    svg.style.filter = `drop-shadow(0 2px 10px ${color}55)`;
    const rel = e.relatedTarget as HTMLElement | null;
    if (rel?.closest(`.${CLASS_BUBBLE}`) || rel?.id === ID_BRIDGE || rel?.id === ID_BADGE) return;
    hideBubbles();
  });

  return wrapper;
}

// ---------------------------------------------------------------------------
// Show / hide
// ---------------------------------------------------------------------------

export function showBubbles(badge: HTMLElement): void {
  if (!currentScore) return;
  if (bubblesVisible) {
    if (document.querySelectorAll(`.${CLASS_BUBBLE}`).length > 0) return;
    bubblesVisible = false;
  }

  injectGlassDefs();
  injectBubbleStyles();
  bubblesVisible = true;

  const badgeRect = badge.getBoundingClientRect();
  const badgeCx = badgeRect.left + badgeRect.width / 2;
  const badgeTop = badgeRect.top;

  const stackH = KEYS.length * ROW_H - BUBBLE_GAP;
  const stackTop = badgeTop - BUBBLE_GAP - stackH;

  // "OVERALL" label
  let badgeLabel = document.getElementById(ID_BADGE_LABEL) as HTMLElement | null;
  if (!badgeLabel) {
    badgeLabel = document.createElement('div');
    badgeLabel.id = ID_BADGE_LABEL;
    badgeLabel.textContent = 'OVERALL';
    badgeLabel.style.cssText = `
      position: fixed;
      left: ${badgeCx}px;
      top: ${badgeRect.bottom + 4}px;
      transform: translateX(-50%);
      font-family: ${FONT_FAMILY};
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: ${BRAND_90};
      white-space: nowrap;
      pointer-events: none;
      z-index: ${Z_BADGE};
      opacity: 0;
      transition: opacity 0.25s ease;
    `;
    document.body.appendChild(badgeLabel);
  } else {
    badgeLabel.style.left = `${badgeCx}px`;
    badgeLabel.style.top = `${badgeRect.bottom + 4}px`;
    if (badgeLabelRemoveTimeout !== null) {
      clearTimeout(badgeLabelRemoveTimeout);
      badgeLabelRemoveTimeout = null;
    }
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      badgeLabel!.style.opacity = '1';
    })
  );

  KEYS.forEach((key, i) => {
    const value = currentScore![key] as number;
    const bubble = makeBubble(value, i);

    const stackIndex = KEYS.length - 1 - i;
    const bottomY = badgeTop - BUBBLE_GAP - stackIndex * ROW_H;
    bubble.style.left = `${badgeCx - BUBBLE_SIZE / 2}px`;
    bubble.style.top = `${bottomY - BUBBLE_SIZE - 11}px`;

    document.body.appendChild(bubble);
    setTimeout(() => bubble.classList.add('visible'), i * 40);
  });

  // Invisible bridge
  const bridge = document.createElement('div');
  bridge.id = ID_BRIDGE;
  bridge.style.cssText = `
    position: fixed;
    left: ${badgeCx - BUBBLE_SIZE / 2}px;
    top: ${stackTop}px;
    width: ${BUBBLE_SIZE}px;
    height: ${badgeRect.bottom - stackTop}px;
    z-index: ${Z_BASE - 1};
    pointer-events: auto;
    background: transparent;
  `;
  bridge.addEventListener('mouseleave', (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (rel?.closest(`.${CLASS_BUBBLE}`) || rel?.id === ID_BADGE) return;
    hideBubbles();
  });
  document.body.appendChild(bridge);
}

export function hideBubbles(): void {
  if (!bubblesVisible) return;
  bubblesVisible = false;

  document.getElementById(ID_BRIDGE)?.remove();

  const badgeLabel = document.getElementById(ID_BADGE_LABEL);
  if (badgeLabel) {
    badgeLabel.style.opacity = '0';
    badgeLabelRemoveTimeout = setTimeout(() => {
      badgeLabel.remove();
      badgeLabelRemoveTimeout = null;
    }, 260);
  }

  document.querySelectorAll<HTMLElement>(`.${CLASS_BUBBLE}`).forEach((b) => {
    b.classList.remove('visible');
    setTimeout(() => b.remove(), 260);
  });
}

// ---------------------------------------------------------------------------
// Visibility cleanup
// ---------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    document.getElementById(ID_BRIDGE)?.remove();
    document.getElementById(ID_BADGE_LABEL)?.remove();
    document.querySelectorAll<HTMLElement>(`.${CLASS_BUBBLE}`).forEach((b) => b.remove());
    bubblesVisible = false;
  }
});
