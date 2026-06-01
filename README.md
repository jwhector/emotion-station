# EMBODIED

An interactive audiovisual piece where you *are* the seed of an emotion and must grow a body — color, timbre, register, articulation, space, and companions — then perform a gesture through emotion-space to evoke your assigned feeling. Built with React, a `<canvas>` renderer, and [Tone.js](https://tonejs.github.io/) for live synthesis.

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/) (dev server + build)
- [Tone.js](https://tonejs.github.io/) (Web Audio synthesis)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values (see below)
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173). Click through the welcome screen and press **Awaken** to start audio — browsers require a user gesture before audio can play.

Without Supabase configured the app still runs — the gallery just shows the built-in
mock pieces and submissions aren't shared.

## Shared gallery (Supabase)

Submissions are persisted to a shared [Supabase](https://supabase.com/) Postgres table
so every visitor's gallery is populated by everyone else's pieces.

1. Create a free Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) — it creates the
   `submissions` table and the row-level-security policies (anonymous read + validated
   insert).
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**.
4. For deploys, set those same two vars in **Vercel → Settings → Environment Variables**
   (Production + Preview), then redeploy.

The anon key is public by design — it's compiled into the static bundle. Security comes
from the RLS policies, not key secrecy.

## Scripts

- `npm run dev` — start the dev server with hot reload
- `npm run build` — produce a production build in `dist/`
- `npm run preview` — serve the production build locally

## Deploying to Vercel

This project is configured for zero-config deployment on [Vercel](https://vercel.com/).

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New → Project** and import the repo.
3. Vercel auto-detects the Vite framework (settings are also pinned in `vercel.json`):
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

Or deploy from the CLI:

```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

## Notes

- **Persistence:** The gallery persists submissions to a shared Supabase table via `src/submissions.js` (`saveSubmission` / `fetchRecentSubmissions`). Real submissions are shown first, followed by the built-in demo pieces (always included as examples). If Supabase isn't configured or is unreachable, only the demos show, so the gallery is never blank.
- **Audio:** Sound only begins after the **Awaken** interaction, per browser autoplay policies.
