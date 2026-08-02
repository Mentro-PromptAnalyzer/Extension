// ---------------------------------------------------------------------------
// Shared DOM helpers for the content-script overlay modules.
// ---------------------------------------------------------------------------

import type { PlatformConfig } from './selectors';
import {
  BADGE_SIZE,
  INNER_R,
  RING_R,
  RING_STROKE,
  ID_GLASS_DEFS,
  GLASS_GRAD_ID,
  Z_BADGE,
} from './theme';

// ---------------------------------------------------------------------------
// SVG helper
// ---------------------------------------------------------------------------

/**
 * Create an SVG element in the SVG namespace and set multiple attributes.
 */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ---------------------------------------------------------------------------
// Glass gradient injection
// ---------------------------------------------------------------------------

/**
 * Inject the shared glass gradient <defs> SVG into the document body once.
 */
export function injectGlassDefs(): void {
  if (document.getElementById(ID_GLASS_DEFS)) return;
  const defsSvg = svgEl('svg', { id: ID_GLASS_DEFS, width: '0', height: '0' });
  defsSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';

  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', {
    id: GLASS_GRAD_ID,
    x1: '0%',
    y1: '0%',
    x2: '60%',
    y2: '100%',
  });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': 'rgba(255,255,255,0.18)' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': 'rgba(255,255,255,0.02)' }));
  defs.appendChild(grad);
  defsSvg.appendChild(defs);
  document.body.appendChild(defsSvg);
}

// ---------------------------------------------------------------------------
// Arc dash-array helper
// ---------------------------------------------------------------------------

/** Clamp a 0–100 value and return the filled/gap stroke-dasharray string. */
export function arcDashArray(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * RING_R;
  const filled = circumference * (clamped / 100);
  const gap = circumference - filled;
  return `${filled} ${gap}`;
}

// ---------------------------------------------------------------------------
// Circle SVG builder — used by both the badge and the metric bubbles
// ---------------------------------------------------------------------------

export function buildCircleSvg(
  value: number,
  color: string,
  idPrefix?: string
): {
  svg: SVGSVGElement;
  glassBg: SVGCircleElement;
  arc: SVGCircleElement;
  scoreText: SVGTextElement;
} {
  const clamped = Math.max(0, Math.min(100, value));
  const dashArray = arcDashArray(clamped);
  const cx = String(BADGE_SIZE / 2);
  const cy = String(BADGE_SIZE / 2);

  const svg = svgEl('svg', {
    width: String(BADGE_SIZE),
    height: String(BADGE_SIZE),
    viewBox: `0 0 ${BADGE_SIZE} ${BADGE_SIZE}`,
  }) as SVGSVGElement;

  // Glass background circle
  const glassBg = svgEl('circle', {
    cx,
    cy,
    r: String(INNER_R + 3),
    fill: `${color}18`,
    stroke: `${color}38`,
    'stroke-width': '1',
    ...(idPrefix ? { id: `${idPrefix}-glassbg` } : {}),
  }) as SVGCircleElement;
  svg.appendChild(glassBg);

  // Purple inner ring accent
  svg.appendChild(
    svgEl('circle', {
      cx,
      cy,
      r: String(INNER_R + 3),
      fill: 'none',
      stroke: 'rgba(167,139,250,0.18)',
      'stroke-width': '1.5',
    })
  );

  // Glass highlight
  svg.appendChild(
    svgEl('circle', {
      cx,
      cy,
      r: String(INNER_R + 3),
      fill: `url(#${GLASS_GRAD_ID})`,
    })
  );

  // Arc track
  svg.appendChild(
    svgEl('circle', {
      cx,
      cy,
      r: String(RING_R),
      fill: 'none',
      stroke: 'rgba(167,139,250,0.20)',
      'stroke-width': String(RING_STROKE),
    })
  );

  // Progress arc
  const arc = svgEl('circle', {
    cx,
    cy,
    r: String(RING_R),
    fill: 'none',
    stroke: color,
    'stroke-width': String(RING_STROKE),
    'stroke-linecap': 'round',
    'stroke-dasharray': dashArray,
    transform: `rotate(-90 ${cx} ${cy})`,
    ...(idPrefix ? { id: `${idPrefix}-arc` } : {}),
  }) as SVGCircleElement;
  arc.style.transition = 'stroke-dasharray 0.4s ease, stroke 0.2s ease';
  svg.appendChild(arc);

  // Score number
  const scoreText = svgEl('text', {
    x: cx,
    y: cy,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    fill: color,
    'font-size': '11',
    'font-weight': '800',
    'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    ...(idPrefix ? { id: `${idPrefix}-text` } : {}),
  }) as SVGTextElement;
  scoreText.textContent = String(clamped);
  svg.appendChild(scoreText);

  return { svg, glassBg, arc, scoreText };
}

