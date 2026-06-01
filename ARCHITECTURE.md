# EMBODIED — Architecture Overview

A quick-start orientation for AI agents working on this codebase.

## What it is

**EMBODIED** is a single-page interactive audiovisual art piece. The user "is" the
seed of a randomly-assigned emotion and must *grow a body* — choosing color, timbre,
register, articulation, space, and companions — then perform a gesture through a
valence × arousal plane to evoke that emotion. The result can be submitted to a
gallery, where the user listens to other pieces and guesses their intended emotion.

Everything is rendered live: visuals on a single `<canvas>`, audio synthesized in
real time with [Tone.js](https://tonejs.github.io/). There is **no backend** — the
"gallery" persists per-browser via `localStorage` plus built-in mock pieces.

## Tech stack

- **React 18** (`react`, `react-dom`) — UI shell, phase/state management
- **Vite 6** (`@vitejs/plugin-react`) — dev server + production build
- **Tone.js 15** — Web Audio synthesis (synths, sequencer, effects)
- Deployed zero-config on **Vercel** (SPA rewrite to `/`)

## File map

Almost all logic lives in one component; persistence is a thin data layer beside it.

| File | Role |
|------|------|
| [src/Emotion_1.jsx](src/Emotion_1.jsx) | **The entire app.** ~635 lines: all state, audio engine, canvas renderer, and JSX for every phase. Start here. |
| [src/main.jsx](src/main.jsx) | React entry point. Mounts `<App/>` into `#root`. |
| [src/submissions.js](src/submissions.js) | Shared-gallery data layer: `saveSubmission(sub)` and `fetchRecentSubmissions(limit)`, mapping the in-app shape ↔ Supabase columns. |
| [src/supabaseClient.js](src/supabaseClient.js) | Creates the Supabase browser client from `VITE_` env vars. Exports `configured` (false when env vars are absent → app falls back to mocks). |
| [supabase/schema.sql](supabase/schema.sql) | One-time DDL: `submissions` table, index, and RLS policies. Run in the Supabase SQL editor. |
| [.env.example](.env.example) | Template for `.env.local` (the two `VITE_SUPABASE_*` vars). |
| [index.html](index.html) | HTML host. `#root` div, dark background, loads `/src/main.jsx`. |
| [vite.config.js](vite.config.js) | Vite + React plugin. Nothing custom. |
| [vercel.json](vercel.json) | Vercel build/output config + SPA rewrite. |
| [README.md](README.md) | User-facing setup & deploy instructions. |

## The phase model (most important concept)

The app is a **linear-ish state machine** driven by a single `phase` string in
[Emotion_1.jsx](src/Emotion_1.jsx). All UI and canvas behavior branch on it:

```
welcome → assignment → intro → movement → grid → plane → gallery ⇄ listen
                              (Awaken)                       (loop / restart)
```

| Phase | Meaning | What happens |
|-------|---------|--------------|
| `welcome` | Animated intro lines | Click anywhere → `beginAssignment`, which randomly assigns the emotion and fades to `assignment` |
| `assignment` | Animated reveal of the assigned emotion | Staged CSS reveal (glowing orb + emotion name in its color). **Begin to grow** (`enterIntro`) → `intro`. No audio yet. |
| `intro` | "Phase One" copy | **Awaken** button calls `initAudio` (required user gesture for Web Audio), then → `movement` |
| `movement` | *How you move* | Pick 1 of 5 rhythmic `PRESETS`; auditions play live; lock it in |
| `grid` | *Who you are* | 6 dimensions × 5 nodes (`ROWS`). Pan/arrow to focus a node; the centered node plays live; each **lock** collapses that row. Mode must be locked to proceed. |
| `plane` | *How you feel* | Drag through a valence (Y) × arousal (X) plane that drives tempo, filter, density. **Record** a gesture path, then **submit**. |
| `gallery` | *What others made* | Lists stored + mock pieces as cards. Audio pauses here. |
| `listen` | Guess game | Replays another piece's recorded path + settings; user guesses the emotion, then reveal. |

`restart` resets all creation state back to `movement`.

## State architecture

A deliberate split between **React state** (drives re-renders / JSX) and **refs**
(read every animation frame without triggering renders):

- **React `useState`** — `phase`, `audioReady`, `assignedEmotion`, `selected`
  (preset), `locked`, `focus` `{r,c}`, `lockedCols` (per-dimension locked node index
  or `null`), gallery `pool`, `guesses`, `revealed`, recording/playing flags.
- **Refs** — mirror of the latest phase/focus/lockedCols (so the rAF loop and event
  handlers read current values), Tone.js node handles (`synthRef`, `padRef`,
  `bassRef`, `counterRef`, `choirRef`, `filterRef`, `reverbRef`, `seqRef`), the
  live pulse list, camera position, pointer state, the record/playback path buffers
  (`recRef`, `playRef`, `listenRef`), and **`eff.current`** — the "effective"
  resolved synthesis/visual parameters.

Several `useEffect`s keep `phaseRef`/`focusRef`/`lockedColsRef` in sync with their
state counterparts.

## The `applyEffective` pipeline

`applyEffective()` is the bridge from user choices → sound & visuals. It:
1. Reads `lockedCols` + current `focus` to resolve which **node** is active for each
   of the 6 dimensions (`mode`, `timbre`, `register`, `articulation`, `space`,
   `companion`). In `grid`, the focused row uses the focused column; locked rows use
   their locked node; otherwise `ROW_DEFAULT`.
2. Writes the resolved values into `eff.current` (tint, texture, register semitones,
   size, sharpness, reverb wet, halo, satellite count, companion flags, mode's
   third/seventh scale degrees).
3. If audio is ready, pushes them to Tone.js (oscillator type, envelope, reverb wet,
   and — outside the plane — filter cutoff and BPM).

It re-runs whenever `focus`, `lockedCols`, or `phase` change.

## Audio engine (`initAudio` + the Sequence)

`initAudio` (triggered by **Awaken**) calls `Tone.start()`, then builds the signal
chain: five voices (`synth` lead, `pad`, `bass` MonoSynth, `counter`, `choir`
PolySynths) → `filter` (lowpass) → `reverb` → destination.

A 16-step `Tone.Sequence` loops over one measure at 96 BPM. Each step:
- On step 0, lays down a pad chord (root + fifth, plus the mode's colored third in
  two octaves; adds the seventh when high on the plane; optional choir).
- Plays the selected preset's accent notes through the lead synth (octave accents
  get colored by the mode), scheduling visual `pulses` via `Tone.Draw`.
