# Project Structure

## Root Layout

```
manifest.json        # Chrome MV3 manifest — permissions, entry points, host_permissions
popup.html           # Extension popup UI (inline CSS, loads dist/popup.js)
vite.config.ts       # Build config — defines the three entry points
tsconfig.json        # TypeScript config — strict, ES2022, bundler resolution
package.json
icons/               # Extension icons at 16, 48, 128px
dist/                # Build output (gitignored) — loaded by Chrome
src/                 # All source TypeScript
```

## src/ Modules

### `src/analysis/` — Pure scoring logic, no DOM dependencies

| File | Responsibility |
|---|---|
| `types.ts` | Shared types: `PromptIntent`, `IntentScores`, `QualityScores` |
| `classifier.ts` | Signal-based intent scoring (`scoreIntents`, `primaryIntentFrom`) |
| `rubric.ts` | Flag detection and quality scoring (`detectFlags`, `scorePromptQuality`, `computeQualityScore`) |
| `engine.ts` | Public API — `analyzePrompt(text): LiveScore` — composes classifier + rubric into UI-ready scores. `LiveScore` dimensions: `ownership`, `depth`, `critical`, `clarity` |
| `ollama.ts` | Thin proxy — `scoreWithOllama(text)` sends an `OLLAMA_SCORE` message to the background worker and returns the result. Does not fetch directly (content scripts on https:// pages cannot make http:// requests — Chrome mixed-content block) |

### `src/content/` — Injected into AI platform pages

| File | Responsibility |
|---|---|
| `index.ts` | Entry point — detects platform, polls for input element, attaches observers via `attachToInput()`, debounces analysis, sends messages to background. Tracks `activeInput`/`activeObserver` module-level refs; 1 s heartbeat re-attaches if SPA replaces the element; `visibilitychange` re-scores on tab focus. Two-layer scoring: heuristic fires at 300 ms debounce, Ollama async re-score fires at 1500 ms debounce with spinner feedback. `lastScoredText` tracks the last fully-scored text so observer/input/keyup event bursts from a single keystroke don't incorrectly hide pills — `hideFeedback()` only fires when the text has actually changed from `lastScoredText` |
| `selectors.ts` | `PlatformConfig` type + per-platform DOM selectors for ChatGPT, Gemini, Perplexity |
| `overlay.ts` | Floating badge + sub-bubble UI + feedback pills — all DOM creation is imperative vanilla JS, no framework. Exports `setBadgeLoading(bool)` (pulsing border while Ollama scores), `renderFeedback(suggestions, scores, inputEl, platform?)` (saves pending pill state — does not render immediately), `hideFeedback(instant?)` (fly-down exit or instant removal + clears pending state), and `attachInputBarHover(inputEl, platform?)` (attaches mouseenter/mouseleave to the input bar so pills show on hover and hide on leave) |

### `src/background/` — Service worker

| File | Responsibility |
|---|---|
| `index.ts` | Receives `SCORE_UPDATE` and `PROMPT_SUBMITTED` messages from content script; serves `GET_LATEST_SCORE` to popup; proxies `OLLAMA_SCORE` requests to `http://localhost:11434` (background has no mixed-content restriction unlike content scripts) |

### `src/popup/` — Extension popup

| File | Responsibility |
|---|---|
| `index.ts` | Requests latest score from background, renders score rows into `popup.html` |

## Key Architectural Rules

- `src/analysis/` must stay DOM-free and platform-agnostic — it can be unit tested in isolation
- `src/content/` is the only layer that touches the page DOM
- Message passing between layers uses typed discriminated unions (`type: 'SCORE_UPDATE' | 'PROMPT_SUBMITTED' | 'GET_LATEST_SCORE' | 'OLLAMA_SCORE'`)
- The overlay (`overlay.ts`) manages its own state (`currentScore`, `bubblesVisible`, `feedbackVisible`, `pendingSuggestions`, `pendingScores`, `pendingInputEl`, `inputBarHoverEl`, `mouseInsideInputBar`) as module-level variables — there is no external state store
- Platform selectors live exclusively in `selectors.ts` — never hardcode selectors elsewhere
- All scores are integers 0–100, clamped via `clamp()` in `rubric.ts`
- The `LiveScore` interface (defined in `engine.ts`) is the single contract between analysis and UI layers
- **Two-layer scoring**: heuristic (`engine.ts`) fires instantly at 300 ms debounce; Ollama (`ollama.ts`) fires async at 1500 ms debounce and merges over the heuristic result. Ollama failures are silent — heuristic score remains. Badge border pulses purple 600 ms after heuristic fires to signal AI scoring is pending; pulse cancels immediately if user resumes typing. **Feedback pills are stored as pending state** when Ollama (or heuristic fallback) responds — they render only when the user hovers the input bar (`mouseenter`) and hide on `mouseleave`. If the mouse is already inside the input bar when feedback arrives, pills show immediately. Pending state is cleared when the user starts typing a new prompt. `attachInputBarHover` is called once per input attach in `index.ts`. When merging Ollama scores, if Ollama returns empty suggestions the heuristic suggestions are used as fallback so pills always have content.
- **Ollama fetch lives in the background worker** (`background/index.ts`), not in the content script. Content scripts on https:// pages cannot make http:// requests (Chrome mixed-content block). `ollama.ts` is a thin message-passing wrapper only.
- **Ollama CORS config required**: Ollama rejects requests from `chrome-extension://` origins by default (403). Must set `OLLAMA_ORIGINS="chrome-extension://*"` before starting Ollama. Persistent setup: add `export OLLAMA_ORIGINS="chrome-extension://*"` to `~/.zshrc`, or run `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` once for the macOS app. Model: `llama3.2`, timeout: 30 s (first inference is slow — warm up with `ollama run llama3.2` before use).
- **Ollama system prompt** uses anchored scale descriptions (0/40/70/100 examples per dimension) and a calibration example with expected scores to keep scoring consistent across model runs.
