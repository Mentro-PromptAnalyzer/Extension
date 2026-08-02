import React, { useState } from 'react';
import { Settings, DEFAULT_SETTINGS, saveSettings } from '../settings';
import { AuthSession, deleteAllPrompts, getValidSession } from '../auth';
import { THEMES } from '../themes';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  session: AuthSession | null;
  onDeleteDone: () => void;
}

// ---------------------------------------------------------------------------
// Metric tips data (formerly in TipsTab)
// ---------------------------------------------------------------------------

interface MetricTip {
  color: string;
  borderColor: string;
  shadowColor: string;
  svgFill: string;
  title: string;
  body: string;
}

const METRIC_TIPS: MetricTip[] = [
  {
    color: 'rgba(74, 222, 128, 0.15)',
    borderColor: 'rgba(74, 222, 128, 0.35)',
    shadowColor: 'rgba(74, 222, 128, 0.15)',
    svgFill: '#4ade80',
    title: 'Ownership',
    body: "Show what you've tried or your constraints.",
  },
  {
    color: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    shadowColor: 'rgba(251, 191, 36, 0.15)',
    svgFill: '#fbbf24',
    title: 'Depth',
    body: 'Ask why or how, not just what.',
  },
  {
    color: 'rgba(248, 113, 113, 0.15)',
    borderColor: 'rgba(248, 113, 113, 0.35)',
    shadowColor: 'rgba(248, 113, 113, 0.15)',
    svgFill: '#f87171',
    title: 'Critical',
    body: 'Probe edge cases, risks, or alternatives.',
  },
  {
    color: 'rgba(96, 165, 250, 0.15)',
    borderColor: 'rgba(96, 165, 250, 0.35)',
    shadowColor: 'rgba(96, 165, 250, 0.15)',
    svgFill: '#60a5fa',
    title: 'Clarity',
    body: 'Name your tools, audience, format, and goal.',
  },
];

export function SettingsTab({ settings, onSettingsChange, session, onDeleteDone }: Props) {
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm' | 'deleting' | 'done'>('idle');
  const [deleteError, setDeleteError] = useState('');
  const [tipsExpanded, setTipsExpanded] = useState(false);

  function persist(next: Settings) {
    onSettingsChange(next);
    saveSettings(next);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1800);
  }

  async function handleDelete() {
    if (deleteStage === 'idle') {
      setDeleteStage('confirm');
      setDeleteError('');
      return;
    }

    if (deleteStage === 'confirm') {
      setDeleteStage('deleting');
      setDeleteError('');
      const validSession = await getValidSession();
      if (!validSession) {
        setDeleteError('Not signed in.');
        setDeleteStage('confirm');
        return;
      }
      const result = await deleteAllPrompts(validSession.access_token);
      if (result.ok) {
        onDeleteDone();
        setDeleteStage('done');
        setTimeout(() => setDeleteStage('idle'), 2500);
      } else {
        setDeleteError(result.error);
        setDeleteStage('confirm');
      }
    }
  }

  const deleteLabel =
    deleteStage === 'idle'
      ? 'Delete my data'
      : deleteStage === 'confirm'
        ? 'Tap again to confirm'
        : deleteStage === 'deleting'
          ? 'Deleting…'
          : 'Deleted ✓';

  return (
    <div className="settings-list">
      <div className="setting-card">
        <div className="setting-info">
          <div className="setting-label">Feedback pills</div>
          <div className="setting-desc">Show suggestion pills on input bar hover.</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.pillsEnabled}
            onChange={(e) => persist({ ...settings, pillsEnabled: e.target.checked })}
          />
          <div className="toggle-track" />
        </label>
      </div>

      <div className="settings-gap" />

      <div className="setting-card">
        <div className="setting-info">
          <div className="setting-label">Score badge</div>
          <div className="setting-desc">Show the floating score circle next to the input.</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.badgeEnabled}
            onChange={(e) => persist({ ...settings, badgeEnabled: e.target.checked })}
          />
          <div className="toggle-track" />
        </label>
      </div>

      <div
        className={`setting-card sub-setting${!settings.badgeEnabled ? ' disabled' : ''}${tipsExpanded && settings.badgeEnabled ? ' expanded' : ''}`}
      >
        <div className="sub-setting-top">
          <div className="setting-info">
            <div className="setting-label">Detailed metrics</div>
            <div className="setting-desc">Show the 4 scoring dimensions on badge hover.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className={`metrics-info-btn${tipsExpanded ? ' active' : ''}`}
              onClick={() => setTipsExpanded(!tipsExpanded)}
              disabled={!settings.badgeEnabled}
              aria-label={tipsExpanded ? 'Hide metric tips' : 'Learn about metrics'}
              aria-expanded={tipsExpanded}
            >
              {tipsExpanded ? '×' : '?'}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.detailedMetricsEnabled}
                disabled={!settings.badgeEnabled}
                onChange={(e) => persist({ ...settings, detailedMetricsEnabled: e.target.checked })}
              />
              <div className="toggle-track" />
            </label>
          </div>
        </div>
        {tipsExpanded && settings.badgeEnabled && (
          <div className="metrics-tips-inline">
            {METRIC_TIPS.map((tip) => (
              <div key={tip.title} className="metric-tip-row">
                <div
                  className="tip-dot"
                  style={{
                    background: tip.color,
                    border: `1px solid ${tip.borderColor}`,
                    boxShadow: `0 0 6px 1px ${tip.shadowColor}`,
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10">
                    <circle cx="5" cy="5" r="3" fill={tip.svgFill} />
                  </svg>
                </div>
                <span className="metric-tip-title">{tip.title}</span>
                <span className="metric-tip-body">{tip.body}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-gap" />

      {session && (
        <div className="setting-card">
          <div className="setting-info">
            <div className="setting-label">Stat collection</div>
            <div className="setting-desc">Record prompts to your Account tab stats.</div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.statsEnabled}
              onChange={(e) => persist({ ...settings, statsEnabled: e.target.checked })}
            />
            <div className="toggle-track" />
          </label>
        </div>
      )}

      <div className="settings-gap" />
      <div className="settings-gap" />

      <div className="theme-section">
        <div className="setting-label" style={{ marginBottom: '8px' }}>
          Theme
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-swatch${settings.theme === theme.id ? ' active' : ''}`}
              onClick={() => persist({ ...settings, theme: theme.id })}
              aria-label={`${theme.label} theme`}
              title={theme.label}
            >
              <span className="theme-swatch-color" style={{ background: theme.bgPrimary }}>
                <span
                  className="theme-swatch-accent"
                  style={{ background: `rgb(${theme.brandRgb})` }}
                />
              </span>
              <span className="theme-swatch-label">{theme.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-gap" />
      <div className="settings-gap" />

      <button className="reset-btn" onClick={() => persist(DEFAULT_SETTINGS)}>
        Reset to defaults
      </button>

      {session && (
        <>
          <div className="settings-gap" />
          <button
            className={`delete-data-btn${deleteStage === 'confirm' ? ' confirm' : ''}${deleteStage === 'done' ? ' done' : ''}`}
            onClick={handleDelete}
            disabled={deleteStage === 'deleting' || deleteStage === 'done' || !session}
          >
            {deleteLabel}
          </button>
          {deleteStage === 'confirm' && (
            <div className="delete-data-hint">
              This will permanently delete all your prompt stats.
            </div>
          )}
          {deleteError && <div className="delete-data-error">{deleteError}</div>}
        </>
      )}

      <div className={`saved-toast${toastVisible ? ' show' : ''}`}>Saved ✓</div>
    </div>
  );
}
