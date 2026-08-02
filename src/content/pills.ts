// ---------------------------------------------------------------------------
// Feedback pills — suggestions that appear above the input bar on hover.
// Also handles the login CTA pill for unauthenticated users.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';
import type { PlatformConfig } from './selectors';
import {
  Z_BADGE,
  CLASS_FEEDBACK,
  ID_FEEDBACK_STYLE,
  ID_FEEDBACK_BRIDGE,
  FONT_FAMILY,
  GLASS_BG,
  GLASS_BLUR,
  BRAND,
  BRAND_45,
  BRAND_35,
  BRAND_30,
  BRAND_18,
  BRAND_12,
  BRAND_04,
  BRAND_10,
  PILL_GREEN,
  PILL_GREEN_GLOW,
  PILL_GREEN_BORDER,
  PILL_RED,
  PILL_RED_GLOW,
  PILL_RED_BORDER,
  SHADOW_CARD,
  SHADOW_BRAND_INSET,
  SHADOW_BRAND_INSET_STRONG,
} from './theme';
import { findInputBar } from './dom-utils';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let feedbackVisible = false;
let pendingSuggestions: string[] = [];
let pendingScores: Pick<LiveScore, 'ownership' | 'depth' | 'critical' | 'clarity'> | null = null;
let pendingInputEl: HTMLElement | null = null;
let pendingPlatform: PlatformConfig | undefined;
let pendingLoginPrompt = false;

// Input bar hover state — shared with badge module via exports
let inputBarHoverEl: HTMLElement | null = null;
let inputBarEnterListener: (() => void) | null = null;
let inputBarLeaveListener: ((e: MouseEvent) => void) | null = null;
let mouseInsideInputBar = false;

export function getInputBarHoverEl(): HTMLElement | null {
  return inputBarHoverEl;
}

// ---------------------------------------------------------------------------
// Style injection
// ---------------------------------------------------------------------------