// ---------------------------------------------------------------------------
// Input bar detection
// ---------------------------------------------------------------------------

export function findInputBar(inputEl: HTMLElement, platform?: PlatformConfig): HTMLElement {
  if (platform?.inputBarSelector) {
    try {
      const explicit = document.querySelector<HTMLElement>(platform.inputBarSelector);
      if (explicit) return explicit;
    } catch {
      /* invalid selector */
    }
  }

  if (platform?.sendButtonSelector) {
    try {
      const sendBtn = document.querySelector<HTMLElement>(platform.sendButtonSelector);
      if (sendBtn) {
        let el: HTMLElement = inputEl;
        while (el.parentElement && el.parentElement !== document.body) {
          const parent = el.parentElement;
          if (parent.contains(sendBtn)) return parent;
          if (parent.getBoundingClientRect().width >= window.innerWidth) break;
          el = parent;
        }
      }
    } catch {
      /* malformed selector — fall through */
    }
  }

  const composerSurface = document.querySelector<HTMLElement>('[data-composer-surface="true"]');
  if (composerSurface) return composerSurface;

  let el: HTMLElement = inputEl;
  while (el.parentElement && el.parentElement !== document.body) {
    if (el.parentElement.children.length > 1) return el;
    el = el.parentElement;
  }
  return el;
}

// ---------------------------------------------------------------------------
// Plus button finder
// ---------------------------------------------------------------------------

export function findPlusButton(plusButtonSelector: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(plusButtonSelector);
  } catch {
    const parts = plusButtonSelector.split(/(?<=\])\s*,\s*(?=button\[)/);
    for (const part of parts) {
      try {
        const el = document.querySelector<HTMLElement>(part.trim());
        if (el) return el;
      } catch {
        /* skip */
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Badge positioning
// ---------------------------------------------------------------------------

export function positionBadge(
  badge: HTMLElement,
  inputBar: HTMLElement,
  platform?: PlatformConfig
): void {
  const size = BADGE_SIZE;
  const gap = platform?.badgeGap ?? 10;
  const nudgeY = platform?.badgeNudgeY ?? 0;

  if (platform?.plusButtonSelector) {
    const btn = findPlusButton(platform.plusButtonSelector);
    if (btn) {
      const btnRect = btn.getBoundingClientRect();
      badge.style.top = `${btnRect.top + btnRect.height / 2 - size / 2 + nudgeY}px`;
      badge.style.left = `${btnRect.left - size - gap}px`;
      return;
    }
  }

  const rect = inputBar.getBoundingClientRect();
  badge.style.top = `${rect.bottom - size + nudgeY}px`;
  badge.style.left = `${rect.left - size - 14}px`;
}

// ---------------------------------------------------------------------------
// Plus button polling — cancelable interval
// ---------------------------------------------------------------------------

let plusButtonInterval: ReturnType<typeof setInterval> | null = null;

/** Cancel any active plus-button polling interval. */
export function cancelPlusButtonPoll(): void {
  if (plusButtonInterval !== null) {
    clearInterval(plusButtonInterval);
    plusButtonInterval = null;
  }
}

/**
 * Polls up to ~3 s for the + button then repositions the badge.
 */
export function waitForPlusButtonAndReposition(
  badge: HTMLElement,
  inputBar: HTMLElement,
  platform: PlatformConfig
): void {
  cancelPlusButtonPoll();
  let attempts = 0;
  plusButtonInterval = setInterval(() => {
    attempts++;
    const btn = findPlusButton(platform.plusButtonSelector!);
    if (btn) {
      cancelPlusButtonPoll();
      positionBadge(badge, inputBar, platform);
      return;
    }
    if (attempts >= 30) cancelPlusButtonPoll();
  }, 100);
}
