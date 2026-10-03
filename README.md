# Quantum Villain

A two-minute voice game built for phones. The Observer, a quantum supervillain shaped like a giant eye, opens with one hard "measurement" question. Miss it and you collapse to the Curious tier (fast multiple choice); two right in a row there climbs you back to Physicist. Answer by voice before the clock runs out, score points for being right and fast, and post your score to the scoreboard for the tier you finish in.

- **Curious** mode asks plain-English questions anyone can try. **Physicist** mode keeps the original oral-exam questions.
- Points: up to 250 for accuracy and 83 for speed per question (999 max). A hint costs 50.
- With an OpenAI key, the Observer speaks through OpenAI Realtime (speech-to-speech over WebRTC). Without one, the game still works using the browser's own speech recognition and voice.

## Live Demo

[Launch the static preview](https://collepatt.github.io/quantum-villain-viva/)

The hosted preview runs without secrets: questions are read with browser speech and grading uses a local heuristic. Live microphone mode is available when running locally with an OpenAI API key.

## Features

- Cinematic transmission intro and animated exam chamber UI.
- Five quantum mechanics topics: tunneling, measurement, spin, harmonic oscillator, and entanglement.
- Four-question adaptive round: each spoken answer is graded as soon as it is locked in (the grade is sealed so the final scoring reuses it), multiple choice grades instantly, and the server replays the tier rules before signing a scoreboard token.
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

Scoreboard (run `supabase/leaderboard.sql` once in the Supabase SQL editor first):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...   # or the legacy service_role key
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
