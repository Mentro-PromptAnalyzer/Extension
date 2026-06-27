import React, { useState, useEffect } from 'react';
import { TipsTab } from './TipsTab';
import { SettingsTab } from './SettingsTab';
import { AccountTab } from './AccountTab';
import { AuthSession, getValidSession } from '../auth';
import { Settings, loadSettings, DEFAULT_SETTINGS } from '../settings';

type Tab = 'tips' | 'settings' | 'account';
type Platform = 'chatgpt' | 'gemini' | 'perplexity' | 'claude' | 'inactive';

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'tips', label: 'Tips' },
  { id: 'settings', label: 'Settings' },
];

function ChatGPTLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-label="ChatGPT">
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855l-5.843-3.369 2.02-1.168a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.676zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.08.08 0 0 1 .032-.062l4.84-2.796a4.5 4.5 0 0 1 6.675 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function GeminiLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none" aria-label="Gemini">
      <path
        d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PerplexityLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-label="Perplexity">
      <path
        d="M11.9999 0L8.46143 3.53853H11.2499V8.08088L4.58008 2.04785V8.46143H2.53857V2.04785L0 4.58643V19.4136L2.53857 21.9521V15.5386H4.58008V21.9521L11.2499 15.9192V20.4615H8.46143L11.9999 24L15.5385 20.4615H12.75V15.9192L19.4199 21.9521V15.5386H21.4614V21.9521L24 19.4136V4.58643L21.4614 2.04785V8.46143H19.4199V2.04785L12.75 8.08088V3.53853H15.5385L11.9999 0ZM4.58008 9.75H19.4199V14.25H4.58008V9.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ClaudeLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-label="Claude">
      <path
        d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-1.264-.072L1 12.28l.528-1.73 1.36.097 2.28.121 2.485.17 1.2.048-.048-.217-1.37-2.47-1.612-2.977-.978-1.924L5.736 2l1.03.595.978 1.924 1.588 2.95.787 1.418.199-.048L11.2 2.45 12.72 1l1.48.923-.498.747-1.37 2.687-1.455 2.784-.748 1.418.199.048 1.588-1.418 2.485-2.17 2.28-1.924 1.36.923-.978 1.924-.978.923-2.485 2.17-1.37 1.23.097.217 1.2-.048 2.485-.17 2.28-.121 1.36-.097.528 1.73-.528.38-1.264.072-2.339.097-2.698.073-.79.048h-.23l-.08.128.08.23 4.72 2.647L22 18.47l-.528 1.924-1.03-.595-4.72-2.647-.978-.595-.079.217.079.23v.812l.097 2.47.073 1.924.048 1.23-1.73.528-.38-1.03-.097-2.47-.073-2.47-.048-1.23-.217-.048-.217.048-.048 1.23-.073 2.47-.097 2.47-.38 1.03-1.73-.528.048-1.23.073-1.924.097-2.47v-.812l.079-.23-.079-.217-.978.595-4.72 2.647-1.03.595L2 18.47l1.709-.595z"
        fill="currentColor"
      />
    </svg>
  );
}

function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>('inactive');
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? '';
      if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) setPlatform('chatgpt');
      else if (url.includes('gemini.google.com')) setPlatform('gemini');
      else if (url.includes('perplexity.ai')) setPlatform('perplexity');
      else if (url.includes('claude.ai')) setPlatform('claude');
      else setPlatform('inactive');
    });
  }, []);
  return platform;
}

function PlatformBadge({ platform }: { platform: Platform }) {
  if (platform === 'inactive') return null;
  return (
    <span className="platform-pill">
      {platform === 'chatgpt' && <ChatGPTLogo />}
      {platform === 'gemini' && <GeminiLogo />}
      {platform === 'perplexity' && <PerplexityLogo />}
      {platform === 'claude' && <ClaudeLogo />}
    </span>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [statsReloadKey, setStatsReloadKey] = useState(0);
  const platform = usePlatform();

  const isSignedIn = session !== null;

  // When the user signs out, snap back to the account tab so they
  // don't end up on Settings/Tips with a stale signed-in-only view.
  useEffect(() => {
    if (!isSignedIn) setActiveTab('account');
  }, [isSignedIn]);

  useEffect(() => {
    // Resolve with defaults after 3 s so the UI never stays blank indefinitely
    // (e.g. in E2E environments where Chrome storage resolves slowly).
    const timeout = setTimeout(() => setReady(true), 3000);

    Promise.all([getValidSession(), loadSettings()])
      .then(([s, st]) => {
        clearTimeout(timeout);
        setSession(s);
        setSettings(st);
        setReady(true);
      })
      .catch((err: unknown) => {
        console.error('[popup] init failed:', err instanceof Error ? err.message : err);
        clearTimeout(timeout);
        setReady(true);
      });

    return () => clearTimeout(timeout);
  }, []);

  return (
    <>
      <div className="header">
        <h1>Mentro</h1>
        <PlatformBadge platform={platform} />
      </div>

      <div className="tabs">
        {TABS.map((tab) => {
          // Hide Tips and Settings tabs when signed out
          if (!isSignedIn && tab.id !== 'account') return null;
          return (
            <button
              key={tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {ready ? (
        <>
          <div className={`tab-panel${activeTab === 'account' ? ' active' : ''}`}>
            <AccountTab
              session={session}
              onSessionChange={setSession}
              statsEnabled={settings.statsEnabled}
              isActive={activeTab === 'account'}
              reloadKey={statsReloadKey}
            />
          </div>
          <div className={`tab-panel${activeTab === 'tips' ? ' active' : ''}`}>
            <TipsTab />
          </div>
          <div className={`tab-panel${activeTab === 'settings' ? ' active' : ''}`}>
            <SettingsTab
              settings={settings}
              onSettingsChange={setSettings}
              session={session}
              onDeleteDone={() => setStatsReloadKey((k) => k + 1)}
            />
          </div>
        </>
      ) : (
        <div className="tab-panel active" />
      )}
    </>
  );
}
