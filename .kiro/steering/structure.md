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
| `engine.ts` | Public API — `analyzePrompt(text): LiveScore` — composes classifier + rubric into UI-ready scores |

### `src/content/` — Injected into AI platform pages

| File | Responsibility |
|---|---|
| `index.ts` | Entry point — detects platform, polls for input element, attaches observers via `attachToInput()`, debounces analysis, sends messages to background. Tracks `activeInput`/`activeObserver` module-level refs; 1 s heartbeat re-attaches if SPA replaces the element; `visibilitychange` re-scores on tab focus |
| `selectors.ts` | `PlatformConfig` type + per-platform DOM selectors for ChatGPT, Gemini, Perplexity |
| `overlay.ts` | Floating badge + sub-bubble UI — all DOM creation is imperative vanilla JS, no framework |

### `src/background/` — Service worker

| File | Responsibility |
|---|---|
| `index.ts` | Receives `SCORE_UPDATE` and `PROMPT_SUBMITTED` messages from content script; serves `GET_LATEST_SCORE` to popup |

### `src/popup/` — Extension popup

| File | Responsibility |
|---|---|
| `index.ts` | Requests latest score from background, renders score rows into `popup.html` |

## Key Architectural Rules

- `src/analysis/` must stay DOM-free and platform-agnostic — it can be unit tested in isolation
- `src/content/` is the only layer that touches the page DOM
- Message passing between layers uses typed discriminated unions (`type: 'SCORE_UPDATE' | 'PROMPT_SUBMITTED' | 'GET_LATEST_SCORE'`)
- The overlay (`overlay.ts`) manages its own state (`currentScore`, `bubblesVisible`) as module-level variables — there is no external state store
- Platform selectors live exclusively in `selectors.ts` — never hardcode selectors elsewhere
- All scores are integers 0–100, clamped via `clamp()` in `rubric.ts`
- The `LiveScore` interface (defined in `engine.ts`) is the single contract between analysis and UI layers
