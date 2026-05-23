import React, { useState, useEffect } from 'react';
import { TipsTab } from './TipsTab';
import { SettingsTab } from './SettingsTab';
import { AccountTab } from './AccountTab';
import { AuthSession, loadSession } from '../auth';
import { Settings, loadSettings, DEFAULT_SETTINGS } from '../settings';

type Tab = 'tips' | 'settings' | 'account';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tips', label: 'Tips' },
  { id: 'settings', label: 'Settings' },
  { id: 'account', label: 'Account' },
];

function usePlatformLabel(): string {
  const [label, setLabel] = useState('—');
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? '';
      if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) setLabel('ChatGPT');
      else if (url.includes('gemini.google.com')) setLabel('Gemini');
      else if (url.includes('perplexity.ai')) setLabel('Perplexity');
      else setLabel('Inactive');
    });
  }, []);
  return label;
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tips');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const platform = usePlatformLabel();

  useEffect(() => {
    Promise.all([loadSession(), loadSettings()]).then(([s, st]) => {
      setSession(s);
      setSettings(st);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <>
      <div className="header">
        <h1>
          Ask<span>Better</span>
        </h1>
        <span
          className="platform-pill"
          style={
            platform === 'Inactive'
              ? { color: '#6b5fa0', borderColor: 'rgba(107, 95, 160, 0.3)' }
              : undefined
          }
        >
          {platform}
        </span>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`tab-panel${activeTab === 'tips' ? ' active' : ''}`}>
        <TipsTab />
      </div>
      <div className={`tab-panel${activeTab === 'settings' ? ' active' : ''}`}>
        <SettingsTab settings={settings} onSettingsChange={setSettings} />
      </div>
      <div className={`tab-panel${activeTab === 'account' ? ' active' : ''}`}>
        <AccountTab session={session} onSessionChange={setSession} />
      </div>
    </>
  );
}
