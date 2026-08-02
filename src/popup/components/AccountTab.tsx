import React, { useState, useRef, useEffect } from 'react';
import {
  AuthSession,
  saveSession,
  signInWithPassword,
  signInWithOAuth,
  signOut,
  fetchLifetimeStats,
  getValidSession,
  LifetimeStats,
} from '../auth';

interface Props {
  session: AuthSession | null;
  onSessionChange: (s: AuthSession | null) => void;
  statsEnabled: boolean;
  isActive: boolean;
  reloadKey: number;
}

// ---------------------------------------------------------------------------
// Auth icons
// ---------------------------------------------------------------------------

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function platformLabel(p: string): string {
  if (p === 'chatgpt' || p === 'chatgpt.com' || p === 'chat.openai.com') return 'ChatGPT';
  if (p === 'gemini' || p === 'gemini.google.com') return 'Gemini';
  if (p === 'perplexity' || p === 'perplexity.ai') return 'Perplexity';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function scoreColor(score: number): string {
  if (score >= 70) return '#4ade80';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}

// ---------------------------------------------------------------------------
// Detail panels
// ---------------------------------------------------------------------------

type DetailKey = 'prompts' | 'score' | 'intents' | 'platform';

const INTENT_TIEBREAK: Array<'delegation' | 'curiosity' | 'collaborative' | 'verification'> = [
  'delegation',
  'curiosity',
  'collaborative',
  'verification',
];

export function computeTopIntent(
  counts: LifetimeStats['intentCounts']
): (typeof INTENT_TIEBREAK)[number] {
  let best: (typeof INTENT_TIEBREAK)[number] = 'delegation';
  let bestCount = -1;
  for (const intent of INTENT_TIEBREAK) {
    if (counts[intent] > bestCount) {
      bestCount = counts[intent];
      best = intent;
    }
  }
  return best;
}

function PromptsDetail({ stats }: { stats: LifetimeStats }) {
  const { wordCountBuckets: b } = stats;

  if (b.total === 0) {
    return <div className="detail-empty">No prompt data yet.</div>;
  }

  const bands: { label: string; sublabel: string; count: number; color: string }[] = [
    { label: 'Short', sublabel: '1–15 words', count: b.short, color: '#f87171' },
    { label: 'Medium', sublabel: '16–50 words', count: b.medium, color: '#fbbf24' },
    { label: 'Long', sublabel: '51+ words', count: b.long, color: '#4ade80' },
  ];

  return (
    <div className="wc-distribution">
      {bands.map((band) => {
        const pct = b.total > 0 ? Math.round((band.count / b.total) * 100) : 0;
        return (
          <div key={band.label} className="wc-row">
            <div className="wc-row-header">
              <span className="wc-label">{band.label}</span>
              <span className="wc-sublabel">{band.sublabel}</span>
              <span className="wc-count" style={{ color: band.color }}>
                {band.count} <span className="wc-pct">({pct}%)</span>
              </span>
            </div>
            <div className="wc-bar-track">
              <div className="wc-bar-fill" style={{ width: `${pct}%`, background: band.color }} />
            </div>
          </div>
        );
      })}
      <div className="wc-footer">{b.total} prompts total</div>
    </div>
  );
}

function ScoreDetail({ stats }: { stats: LifetimeStats }) {
  const { scoreBands, totalPrompts } = stats;
  if (totalPrompts === 0) return <div className="detail-empty">No scored prompts yet.</div>;
  const bands = [
    { label: 'Excellent (71–100)', count: scoreBands.excellent },
    { label: 'Good (41–70)', count: scoreBands.good },
    { label: 'Needs work (0–40)', count: scoreBands.needsWork },
  ];
  return (
    <div className="detail-list">
      {bands.map((b) => {
        const pct = Math.round((b.count / totalPrompts) * 100);
        return (
          <div key={b.label} className="detail-row">
            <span className="detail-row-label">{b.label}</span>
            <span className="detail-row-value">
              {b.count} <span className="detail-row-sub">({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function IntentsDetail({ stats }: { stats: LifetimeStats }) {
  const { intentCounts } = stats;
  const total = Object.values(intentCounts).reduce((s, c) => s + c, 0);
  if (total === 0) return <div className="detail-empty">No intent data yet.</div>;

  const sorted = (Object.entries(intentCounts) as Array<[keyof typeof intentCounts, number]>).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="detail-list">
      {sorted.map(([intent, count]) => {
        const pct = Math.round((count / total) * 100);
        const label = intent.charAt(0).toUpperCase() + intent.slice(1);
        return (
          <div key={intent} className="detail-row">
            <span className="detail-row-label">{label}</span>
            <span className="detail-row-value">
              {count} <span className="detail-row-sub">({pct}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PlatformDetail({ stats }: { stats: LifetimeStats }) {
  const entries = Object.entries(stats.platformStats).sort((a, b) => b[1].count - a[1].count);
  if (entries.length === 0) return <div className="detail-empty">No platform data yet.</div>;
  return (
    <div className="detail-list">
      {entries.map(([p, { count, avgScore }]) => (
        <div key={p} className="detail-row">
          <span className="detail-row-label">{platformLabel(p)}</span>
          <span className="detail-row-value">
            {count} prompt{count !== 1 ? 's' : ''}
            <span className="detail-row-sub" style={{ color: scoreColor(avgScore) }}>
              {' · '}
              {avgScore} avg
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat row (list item style, no box)
// ---------------------------------------------------------------------------

interface StatRowProps {
  label: string;
  value: string;
  onClick: () => void;
}

function StatRow({ label, value, onClick }: StatRowProps) {
  return (
    <button className="stat-row" onClick={onClick}>
      <span className="stat-row-left">
        <span className="stat-row-label">{label}</span>
        <span className="stat-row-value">{value}</span>
      </span>
      <svg
        className="stat-row-caret"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4.5 2.5L8 6l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Signed-in view
// ---------------------------------------------------------------------------

function SignedInView({
  session,
  stats,
  statsLoading,
  statsError,
  statsEnabled,
  isActive,
  onSignOut,
  onReload,
}: {
  session: AuthSession;
  stats: LifetimeStats | null;
  statsLoading: boolean;
  statsError: boolean;
  statsEnabled: boolean;
  isActive: boolean;
  onSignOut: () => void;
  onReload: () => void;
}) {
  const [detail, setDetail] = useState<DetailKey | null>(null);

  // Reset detail panel when the user switches away from the Account tab
  useEffect(() => {
    if (!isActive) setDetail(null);
  }, [isActive]);

  const detailTitles: Record<DetailKey, string> = {
    prompts: 'Prompts scored',
    score: 'Avg score',
    intents: 'Top intent',
    platform: 'Top platform',
  };

  return (
    <div className="account-signed-in">
      <div className="account-user-card">
        <div className="account-avatar">{session.email[0] ?? '?'}</div>
        <span className="account-email">{session.email}</span>
      </div>

      {statsLoading && <div className="stats-loading">Loading stats…</div>}

      {!statsEnabled && (
        <div className="stats-paused-banner">
          Stat collection is paused. Enable it in <strong>Settings</strong> to track your prompts.
        </div>
      )}

      {!statsLoading && statsError && (
        <div className="stats-error">
          <button className="stats-reload-btn" onClick={onReload}>
            Reload stats
          </button>
        </div>
      )}

      {!statsLoading && !statsError && stats && !detail && (
        <div className="stats-list">
          <StatRow
            label="Prompts scored"
            value={stats.totalPrompts > 0 ? stats.totalPrompts.toString() : '—'}
            onClick={() => setDetail('prompts')}
          />
          <StatRow
            label="Avg score"
            value={stats.avgScore !== null ? stats.avgScore.toString() : '—'}
            onClick={() => setDetail('score')}
          />
          <StatRow
            label="Top intent"
            value={
              stats.totalPrompts === 0
                ? '—'
                : (() => {
                    const k = computeTopIntent(stats.intentCounts);
                    return k.charAt(0).toUpperCase() + k.slice(1);
                  })()
            }
            onClick={() => setDetail('intents')}
          />
          <StatRow
            label="Top platform"
            value={stats.topPlatform ? platformLabel(stats.topPlatform) : '—'}
            onClick={() => setDetail('platform')}
          />
        </div>
      )}

      {!statsLoading && !statsError && stats && detail && (
        <div className="detail-panel">
          <button className="detail-back" onClick={() => setDetail(null)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M7.5 2.5L4 6l3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {detailTitles[detail]}
          </button>
          {detail === 'prompts' && <PromptsDetail stats={stats} />}
          {detail === 'score' && <ScoreDetail stats={stats} />}
          {detail === 'intents' && <IntentsDetail stats={stats} />}
          {detail === 'platform' && <PlatformDetail stats={stats} />}
        </div>
      )}

      <button className="signout-btn" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AccountTab({ session, onSessionChange, statsEnabled, isActive, reloadKey }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingOAuth, setLoadingOAuth] = useState<'google' | 'github' | null>(null);
  const [stats, setStats] = useState<LifetimeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const anyLoading = loadingPassword || loadingOAuth !== null;

  async function loadStats(token: string) {
    setStatsLoading(true);
    setStatsError(false);
    const result = await fetchLifetimeStats(token);
    if (result.ok) {
      setStats(result.stats);
    } else {
      setStatsError(true);
    }
    setStatsLoading(false);
  }

  // Silent background refresh — no loading spinner, no error state change.
  // Only updates stats if the fetch succeeds so a transient network hiccup
  // doesn't wipe out the currently displayed data.
  async function refreshStatsSilently(token: string) {
    const result = await fetchLifetimeStats(token);
    if (result.ok) setStats(result.stats);
  }

  useEffect(() => {
    if (!session) {
      setStats(null);
      return;
    }

    let token: string | null = null;

    // Initial load (with loading spinner + error state)
    getValidSession()
      .then((validSession) => {
        if (!validSession) return Promise.reject(new Error('no session'));
        if (validSession.access_token !== session.access_token) {
          onSessionChange(validSession);
        }
        token = validSession.access_token;
        return loadStats(token);
      })
      .catch(() => setStatsError(true));

    // Poll every 10 s while the popup is open
    const interval = setInterval(() => {
      if (token) void refreshStatsSilently(token);
    }, 10_000);

    return () => clearInterval(interval);
  }, [session, reloadKey]);

  async function handlePasswordSignIn() {
    setError('');
    if (!email) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setLoadingPassword(true);
    const result = await signInWithPassword(email, password);
    setLoadingPassword(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPassword('');
    saveSession(result.session);
    onSessionChange(result.session);
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setError('');
    setLoadingOAuth(provider);
    const result = await signInWithOAuth(provider);
    setLoadingOAuth(null);
    if ('error' in result) {
      if (result.error) setError(result.error);
      return;
    }
    // Background worker already persisted the session — just update UI state
    onSessionChange(result.session);
  }

  async function handleSignOut() {
    if (session) await signOut(session.access_token);
    saveSession(null);
    onSessionChange(null);
  }

  if (session) {
    return (
      <SignedInView
        session={session}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        statsEnabled={statsEnabled}
        isActive={isActive}
        onSignOut={handleSignOut}
        onReload={() => {
          getValidSession().then((validSession) => {
            if (validSession) loadStats(validSession.access_token);
          });
        }}
      />
    );
  }

  return (
    <div className="auth-form">
      <div className="auth-field">
        <label className="auth-label" htmlFor="auth-email">
          Email
        </label>
        <input
          className="auth-input"
          id="auth-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') passwordRef.current?.focus();
          }}
          disabled={anyLoading}
        />
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="auth-password">
          Password
        </label>
        <input
          className="auth-input"
          id="auth-password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          ref={passwordRef}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePasswordSignIn();
          }}
          disabled={anyLoading}
        />
      </div>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <button className="auth-btn" onClick={handlePasswordSignIn} disabled={anyLoading}>
        {loadingPassword ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="auth-divider">
        <span className="auth-divider-line" />
        <span className="auth-divider-text">or</span>
        <span className="auth-divider-line" />
      </div>

      <button className="oauth-btn" onClick={() => handleOAuth('google')} disabled={anyLoading}>
        <GoogleIcon />
        <span>{loadingOAuth === 'google' ? 'Opening…' : 'Continue with Google'}</span>
      </button>

      <button className="oauth-btn" onClick={() => handleOAuth('github')} disabled={anyLoading}>
        <GitHubIcon />
        <span>{loadingOAuth === 'github' ? 'Opening…' : 'Continue with GitHub'}</span>
      </button>
    </div>
  );
}
