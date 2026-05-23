import React, { useState } from 'react';
import { Settings, DEFAULT_SETTINGS, saveSettings } from '../settings';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
}

export function SettingsTab({ settings, onSettingsChange }: Props) {
  const [toastVisible, setToastVisible] = useState(false);

  function persist(next: Settings) {
    onSettingsChange(next);
    saveSettings(next);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1800);
  }

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

      <div className="settings-gap" />
      <div className="settings-gap" />

      <button className="reset-btn" onClick={() => persist(DEFAULT_SETTINGS)}>
        Reset to defaults
      </button>
      <div className={`saved-toast${toastVisible ? ' show' : ''}`}>Saved ✓</div>
    </div>
  );
}
