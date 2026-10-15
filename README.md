# Quantum Villain

A two-minute voice game built for phones. The Observer, a quantum supervillain shaped like a giant eye, asks four questions out loud. Answer by voice (or type) before the clock runs out, and score points for being right and fast.

**Play it:** https://quantum-villain-viva.vercel.app

## How it plays

- You get 4 questions. They start hard, with 60 seconds each.
- Get a hard one wrong and you drop to multiple choice, with 20 seconds each.
- Get 2 multiple-choice questions right in a row to move back up to hard.
- Points reward accuracy and speed; hints cost points.

## How it works

- The Observer speaks through OpenAI Realtime (speech-to-speech over WebRTC). The OpenAI key stays on the server, and the browser only gets a short-lived token.
- Without live voice, the game falls back to the browser's own speech recognition and voice, and you can always type.
- Inside social-app browsers (LinkedIn, Instagram, Facebook), which often block the mic, the home screen offers a way out to Safari or Chrome.
- Answers are graded server-side with a structured model call, with a local heuristic as backup. Scores are signed, so only graded games can reach the scoreboard.

Built with Vite, React and TypeScript, the OpenAI Agents SDK, Vercel functions, and Supabase for the scoreboard.

## Run it yourself

```bash
npm install
cp .env.example .env
npm run dev
```

Add an OpenAI API key to `.env` for live voice. Without one, the game still runs with your browser's voice and the local grader. The other settings are explained in `.env.example`, and `npm test` runs the tests.
