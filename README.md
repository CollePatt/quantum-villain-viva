# Quantum Villain Viva

A browser-based quantum mechanics oral exam run by a theatrical villain.

Open the intercepted transmission, choose a topic, answer three questions aloud, and earn your scorecard. The examiner asks at most one follow-up per answer, then reports what you got right, what you missed, and a few simple voice-agent metrics.

## Live Demo

[Launch the static preview](https://collepatt.github.io/quantum-villain-viva/)

The hosted preview runs without secrets: questions are read with browser speech and grading uses a local heuristic. Live microphone mode is available when running locally with an OpenAI API key.

## Features

- Cinematic transmission intro and animated exam chamber UI.
- Five quantum mechanics topics: tunneling, measurement, spin, harmonic oscillator, and entanglement.
- Deterministic three-question exam flow with one follow-up maximum per answer.
- Realtime villain reactions that respond to the user's answer before follow-ups or transitions.
- Stolen field manual overlay with topic-specific survival notes for non-physics testers.
- Survival, Viva, and Doom protocols for adjustable hint access and follow-up strictness.
- Rubric scorecard with per-question feedback and review suggestions.
- Demo metrics for duration, first response latency, interruptions, and transcript count.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://127.0.0.1:5173`.

For live voice, add an OpenAI API key to `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
```

The permanent API key stays server-side. The browser only receives short-lived Realtime credentials from the local Express server.

## Hosted Review

The repo includes Vercel serverless API routes in `api/` so hosted voice mode can mint Realtime credentials without exposing the permanent OpenAI key.

Vercel project settings:

```text
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Required Vercel environment variables:

```bash
OPENAI_API_KEY=sk-proj-...
VIVA_ACCESS_CODE=share-this-with-testers
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=ash
OPENAI_GRADER_MODEL=gpt-4.1-mini
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MINUTES=60
```

Optional:

```bash
VIVA_ADMIN_CODE=private-owner-code
RATE_LIMIT_ADMIN_MAX=200
ALLOWED_ORIGINS=https://collepatt.github.io,https://your-vercel-app.vercel.app
VITE_API_BASE_URL=https://your-vercel-app.vercel.app
```

`VITE_API_BASE_URL` is only needed when a separately hosted frontend, such as GitHub Pages, should call the Vercel API. If the frontend and API are both deployed by the same Vercel project, leave it blank.

## Tech Stack

- Vite, React, and TypeScript
- Express local API
- OpenAI Realtime via `@openai/agents/realtime`
- Structured grading with an OpenAI model when configured
- Client/server local heuristic grading fallback
- Vitest, React Testing Library, Supertest, Playwright

## Quality Gates

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```
