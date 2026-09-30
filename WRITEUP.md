# Write-up

## What I built and why

A single virtualized **table**, not a Kanban board, showing all 50,000 deals. The
prompt explicitly allows "a board, a table, a list, or something else," and a table
wins on every constraint that actually matters here:

- **50,000 deals, some stages holding 10,000.** A Trello-style board has to render
  (or virtualize *within*) 7 independently-scrolling columns, one of which holds
  10k cards. That's a much harder virtualization problem than one list, and it
  fights the next requirement.
- **"Move many deals at once."** Multi-select and range-select are native to a
  list/table (click, shift-click, keyboard range) but awkward on a card board,
  where drag-and-drop is the primary interaction and doesn't generalize to "select
  4,000 cards and move them."
- **"Move thousands of old deals to Lost, a few at a time isn't enough."** A board
  answers this with drag-and-drop, which is exactly the wrong tool for bulk work.
  A table answers it with: filter → select all → pick a target stage → done.
- **"Can't use a mouse for long."** A table's rows are naturally keyboard
  addressable (up/down/space/number keys). A card board's 2D layout makes
  keyboard-only navigation much more awkward to design well.
- **"I don't know what to work on today."** A table lets me sort/filter by the
  thing that actually matters — how long a deal has sat untouched — which a board
  can only show as a badge on a card, not as an ordering.

The trade-off: a board gives a better at-a-glance sense of "how much is in each
stage" and feels more native for a *small* team eyeballing a *small* pipeline. I
recovered most of that at-a-glance value without the board's cost: a row of KPI
cards (all deals, open pipeline, at-risk count, open pipeline value) and a row of
clickable per-stage count chips sit above the table, so "how much is in each
stage" is a glance, not a scroll — and clicking a chip filters the table to that
stage, which a board gives you for free by construction. At this scale, I still
don't think a literal board is the job to be done — the job is triage and bulk
hygiene, which a sortable/filterable list does better. I'd revisit this if the team
wanted a literal, low-volume "my 20 active deals" view — see What I'd do with more
time.

### Stack

React + TypeScript + Vite, `@tanstack/react-virtual` for row virtualization, and a
hand-rolled store (no Redux/Zustand) built on `useSyncExternalStore`. I explain the
store below because *how* it's built is the answer to "why does this stay smooth at
50k rows."

## Key UX decisions (and alternatives rejected)

**Default sort: longest-in-current-stage first, not most-recently-touched.**
This directly answers "I don't know what to work on today" — the deals that have
been silently rotting in a stage float to the top, and every row shows its age in
stage with stale ones (≥14 days) highlighted. I considered a separate "Needs
attention" smart filter/tab instead; I rejected it because it's one more piece of
UI to discover, whereas making it the *default sort* means the answer is just
"open the page."

**The view order never changes itself.** Filtering, sorting, and searching all
recompute which rows are visible and in what order — but a save completing, a
retry, or a teammate's edit never does. If it did, rows would jump around under a
user's mouse or keyboard cursor mid-selection, which is exactly the "deals keep
jumping around" complaint in the brief, just self-inflicted instead of
teammate-inflicted. The cost is that the sort can go slightly stale (a deal you
just aged past 14 days won't re-sort to the top until you touch the sort/filter
again); I think that's a clear win over surprise reordering. A manual "re-sort"
affordance is a natural follow-up (see below).

**Selection and bulk actions are additive, not click-to-replace-selection.**
Clicking a row toggles it; shift-click/shift-arrow extends a range; there's no
"click elsewhere to deselect everything" trap, because at 50k rows losing a
2,000-row selection by mis-clicking would be painful. `Esc` and an explicit
"Clear" button are the two ways to reset.

**A visible queue depth, not a spinner that blocks the UI.** Moving 4,000 deals to
Lost at quarter end shouldn't freeze the page waiting for 4,000 requests. Moves are
optimistic and instantaneous in the UI; saves drain through a small concurrency-
capped queue in the background (see below), and the toolbar always tells you how
many are still failed/outstanding.

**Rejected: a Kanban board.** Covered above.

**Rejected: infinite scroll / server-side pagination.** There's no server, and the
brief asks for smoothness at 50k rows in the client, so I virtualize the full set
instead of paging it — paging would also make "select all 50,000 shown" harder to
reason about.

## How failed saves are handled

