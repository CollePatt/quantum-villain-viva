# Quantum Villain Viva

A browser-based quantum mechanics oral examiner with a theatrical villain persona, deterministic exam flow, rubric grading, and voice-agent demo metrics.

The first version is intentionally narrow: choose one of five topics, answer three spoken questions, allow at most one follow-up per answer, then generate a scorecard with correct ideas, missing ideas, and measured behavior.

## What it demonstrates

- Browser voice agent architecture using OpenAI Realtime and `@openai/agents/realtime`.
- Server-side API-key protection through short-lived Realtime client secrets.
- A deterministic exam state machine rather than asking the model to manage the whole session.
- Rubric-based grading through `POST /api/grade-exam`, with a local heuristic fallback when no key is configured.
- Metrics for a short demo: duration, first-response latency, interruption count, and transcript item count.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173`.

Without an OpenAI key, the app still runs in typed demo mode and uses the local heuristic grader. Live microphone mode turns on after `OPENAI_API_KEY` is set in `.env`.

## OpenAI setup

1. Go to `platform.openai.com` and sign in.
2. Create or select a personal project.
3. Add billing and set a low monthly project budget or spend limit before testing.
4. Create an API key for the project.
5. Paste it into `.env`:

```bash
OPENAI_API_KEY=sk-proj-...
```

Keep `.env` private. The browser never receives this permanent key; it only receives short-lived Realtime credentials from the local Express server.

## Voice strategy

V1 does not train a custom voice. The villain behavior is implemented through product design, prompt instructions, concise turns, and the built-in `cedar` voice. That keeps the project small enough for a fast demo while still showing voice-AI architecture knowledge.

Custom voice training is deliberately left out because it requires extra consent, samples, review, and product eligibility work that would not fit the MVP deadline.

## Topics

- Quantum tunneling
- Measurement and collapse
- Spin and Stern-Gerlach
- Quantum harmonic oscillator
- Entanglement and Bell states

Each topic has three fixed questions, expected concepts, a common misconception, and one follow-up prompt.

## API routes

- `GET /api/config` returns setup status, selected models, voice, and topic metadata.
- `POST /api/realtime-token` returns a short-lived Realtime client secret for the chosen topic.
- `POST /api/grade-exam` returns a structured scorecard. It uses OpenAI when configured and local heuristic grading otherwise.

## Open-source roadmap

1. Add an Ollama local grader behind the same `gradeExam` contract.
2. Add Whisper or another local STT path for transcript capture.
3. Add a local TTS option so the same deterministic exam flow can run without a hosted realtime model.

## Quality gates

```bash
npm run typecheck
npm run test
npm run build
```

## Demo script

1. Start with tunneling.
2. Give one answer that mentions exponential decay and nonzero amplitude past the barrier.
3. Give one plausible wrong answer, such as "the particle borrows energy."
4. Use the interrupt button while the examiner is speaking.
5. End the exam and show the scorecard plus metrics.
