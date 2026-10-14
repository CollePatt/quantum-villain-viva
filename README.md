# Quantum Villain

A two-minute voice game built for phones. The Observer, a quantum supervillain shaped like a giant eye, asks four questions out loud. Answer by voice (or type) before the clock runs out, score points for being right and fast, and post your score to the scoreboard.

**Play it:** https://quantum-villain-viva.vercel.app

## How it plays

- You get 4 questions. They start hard, with 60 seconds each.
- Get a hard one wrong and you drop to multiple choice, with 20 seconds each.
- Get 2 multiple-choice questions right in a row to move back up to hard.
- Points reward accuracy and speed; hints cost points. Scores post to a shared scoreboard.

## How it works

- With an OpenAI key on the server, the Observer speaks through OpenAI Realtime (speech-to-speech over WebRTC). The browser only ever gets a short-lived token.
- Without a key, or if live voice fails, the game falls back to the browser's own speech recognition and voice, and you can always type.
- Inside social-app browsers (LinkedIn, Instagram, Facebook), which often block the mic, the home screen offers a way out to Safari or Chrome and the game drops to typing if the mic is refused.
- Answers are graded server-side with a structured model call, with a local heuristic as backup. Scores are signed so only graded games reach the scoreboard (Supabase).

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
RATE_LIMIT_ENABLED=true   # default on Vercel; set false to disable
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
