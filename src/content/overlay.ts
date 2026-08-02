// ---------------------------------------------------------------------------
// Overlay facade — re-exports the public API from the focused sub-modules.
// Consumers (content/index.ts) continue to import from './overlay' unchanged.
// ---------------------------------------------------------------------------

export {
  renderOverlay,
  hideOverlay,
  setBadgeLoading,
  setDetailedMetricsEnabled,
  refreshBadgeTheme,
} from './badge';
export { renderFeedback, renderLoginPrompt, hideFeedback, attachInputBarHover } from './pills';
