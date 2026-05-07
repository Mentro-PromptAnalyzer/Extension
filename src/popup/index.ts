// ---------------------------------------------------------------------------
// Popup script — runs when the user clicks the extension icon.
// Shows the latest analysis score from the active tab.
// ---------------------------------------------------------------------------

const contentEl = document.getElementById('content');
const statusEl = document.getElementById('status');

function renderScore(score: any): void {
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div style="text-align: center; margin-bottom: 12px;">
      <div style="font-size: 36px; font-weight: 800; color: ${score.overall >= 70 ? '#4ade80' : score.overall >= 40 ? '#fbbf24' : '#f87171'};">
        ${score.overall}
      </div>
      <div style="font-size: 11px; color: #6b5fa0; text-transform: uppercase; letter-spacing: 0.05em;">
        Overall Score
      </div>
    </div>

    <div class="score-row">
      <span class="score-label">Ownership</span>
      <span class="score-value">${score.ownership}</span>
    </div>
    <div class="score-row">
      <span class="score-label">Depth</span>
      <span class="score-value">${score.depth}</span>
    </div>
    <div class="score-row">
      <span class="score-label">Critical</span>
      <span class="score-value">${score.critical}</span>
    </div>
    <div class="score-row">
      <span class="score-label">Clarity</span>
      <span class="score-value">${score.clarity}</span>
    </div>

    <div style="margin-top: 12px; padding: 8px; background: rgba(139, 92, 246, 0.08); border-radius: 8px;">
      <div style="font-size: 10px; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
        Intent: ${score.intent}
      </div>
      ${score.suggestions
        .map(
          (s: string) =>
            `<div style="font-size: 11px; color: #c4b5fd; margin-top: 4px; line-height: 1.4;">💡 ${s}</div>`
        )
        .join('')}
    </div>
  `;
}

// Request the latest score from the background script
chrome.runtime.sendMessage({ type: 'GET_LATEST_SCORE' }, (response) => {
  if (response?.score) {
    renderScore(response.score);
  } else if (statusEl) {
    statusEl.textContent = 'Start typing in ChatGPT, Gemini, or Perplexity to see your score.';
  }
});
