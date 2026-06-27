import React, { useState } from 'react';
import { Settings, DEFAULT_SETTINGS, saveSettings } from '../settings';
import { AuthSession, deleteAllPrompts, getValidSession } from '../auth';

interface Props {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  session: AuthSession | null;
  onDeleteDone: () => void;
}

export function SettingsTab({ settings, onSettingsChange, session, onDeleteDone }: Props) {
  const [toastVisible, setToastVisible] = useState(false);
  const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm' | 'deleting' | 'done'>('idle');
  const [deleteError, setDeleteError] = useState('');

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
