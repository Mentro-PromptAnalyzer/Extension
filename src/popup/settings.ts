// ---------------------------------------------------------------------------
// Settings — chrome.storage.sync persistence + broadcast to content scripts
// ---------------------------------------------------------------------------

export interface Settings {
  pillsEnabled: boolean;
  badgeEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  pillsEnabled: true,
  badgeEnabled: true,
};

export async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get('askbetter_settings', (result) => {
      const saved = result['askbetter_settings'] as Partial<Settings> | undefined;
      resolve({ ...DEFAULT_SETTINGS, ...saved });
    });
  });
}

export function saveSettings(settings: Settings): void {
  chrome.storage.sync.set({ askbetter_settings: settings });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', settings }).catch(() => {});
      }
    }
  });
}