- Adds bass / counter lines when the companion dimension enables them.
- A per-step `weights` table vs. `eff.gate` thins the texture (the plane's arousal
  axis sets `gate` — low arousal = sparser).

`assignedEmotion` is randomly picked here. Cleanup on unmount disposes all nodes and
stops the transport.

## Canvas renderer

A single `requestAnimationFrame` loop (in a `useEffect`) clears and redraws every
frame, branching on `phaseRef.current`:

- **`drawAvatar`** — the "self": a wobbling blob with halo, contour, texture ripples,
  energy glow, and orbiting satellites, all driven by `eff.current` + live pulse
  energy.
- **`drawRing`** — expanding rings emitted on each note pulse.
- **grid phase** — lays out the 6×5 node grid, animates row collapse on lock, runs a
  drag/arrow camera, and animates a locked node "flying" into the center self.
- **plane / listen phase** — draws the valence×arousal field with 4 corner
  `ATTRACTORS`, axis labels, the recorded/playing trace path, and the moving cursor;
  advances playback position from the recorded path.

The loop reads refs only (never React state directly) so it never needs to restart
on re-render.

## Data / persistence

Submissions are stored in a **shared Supabase Postgres table** (`submissions`), so
every visitor's gallery is populated by everyone else's pieces.

- `submitCreation` downsamples the recorded gesture path, builds a submission object
  (`id`, `emotion`, `presetId`, `lockedCols`, `path`, `ts`) and writes it via
  `saveSubmission(sub)` ([src/submissions.js](src/submissions.js)). The call is wrapped
  in `try/catch` — an insert failure still advances the user to the gallery.
- `loadPool` calls `fetchRecentSubmissions(16)` (most recent first, server-side
  `limit`), then merges `[...stored, ...MOCKS]`, excludes the user's own piece
  (`mySubId`), and dedupes by id. **Real submissions show first, with the demo MOCKS
  always appended as examples.** If the fetch fails or returns nothing (including when
  Supabase env vars are absent), only the MOCKS show, so the gallery is never blank.
- [src/submissions.js](src/submissions.js) maps the in-app camelCase shape ↔ the table's
  snake_case columns (`presetId`↔`preset_id`, `lockedCols`↔`locked_cols`). The browser
  client lives in [src/supabaseClient.js](src/supabaseClient.js); `configured` is false
  when the `VITE_SUPABASE_*` env vars are missing.
- Fetch-on-load only — no realtime subscription. New pieces appear on re-entering the
  gallery. Schema + RLS in [supabase/schema.sql](supabase/schema.sql).

## Key constants & data tables (top of [Emotion_1.jsx](src/Emotion_1.jsx))

- `PRESETS` — 5 rhythmic movements (16-step patterns + spin/wobble).
- `ROWS` — the 6 dimensions, each with exactly 5 nodes; each row maps to one visual
  *channel* (color / texture / size / sharpness / halo / satellites) so no visual cue
  is redundant with the plane.
- `ROW_DEFAULT` — default node index per dimension before locking.
- `ATTRACTORS` — 4 emotion poles on the plane corners.
- `EMOTIONS` — the 5 assignable/guessable emotions and their colors.
- `MOCKS` — 5 pre-baked gallery submissions (with generated gesture paths via
  `makePath`).

## Conventions & gotchas for agents

- **One file holds nearly everything.** Don't go looking for routers, stores, or
  component trees — there aren't any.
- **Dense, terse style.** The component uses compact single-line callbacks and packed
  expressions; match the surrounding density when editing.
- **State vs. refs split is intentional.** If you need a value inside the rAF loop or
  a pointer/key handler, read the `*Ref` mirror, not the state. If you add new tunable
  state used by the renderer, add a matching ref + sync effect.
- **Audio requires a user gesture** — nothing plays until **Awaken** (`initAudio`).
  Audio pauses in `gallery` and resumes in motion/grid/plane/listen phases.
- **All styling is one big inline `<style>` block** inside the component's JSX (uses
  Fraunces + IBM Plex Mono from Google Fonts). No CSS files, no CSS modules.
- The trailing boolean arg in `storage.set/get/list` calls is a vestige of the
  original platform API and is ignored by the shim.

## Running it

```bash
npm install
npm run dev      # Vite dev server, http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the build locally
```
