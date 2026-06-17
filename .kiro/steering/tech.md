# Tech Stack

## Runtime & Language

- **TypeScript** ~5.8, strict mode, ES2022 target, `jsx: "react-jsx"`
- **Chrome Extension Manifest V3** — service worker background, content scripts, popup
- **React 19** for the popup UI — content scripts and background remain vanilla JS/TS

## Build System

- **Vite** ^6.3 with `@vitejs/plugin-react` for JSX transform
- Three entry points compiled to flat `dist/` files:
  - `src/content/index.ts` → `dist/content.js`
  - `src/background/index.ts` → `dist/background.js`
  - `src/popup/main.tsx` → `dist/popup.js` + `dist/popup.css`
- Chunks go to `dist/chunks/[name].js`
- `emptyOutDir: true` — dist is wiped on every build

## Module System

- `"type": "module"` in package.json
- `moduleResolution: "bundler"` in tsconfig — use bare specifiers, no `.js` extensions on imports

## Type Checking

- `@types/chrome` for Chrome extension APIs

## Testing

- **Unit tests**: Vitest (`npm run test`) — `tests/analysis/` covers classifier, engine, rubric, stopWords, tfidf
- **E2E tests**: Playwright (`npm run test:e2e`) — `tests/e2e/` loads the built extension in a real Chromium context and smoke-tests the popup UI
- Coverage via `@vitest/coverage-v8` (`npm run test:coverage`)
- E2E requires a built `dist/` — run `npm run build` first

## Common Commands

```bash
npm run dev           # Vite build in watch mode (for development)
npm run build         # Single production build
npm run typecheck     # tsc --noEmit, no emit, type errors only
npm run format        # Prettier — formats src/**/*.{ts,tsx} and popup.html in place
npm run test          # Vitest unit tests (single run)
npm run test:coverage # Vitest with coverage report
npm run test:e2e      # Playwright E2E tests (requires built dist/)
```

## Loading the Extension Locally

1. Run `npm run dev` (or `npm run build`)
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked" → select the project root (where `manifest.json` lives)
5. Reload the extension after each build

## Dependencies

All dependencies are `devDependencies` — nothing ships at runtime except the compiled JS:

| Package | Purpose |
|---|---|
| `vite` | Build tool |
| `typescript` | Compiler |
| `@types/chrome` | Chrome API types |
| `prettier` | Code formatter (3.5.3 pinned) — config in `.prettierrc`, ignores in `.prettierignore` |
| `@vitejs/plugin-react` | JSX transform for React (4.4.1 pinned) |
| `@types/react` | React types |
| `@types/react-dom` | React DOM types |
| `@playwright/test` | E2E test framework |
| `@vitest/coverage-v8` | Coverage reporter for Vitest |
| `vitest` | Unit test runner |

Runtime dependencies (ship in `dist/popup.js`):

| Package | Purpose |
|---|---|
| `react` | UI framework for popup (19.1.0 pinned) |
| `react-dom` | DOM renderer for popup (19.1.0 pinned) |
