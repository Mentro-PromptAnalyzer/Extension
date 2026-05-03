// ---------------------------------------------------------------------------
// Overlay UI — a small floating panel that shows live analysis results
// Injected into the page by the content script.
// ---------------------------------------------------------------------------

import type { LiveScore } from '../analysis/engine';

const OVERLAY_ID = 'askbetter-overlay';

function getScoreColor(score: number): string {
  if (score >= 70) return '#4ade80'; // green
  if (score >= 40) return '#fbbf24'; // yellow
  return '#f87171'; // red
}

/**
 * Create or update the floating overlay with current analysis results.
 */
export function renderOverlay(score: LiveScore): void {
  let overlay = document.getElementById(OVERLAY_ID);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 260px;
      background: #1a1030;
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 12px;
      padding: 14px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #f5f3ff;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: opacity 0.2s;
    `;
    document.body.appendChild(overlay);
  }

  const scoreColor = getScoreColor(score.overall);

  overlay.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #a78bfa;">
        Ask<span style="color: #7c3aed;">Better</span>
      </span>
      <span style="font-size: 20px; font-weight: 800; color: ${scoreColor};">
        ${score.overall}
      </span>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;">
      ${renderMiniScore('Autonomy', score.autonomy)}
      ${renderMiniScore('Curiosity', score.curiosity)}
      ${renderMiniScore('Critical', score.criticalThinking)}
      ${renderMiniScore('Specificity', score.specificity)}
    </div>

    <div style="font-size: 10px; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
      Intent: ${score.intent}
    </div>

    ${
      score.suggestions.length > 0
        ? `<div style="border-top: 1px solid rgba(139, 92, 246, 0.15); padding-top: 8px; margin-top: 4px;">
            ${score.suggestions
              .map(
                (s) =>
                  `<div style="font-size: 11px; color: #c4b5fd; margin-bottom: 4px; line-height: 1.4;">💡 ${s}</div>`
              )
              .join('')}
          </div>`
        : ''
    }
  `;
}

function renderMiniScore(label: string, value: number): string {
  const color = getScoreColor(value);
  return `
    <div style="background: rgba(139, 92, 246, 0.08); border-radius: 6px; padding: 6px 8px;">
      <div style="font-size: 9px; color: #6b5fa0; text-transform: uppercase; letter-spacing: 0.05em;">${label}</div>
      <div style="font-size: 14px; font-weight: 700; color: ${color};">${value}</div>
    </div>
  `;
}

/**
 * Hide the overlay (e.g., when the input is empty).
 */
export function hideOverlay(): void {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  }
}
