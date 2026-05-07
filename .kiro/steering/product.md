# AskBetter Chrome Extension

AskBetter is a Chrome extension that analyzes AI prompts in real-time as the user types in ChatGPT, Gemini, or Perplexity. It scores the prompt across four dimensions — Ownership, Depth, Rigor, and Clarity — and surfaces actionable suggestions before the user hits send.

## Core Purpose

Help users write better prompts by giving them live feedback on prompt quality, intent classification, and specific improvement suggestions.

## Supported Platforms

- ChatGPT (chatgpt.com, chat.openai.com)
- Gemini (gemini.google.com)
- Perplexity (perplexity.ai)

## Scoring Dimensions

- **Ownership** — maps to `autonomy`: does the user show their own thinking?
- **Depth** — maps to `curiosity`: does the prompt ask why/how rather than just what?
- **Critical** (formerly Rigor) — maps to `critical`: does it probe edge cases, risks, or alternatives?
- **Clarity** — average of `specificity` and `context`: is the prompt specific and well-contextualized?

## Scoring Architecture

Two-layer hybrid:
1. **Heuristic** (`engine.ts`) — fires instantly at 300 ms debounce, always available
2. **Ollama LLM** (`ollama.ts`) — fires async at 1500 ms debounce against local `llama3.2`, merges over heuristic result. Falls back silently if Ollama is not running.

## Intent Classification

Prompts are classified into one of four intents: `delegation`, `curiosity`, `collaborative`, `verification`. Intent influences how quality scores are weighted.

## UI

A floating badge (score circle) appears next to the input bar. Hovering fans out four sub-bubbles with SVG arc rings showing per-dimension scores. While Ollama is scoring, the badge border pulses purple to signal a score update is pending. The popup shows the latest score when the extension icon is clicked.