function injectFeedbackStyles(): void {
  if (document.getElementById(ID_FEEDBACK_STYLE)) return;
  const style = document.createElement('style');
  style.id = ID_FEEDBACK_STYLE;
  style.textContent = `
    @keyframes mentro-fly-up {
      0%   { opacity: 0; transform: translateY(18px) scale(0.92); }
      60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0px) scale(1); }
    }
    @keyframes mentro-fly-down {
      0%   { opacity: 1; transform: translateY(0px) scale(1); }
      100% { opacity: 0; transform: translateY(14px) scale(0.92); }
    }
    .${CLASS_FEEDBACK} {
      animation: mentro-fly-up 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
      max-height: 32px;
      overflow: hidden;
      transition: max-height 0.28s cubic-bezier(0.22, 1, 0.36, 1),
                  box-shadow 0.18s ease,
                  z-index 0s;
      white-space: nowrap;
    }
    .${CLASS_FEEDBACK}:hover {
      max-height: 120px;
      white-space: normal;
      overflow: visible;
      z-index: ${Z_BADGE + 50} !important;
    }
    .${CLASS_FEEDBACK} .mentro-pill-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: inherit;
      display: block;
      line-height: 1.4;
    }
    .${CLASS_FEEDBACK}.hiding {
      animation: mentro-fly-down 0.22s ease-in both;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Pill creation
// ---------------------------------------------------------------------------

function createPillElement(
  text: string,
  index: number,
  isGreen: boolean,
  rect: DOMRect,
  nudgeY = 0
): HTMLElement {
  const color = isGreen ? PILL_GREEN : PILL_RED;
  const glowColor = isGreen ? PILL_GREEN_GLOW : PILL_RED_GLOW;
  const borderColor = isGreen ? PILL_GREEN_BORDER : PILL_RED_BORDER;

  const pill = document.createElement('div');
  pill.className = CLASS_FEEDBACK;
  pill.style.cssText = `
    position: fixed;
    left: ${rect.left + 12}px;
    top: ${rect.top - 44 - index * 40 + nudgeY}px;
    max-width: ${Math.min(rect.width - 24, 520)}px;
    background: ${GLASS_BG};
    border: 1px solid ${borderColor};
    border-top: 1px solid ${BRAND_30};
    border-radius: 20px;
    padding: 7px 14px 7px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: ${FONT_FAMILY};
    font-size: 12px;
    font-weight: 500;
    color: ${color};
    box-shadow: 0 0 20px 3px ${glowColor}, 0 0 8px 1px ${BRAND_10}, ${SHADOW_CARD}, ${SHADOW_BRAND_INSET};
    z-index: ${Z_BADGE + 10 + index};
    pointer-events: auto;
    animation-delay: ${index * 60}ms;
    backdrop-filter: ${GLASS_BLUR};
    -webkit-backdrop-filter: ${GLASS_BLUR};
    cursor: default;
  `;

  const dot = document.createElement('span');
  dot.style.cssText = `
    width: 6px; height: 6px; border-radius: 50%;
    background: ${color}; flex-shrink: 0;
    box-shadow: 0 0 6px 1px ${color}88;
  `;

  const label = document.createElement('span');
  label.className = 'mentro-pill-label';
  label.textContent = text;

  pill.appendChild(dot);
  pill.appendChild(label);

  pill.addEventListener('mouseleave', (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (
      (rel && (inputBarHoverEl?.contains(rel) || rel === inputBarHoverEl)) ||
      rel?.closest(`.${CLASS_FEEDBACK}`) ||
      rel?.id === ID_FEEDBACK_BRIDGE
    )
      return;
    mouseInsideInputBar = false;
    hideFeedback();
  });

  return pill;
}

// ---------------------------------------------------------------------------
// Login CTA pill
// ---------------------------------------------------------------------------

function showLoginPill(rect: DOMRect, nudgeY = 0): void {
  const pill = document.createElement('div');
  pill.className = CLASS_FEEDBACK;
  pill.style.cssText = `
    position: fixed;
    left: ${rect.left + 12}px;
    top: ${rect.top - 44 + nudgeY}px;
    max-width: ${Math.min(rect.width - 24, 520)}px;
    background: linear-gradient(135deg, ${BRAND_12} 0%, ${BRAND_04} 100%);
    border: 1px solid ${BRAND_35};
    border-top: 1px solid ${BRAND_45};
    border-radius: 20px;
    padding: 7px 14px 7px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: ${FONT_FAMILY};
    font-size: 12px;
    font-weight: 500;
    color: ${BRAND};
    box-shadow: 0 0 20px 3px ${BRAND_18}, 0 0 8px 1px ${BRAND_10}, ${SHADOW_CARD}, ${SHADOW_BRAND_INSET_STRONG};
    z-index: ${Z_BADGE + 10};
    pointer-events: auto;
    animation: mentro-fly-up 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
    backdrop-filter: ${GLASS_BLUR};
    -webkit-backdrop-filter: ${GLASS_BLUR};
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
  `;

  const icon = document.createElement('span');
  icon.textContent = '💜';
  icon.style.cssText = 'flex-shrink: 0; font-size: 13px; line-height: 1;';

  const label = document.createElement('span');
  label.className = 'mentro-pill-label';
  label.textContent = 'Sign in to Mentro for personalised improvement tips';

  pill.appendChild(icon);
  pill.appendChild(label);

  pill.addEventListener('mouseleave', (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (
      (rel && (inputBarHoverEl?.contains(rel) || rel === inputBarHoverEl)) ||
      rel?.closest(`.${CLASS_FEEDBACK}`) ||
      rel?.id === ID_FEEDBACK_BRIDGE
    )
      return;
    mouseInsideInputBar = false;
    hideFeedback();
  });

  document.body.appendChild(pill);

  // Bridge
  const topPillTop = rect.top - 44 + nudgeY;
  const bridgeTop = topPillTop - 36;
  const bridgeWidth = Math.min(rect.width - 24, 520) + 24;

  const bridge = document.createElement('div');
  bridge.id = ID_FEEDBACK_BRIDGE;
  bridge.style.cssText = `
    position: fixed;
    left: ${rect.left}px; top: ${bridgeTop}px;
    width: ${bridgeWidth}px; height: ${rect.top - bridgeTop}px;
    z-index: ${Z_BADGE + 5};
    pointer-events: auto; background: transparent;
  `;
  bridge.addEventListener('mouseleave', (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (
      (rel && (inputBarHoverEl?.contains(rel) || rel === inputBarHoverEl)) ||
      rel?.closest(`.${CLASS_FEEDBACK}`)
    )
      return;
    mouseInsideInputBar = false;
    hideFeedback();
  });
  document.body.appendChild(bridge);
  feedbackVisible = true;
}

// ---------------------------------------------------------------------------
// Show pending pills (triggered on input bar hover)
// ---------------------------------------------------------------------------

function showPendingPills(): void {
  if (pendingLoginPrompt && pendingInputEl) {
    injectFeedbackStyles();
    document.querySelectorAll<HTMLElement>(`.${CLASS_FEEDBACK}`).forEach((p) => p.remove());
    document.getElementById(ID_FEEDBACK_BRIDGE)?.remove();
    const inputBar = inputBarHoverEl ?? findInputBar(pendingInputEl, pendingPlatform);
    const rect = inputBar.getBoundingClientRect();
    showLoginPill(rect, pendingPlatform?.pillNudgeY ?? 0);
    return;
  }

  if (!pendingScores || pendingSuggestions.length === 0 || !pendingInputEl) return;

  injectFeedbackStyles();
  document.querySelectorAll<HTMLElement>(`.${CLASS_FEEDBACK}`).forEach((p) => p.remove());
  document.getElementById(ID_FEEDBACK_BRIDGE)?.remove();
  feedbackVisible = true;

  const inputBar = inputBarHoverEl ?? findInputBar(pendingInputEl, pendingPlatform);
  const rect = inputBar.getBoundingClientRect();
  const pillNudgeY = pendingPlatform?.pillNudgeY ?? 0;

  const dimOrder: (keyof typeof pendingScores)[] = ['ownership', 'depth', 'critical', 'clarity'];
  const lowDims = dimOrder.filter((k) => pendingScores![k] < 60);

  pendingSuggestions.slice(0, 3).forEach((text, i) => {
    const isGreen = lowDims.length === 0 || lowDims[i] === undefined;
    const pill = createPillElement(text, i, isGreen, rect, pillNudgeY);
    document.body.appendChild(pill);
  });

  // Bridge
  const pillCount = pendingSuggestions.slice(0, 3).length;
  const topPillTop = rect.top - 44 - (pillCount - 1) * 40 + pillNudgeY;
  const bridgeTop = topPillTop - 36;
  const bridgeWidth = Math.min(rect.width - 24, 520) + 24;

  const bridge = document.createElement('div');
  bridge.id = ID_FEEDBACK_BRIDGE;
  bridge.style.cssText = `
    position: fixed;
    left: ${rect.left}px; top: ${bridgeTop}px;
    width: ${bridgeWidth}px; height: ${rect.top - bridgeTop}px;
    z-index: ${Z_BADGE + 5};
    pointer-events: auto; background: transparent;
  `;
  bridge.addEventListener('mouseleave', (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (
      (rel && (inputBarHoverEl?.contains(rel) || rel === inputBarHoverEl)) ||
      rel?.closest(`.${CLASS_FEEDBACK}`)
    )
      return;
    mouseInsideInputBar = false;
    hideFeedback();
  });
  document.body.appendChild(bridge);
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export function attachInputBarHover(inputEl: HTMLElement, platform?: PlatformConfig): void {
  if (inputBarHoverEl && inputBarEnterListener && inputBarLeaveListener) {
    inputBarHoverEl.removeEventListener('mouseenter', inputBarEnterListener);
    inputBarHoverEl.removeEventListener('mouseleave', inputBarLeaveListener);
  }

  const inputBar = findInputBar(inputEl, platform);
  inputBarHoverEl = inputBar;

  inputBarEnterListener = () => {
    mouseInsideInputBar = true;
    showPendingPills();
  };
  inputBarLeaveListener = (e: MouseEvent) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (rel?.closest(`.${CLASS_FEEDBACK}`) || rel?.id === ID_FEEDBACK_BRIDGE) return;
    mouseInsideInputBar = false;
    hideFeedback();
  };

  inputBar.addEventListener('mouseenter', inputBarEnterListener);
  inputBar.addEventListener('mouseleave', inputBarLeaveListener);

  if (inputBar.matches(':hover')) {
    mouseInsideInputBar = true;
  }
}

export function renderFeedback(
  suggestions: string[],
  scores: Pick<LiveScore, 'ownership' | 'depth' | 'critical' | 'clarity'>,
  inputEl: HTMLElement,
  platform?: PlatformConfig
): void {
  pendingSuggestions = suggestions;
  pendingScores = scores;
  pendingInputEl = inputEl;
  pendingPlatform = platform;
  pendingLoginPrompt = false;
  if (feedbackVisible) {
    document.querySelectorAll<HTMLElement>(`.${CLASS_FEEDBACK}`).forEach((p) => p.remove());
    feedbackVisible = false;
  }
  if (mouseInsideInputBar) {
    showPendingPills();
  }
}

export function renderLoginPrompt(inputEl: HTMLElement, platform?: PlatformConfig): void {
  pendingLoginPrompt = true;
  pendingSuggestions = [];
  pendingScores = null;
  pendingInputEl = inputEl;
  pendingPlatform = platform;
  if (feedbackVisible) {
    document.querySelectorAll<HTMLElement>(`.${CLASS_FEEDBACK}`).forEach((p) => p.remove());
    document.getElementById(ID_FEEDBACK_BRIDGE)?.remove();
    feedbackVisible = false;
  }
  if (mouseInsideInputBar) {
    showPendingPills();
  }
}

export function hideFeedback(instant = false): void {
  if (!feedbackVisible && !instant) return;
  feedbackVisible = false;

  document.getElementById(ID_FEEDBACK_BRIDGE)?.remove();

  if (instant) {
    pendingSuggestions = [];
    pendingScores = null;
    pendingInputEl = null;
    pendingLoginPrompt = false;
  }

  const pills = document.querySelectorAll<HTMLElement>(`.${CLASS_FEEDBACK}`);
  if (pills.length === 0) return;

  if (instant) {
    pills.forEach((p) => p.remove());
    return;
  }

  pills.forEach((p) => {
    p.classList.add('hiding');
    setTimeout(() => p.remove(), 240);
  });
}