Every stage move is applied to local state immediately (optimistic), then queued
for a simulated network save. The queue:

- runs at most **6 saves concurrently**, so moving thousands of deals doesn't fire
  thousands of simultaneous requests;
- **retries automatically twice** with exponential backoff (400ms, 800ms) before
  giving up — most of the simulated 1-in-10 failures never need a human to notice;
- on a final failure, marks the row with a **visible ⚠ retry control** (not a
  toast that vanishes and is forgotten — this is the literal "I moved a deal, it
  didn't save, and nobody told me" complaint), and turns the header's sync pill
  into **"N saves need retry."** Clicking it filters the table down to exactly
  those N rows (clearing any other filter), with a "Retry all N" action right
  there and an "Exit" to go back to the full pipeline. The first version of this
  had the pill just call retry-all directly — it fixed the data but not the
  actual complaint, since a rep still had no way to see *which* deals it meant in
  a 50,000-row table. Fixed once that gap was pointed out; verified live that the
  filtered view lands on exactly the failed rows;
- keeps the deal showing its optimistic (moved) value even while failed, rather
  than snapping back — the rep's intent stays visible; they retry in place instead
  of re-doing the move.

An activity log (small, collapsible, off by default) records failures and bulk
actions with timestamps, for anyone who wants an audit trail rather than just the
current state.

**A subtler failure mode:** re-editing a deal while its own previous save is still
in flight (e.g. you move it, then change your mind before that save confirms) used
to create two independent, unrelated save attempts for the same row. Whichever one
settled *last* won — a slow failure for the value you'd already moved away from
could flip the row to "error" even though what's on screen right now saved fine a
moment earlier, and the reverse (a stale success arriving after a real failure)
could silently erase a legitimate error. Every save now carries the deal's version
number at the moment it was initiated; a response is only applied if that version
still matches the deal's current version when it comes back, so a superseded save
becomes a silent no-op instead of clobbering whatever happened after it. I caught
this by tracing the queue code while reasoning about "what if a teammate — or I —
edit a row mid-bulk-move," not from a bug report, and verified both directions
(stale failure, stale success) live before considering it fixed.

## Surviving a reload (local persistence)

"There's no backend" doesn't mean a reload should throw the rep's work away.
Every deal is mirrored into this browser's **IndexedDB**, so closing the tab or
hitting refresh restores the pipeline exactly as it was left — including deals
still sitting in a failed/needs-retry state — rather than regenerating a fresh
50,000-deal set from scratch.

A few decisions made this cheap instead of a performance risk:

- **Writes are batched and debounced, not per-field.** A single mutation marks
  that deal "dirty" and a shared 800ms timer flushes every dirty deal in one
  IndexedDB transaction. Moving 8,000 deals to Lost still results in one write
  transaction shortly after, not 8,000 — the same "don't hammer it per-row"
  principle as the save queue itself.
- **The first paint never waits on IndexedDB.** The app generates its
  (deterministically seeded) baseline synchronously, same as before, so there's
  no loading spinner on startup. A background read from IndexedDB then quietly
  swaps in whatever was persisted, correcting the view moments later if there's
  prior state to restore — the same "patch in place, don't repaint everything"
  mechanism used for teammate updates.
- **An interrupted save doesn't get stuck.** If you reload while a deal is
  mid-save, the in-flight network request is gone — nothing will ever resolve
  it — so on restore, any deal still marked "saving" is automatically requeued
  for a fresh save attempt instead of showing a spinner that spins forever.
- **A visible way to start over.** "Reset demo data" in the API simulator panel
  clears IndexedDB and reloads, for anyone testing who wants a clean pipeline
  again rather than accumulating changes indefinitely.

## How teammates' concurrent changes are handled

A fake "teammates" feed mutates a small random batch of deals on an interval
(both configurable live in Simulate network…), changing stage/owner/amount to
mimic 19 other reps working the same pipeline. Three decisions here:

1. **Local wins.** If a row is mid-save (`syncStatus === "saving"`), an incoming
   teammate change for that same row is dropped rather than overwriting the
   in-flight optimistic value. It's a simple last-writer-wins-for-the-user rule
   that avoids the most jarring case: your own click getting silently reverted a
   moment later by someone else's simulated edit.
2. **No re-sorting, no re-filtering.** As above — a remote change updates that
   one row's cells in place but never reshuffles the list, so it can't yank a row
   out from under your mouse or invalidate a selection you're mid-way through
   building.
3. **A quiet highlight, not an interruption.** An updated-by-someone-else row gets
   a 2.5s highlight flash and a small ↻ glyph; there's no modal, no toast stealing
   focus, no "reload to see changes." You notice it if you're looking at that row,
   and it costs nothing if you're not.

## Performance: how it stays smooth at 50k rows

The two things that would normally kill this at scale — full-list re-renders on
every edit, and O(n) work on every keystroke — are avoided structurally, not
patched over:

- **Virtualization.** `@tanstack/react-virtual` renders only the ~30–50 rows in
  (and just around) the viewport, regardless of whether the table holds 50 or
  50,000 rows.
- **Per-row subscriptions, not a global re-render.** The store keeps deals in a
  plain `Map`, and each row subscribes only to its own id via
  `useSyncExternalStore`. Editing one deal (locally or via the teammate feed)
  re-renders exactly the mounted row components watching that id — not the other
  49,999, and not the list/toolbar. Selection, filters, and sort live in a
  separate small set of "list-level" listeners so that toggling one checkbox
  doesn't touch row components at all beyond the ones on screen.
  (One real bug I hit building this: I initially mutated deal objects in place
  for speed, but `useSyncExternalStore` bails out on an unchanged object
  reference — so I patch a deal by writing a new object into the `Map` on every
  change. Still O(1) per edit, just with a reference bump so React actually
  notices.)
- **Sorting/filtering is O(n) but rare.** Recomputing the visible order is a
  single array filter+sort over 50k items (a few ms), and it only runs when the
  user changes a filter/search/sort — never on a per-row edit, per the "don't
  reorder live" decision above.
- **KPI/stage-count cards are maintained as running totals, not recomputed.**
  A naive version would rescan all 50,000 deals to recompute "open pipeline
  value" or per-stage counts on every render. Instead the store keeps one small
  `Stats` object and adjusts it by a delta whenever a deal's stage or amount
  actually changes (one move, one teammate edit → a handful of arithmetic ops),
  so the cards stay live without an O(n) scan in the hot path. A full rescan
  only runs once at startup and once a minute after, as cheap insurance against
  a deal naturally aging past the "at risk" threshold without being touched.
- **Bounded concurrency on saves**, so a 4,000-row bulk move doesn't open 4,000
  sockets at once; it drains through 6 at a time.

## What I'd do with more time

- **A manual "re-sort now" affordance** (and a subtle badge — "12 deals changed,
  refresh order") so the intentionally-stale sort has an easy way to catch up
  when the user wants it to, instead of only reacting to their own filter change.
- **Undo** for a bulk move — "moved 4,000 deals to Lost" is exactly the kind of
  action that deserves a 5-second undo window, especially since it's triggered by
  a single keystroke.
- **A real bulk-mutation endpoint.** The save queue today still does one PATCH per
  deal (capped at 6 concurrent) — the right call for a handful of moves, but for a
  genuine quarter-end "select 8,000, move to Lost" it means the UI updates
  instantly while the background sync can take several minutes to fully confirm.
  The user-facing action is already solved (one click, not "a few at a time"), but
  a production backend should expose `PATCH /deals/bulk { ids, patch }` as a
  single request instead of N of them, with the server reporting back per-id
  success/failure so the client-side retry/error UI here could stay almost
  unchanged — it would just have one round trip to await instead of thousands.
- **Conflict surfacing beyond last-write-wins** — right now a teammate's change to
  a field you also touched just quietly loses; a real product would want to show
  "Priya also changed this owner 30s ago" rather than silently picking a winner.
- **A "my deals" / "needs attention" saved view** as a lighter-weight alternative
  to remembering to set filters, plus per-owner workload at a glance.
- **Column customization and a persisted view** (filters/sort/column widths in
  localStorage) so a rep's workspace survives a refresh.
- **Real virtualized column resizing/reordering** and CSV export for the "get
  data out" case that always comes up in practice.
- **Automated tests** — I stress-tested the queue, retry, and teammate-merge logic
  by hand via the browser console during development; given more time I'd cover
  the store (`pipelineStore.ts`) with unit tests, especially the retry/backoff and
  selection-range logic, since those are the parts most likely to regress
  silently.
