// ---------------------------------------------------------------------------
// Platform-specific DOM selectors for finding the chat input field
// Each platform has a different DOM structure — these selectors target
// the textarea/contenteditable where the user types their prompt.
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  name: string;
  inputSelector: string;
  /** The outermost input bar container — badge will be inserted before this */
  inputBarSelector?: string;
  /** Optional: selector for the send button (to detect when a prompt is submitted) */
  sendButtonSelector?: string;
  /**
   * Selector for the "+" / attach button in the toolbar.
   * When found, the badge is vertically centered with this button and
   * positioned just to its left — giving consistent placement across platforms.
   */
  plusButtonSelector?: string;
  /**
   * Horizontal gap in px between the badge's right edge and the + button's left edge.
   * Defaults to 10. Increase to push the badge further left; decrease to bring it closer.
   */
  badgeGap?: number;
  /**
   * Vertical nudge in px applied on top of the + button center alignment.
   * Negative moves the badge up, positive moves it down. Defaults to 0.
   */
  badgeNudgeY?: number;
  /**
   * Vertical nudge in px for the feedback pills. Negative moves the pills up,
   * positive moves them down. Defaults to 0. Applied on top of the base
   * offset above the input bar.
   */
  pillNudgeY?: number;
}

const PLATFORMS: Record<string, PlatformConfig> = {
  chatgpt: {
    name: 'ChatGPT',
    inputSelector: '#prompt-textarea, [id="prompt-textarea"]',
    sendButtonSelector: '[data-testid="send-button"], button[aria-label="Send prompt"]',
    plusButtonSelector:
      'button[aria-label="Attach files"], button[data-testid="composer-attach-button"], button[aria-label="Add photos and files"]',
    // badgeGap defaults to 10 — ChatGPT is the reference
  },
  gemini: {
    name: 'Gemini',
    inputSelector:
      '.ql-editor, [contenteditable="true"][aria-label*="prompt"], rich-textarea .ql-editor',
    inputBarSelector: 'div.input-area-container, form.search-bar, .input-area',
    sendButtonSelector: 'button[aria-label="Send message"], .send-button',
    plusButtonSelector: 'button[aria-label="Add media"], button[aria-label="Upload and more"]',
    badgeNudgeY: -4, // tiny upward nudge to center with the pill-shaped bar
  },
  perplexity: {
    name: 'Perplexity',
    // id="ask-input" is the most reliable; contenteditable+data-lexical as fallback
    inputSelector:
      '#ask-input, div[contenteditable="true"][data-lexical-editor="true"], div[contenteditable="true"][aria-placeholder]',
    // inputBarSelector intentionally omitted — findInputBar walks up to the ancestor
    // containing the send button, which is the full card (text row + toolbar row)
    sendButtonSelector: 'button[aria-label="Submit"]',
    plusButtonSelector: 'button[aria-label="Add files or tools"]',
    badgeGap: 24,
    pillNudgeY: -18,
  },
  claude: {
    name: 'Claude',
    // data-testid is the most stable hook; .ProseMirror as fallback
    inputSelector:
      'div[contenteditable="true"][data-testid="chat-input"], div[contenteditable="true"].ProseMirror',
    // inputBarSelector intentionally omitted — findInputBar walks up to the ancestor
    // containing the send button, which is the full card (text row + toolbar row)
    sendButtonSelector: 'button[aria-label="Send message"]',
    plusButtonSelector: 'button[aria-label="Add files, connectors, and more"]',
    badgeGap: 24,
    pillNudgeY: -18,
  },
};

/**
 * Detect which AI platform the current page belongs to.
 */
export function detectPlatform(): PlatformConfig | null {
  const host = window.location.hostname;

  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    return PLATFORMS.chatgpt;
  }
  if (host.includes('gemini.google.com')) {
    return PLATFORMS.gemini;
  }
  if (host.includes('perplexity.ai')) {
    return PLATFORMS.perplexity;
  }
  if (host.includes('claude.ai')) {
    return PLATFORMS.claude;
  }

  return null;
}

/**
 * Find the chat input element on the current page.
 * Returns null if not found (page may still be loading).
 */
export function findInputElement(platform: PlatformConfig): HTMLElement | null {
  return document.querySelector<HTMLElement>(platform.inputSelector);
}

/**
 * Get the current text from the input element.
 * Handles both textarea and contenteditable elements.
 */
export function getInputText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  // contenteditable (Gemini uses this)
  return el.innerText || el.textContent || '';
}
