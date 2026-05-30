# EMBODIED

An interactive audiovisual piece where you *are* the seed of an emotion and must grow a body — color, timbre, register, articulation, space, and companions — then perform a gesture through emotion-space to evoke your assigned feeling. Built with React, a `<canvas>` renderer, and [Tone.js](https://tonejs.github.io/) for live synthesis.

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/) (dev server + build)
- [Tone.js](https://tonejs.github.io/) (Web Audio synthesis)

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173). Click through the welcome screen and press **Awaken** to start audio — browsers require a user gesture before audio can play.

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

- **Persistence:** The gallery persists submissions via a `window.storage` API. On the web this is backed by `localStorage` through a small shim in `src/storage.js`, so submissions are stored per-browser. There is no shared backend — each visitor sees their own submissions plus the built-in mock pieces.
- **Audio:** Sound only begins after the **Awaken** interaction, per browser autoplay policies.
