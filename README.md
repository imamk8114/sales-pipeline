# Pipeline

A frontend for a 50,000-deal sales pipeline shared by ~20 reps. Built with React,
TypeScript, and Vite. There is no backend — a fake API inside the app simulates
network latency, save failures, and teammates editing the same deals concurrently.

## Run it

```bash
npm start
```

This installs dependencies and starts the dev server at `http://localhost:5173`.
(Equivalent to `npm install && npm run dev` if you prefer two steps.)

Other scripts: `npm run build` (typecheck + production build), `npm run preview`.

## What it is

A single dense, virtualized table (not a Trello-style board — see write-up for why),
showing all 50,000 deals at once with client-side filtering, sorting, multi-select,
and bulk stage moves. Every save is optimistic, queued, retried automatically on
failure, and surfaced with a per-row status indicator plus a global "N failed saves"
action. A "Simulate network…" panel lets you crank up latency/failure rate and
teammate-edit frequency live to see how the UI holds up.

Your changes are written to this browser's IndexedDB as you make them, so
reloading the page (or closing and reopening the tab) picks up right where you
left off — moves, retries, and any still-failed saves all survive a reload,
instead of the pipeline resetting to a fresh generated set. "Reset demo data"
in the API simulator panel wipes local storage and starts over.

## Keyboard

- `↑` / `↓` — move the active row
- `Shift + ↑ / ↓` — extend selection
- `Space` — toggle selection on the active row
- `Cmd/Ctrl + A` — select all currently filtered rows
- `1`–`7` — move the active row (or the whole selection) to that stage
- `/` — focus search
- `Esc` — clear selection

See `WRITEUP.md` for the design rationale, trade-offs, and what's next.
