# DEVELOPMENT_STATUS.md

# Mini Stock Take — Development Status

**Version:** 3.0  
**Review date:** 2026-09-04

## Changelog

- **3.0** — Full re-review: real backend code now exists
  (`backend/`), not just a frontend prototype. Confirmed pivot to
  manual Physical Qty entry (`BUSINESS_RULES.md` v2.2) reflected
  throughout. Feature matrix rebuilt against actual files in the
  repo, not aspirational phases. Dead-code cleanup flagged as a new
  gap.
- **2.1** — Blockers #1–2 (real System DB / Scan Result samples)
  resolved via direct file verification. Parser gap section rewritten
  with concrete findings instead of general statements.
- **2.0** — Full rewrite (English, gap analysis).

## 1. Current Reality

Two things now coexist in the repo:

```text
index.html + css/style.css + js/app.js      <- old frontend prototype
        ↓
localStorage / Google Apps Script            <- still not production-ready, untouched

backend/                                     <- new, real backend code
   migrations/001,002,003.sql                <- schema, tested against verified real files
   src/parsers/systemDb.ts, itemize.ts        <- tested against real files, working
   src/api/*.ts                               <- core logic functions, NOT yet exposed over HTTP
```

The old prototype has not been touched or replaced yet — it is still
what a user would actually see if they opened `index.html` today. The
new `backend/` code is real, typechecked, and (for the parsers) tested
against real files, but there is **no HTTP server wiring it up yet**
and **no new frontend consuming it**. Nothing in `backend/` is reachable
by an end user yet.

## 2. What's Actually Done (backend/)

| Piece | File | Status |
|---|---|---|
| Schema (sessions, snapshots, System DB rows) | `migrations/001_init_schema.sql` | ✅ done |
| Schema (Itemize + manual Physical Qty workflow) | `migrations/002_physical_count_workflow.sql`, `003_finalize_physical_workflow.sql` | ✅ done, supersedes 001's `scan_results` |
| System DB parser | `src/parsers/systemDb.ts` | ✅ done, tested against real 93,150-row file |
| Itemize parser | `src/parsers/itemize.ts` | ✅ done — dedupes, matches confirmed pivot |
| System DB bulk import (chunked insert, session-locked snapshot) | `src/api/systemDbSnapshot.ts` | ✅ done |
| Form generation (seed rack checklist from System DB) | `src/api/formGeneration.ts` | ✅ done |
| Itemize upload → match/status | `src/api/uploadItemize.ts` | ✅ done |
| Manual Physical Qty entry + history | `src/api/physicalCount.ts` | ✅ done |
| Working view (rack-scoped read) | `src/api/workingView.ts` | ✅ done |
| Finalize (blocks on incomplete Physical Qty, writes summary) | `src/api/finalize.ts` | ✅ done |
| Session resolve/resume/resume-state (`last_active_rack`, one active session per store) | `src/api/session.ts` | ✅ done — but duplicates parts of `workingView.ts`/`systemDbSnapshot.ts` (§3) |

## 3. Dead Code & Duplication — Needs Cleanup

**Genuinely dead** (superseded by the confirmed pivot, unused by anything, still reads/writes the deprecated `scan_results`/`scan_result_history` tables):

- `backend/legacy/scanResult.ts` — the old COUNT-derivation parser.
- `backend/legacy/uploadScanResult.ts` — writes to `scan_results`. Not imported anywhere. (Both moved to `legacy/` already — see this repo.)

**Not dead, but duplicated** — `src/api/session.ts` has grown its own
`getRackWorkingView`, `assignSystemSnapshot`, and
`getSessionResumeState`, each already correctly using
`stock_take_items` (not the deprecated tables), but overlapping with
logic that already exists elsewhere:

- `session.ts`'s `getRackWorkingView` vs `workingView.ts`'s
  `getRackWorkingViewV2` — nearly identical query, two names, two
  places to keep in sync if the shape changes.
- `session.ts`'s `assignSystemSnapshot` vs `systemDbSnapshot.ts`'s
  own snapshot-locking `UPDATE` inside `importSystemDbSnapshot` —
  two different code paths that both claim to be "the" way a
  session's `system_snapshot_id` gets set.

Recommendation: before building the HTTP layer (§7), pick **one**
canonical function for each of these and delete the other — otherwise
the HTTP layer will end up calling whichever one a route happens to
import, silently diverging over time.

## 4. What's Still Missing

- **HTTP layer.** Every function in `src/api/*.ts` takes a `Pool`
  and plain arguments — none of it is wired to an actual server
  (Express/Next.js API routes/etc.) or reachable by a client yet.
- **Auth middleware.** No Supabase Auth integration, no role check
  (`STORE_USER`/`SUPERVISOR`/`ADMIN`), no store-from-session
  resolution enforced anywhere in the current code.
- **Frontend.** No UI consumes any of `backend/` yet — the old
  `index.html`/`js/app.js` prototype is unrelated and unconnected.
- **Keepstock integration.** No Google Sheets API client exists;
  `keepstock_sheet_mapping`/`keepstock_cache` tables exist in schema
  but nothing populates or reads them.
- **PDF generation** against the new backend (the old prototype's
  jsPDF export is not connected to any of this).
- **Idempotency check** (file hash dedup) — schema has `file_hash`
  columns but no code checks them before importing.

## 5. Feature Matrix

| Feature | Status |
|---|---|
| Dynamic store master | ✅ schema |
| Backend auth | ❌ not started |
| Store isolation enforcement | ❌ not started (schema supports it; no code enforces it yet) |
| Session resume (one active session, `last_active_rack`) | ✅ done |
| System snapshot (locked, one per session) | ✅ done |
| Itemize checklist (dedup, status matching) | ✅ done |
| Manual Physical Qty entry + history | ✅ done |
| Keepstock | ❌ not started |
| NOT_SCANNED | ✅ done (form generation seeds it) |
| NO RACK / NO ADDRESS normalization | ✅ done (verified against real data) |
| Variance Qty/Value | ✅ done (`workingView.ts`, `finalize.ts`) |
| Accuracy | ✅ done (`ACC_V1`, `finalize.ts`) — formula itself still unconfirmed as *official* |
| Finalize (blocks on incomplete count, DB-level lock trigger) | ✅ done |
| Final Summary | ✅ done (`session_result_summary`) |
| Rack PDF | ⚠️ only in the disconnected old prototype |
| Audit (upload batches, physical count history) | ✅ schema + code for physical count; upload batch audit fields exist but aren't fully populated by any code path yet |
| HTTP API | ❌ not started |
| Frontend (new) | ❌ not started |

## 6. Do Not

- Do not use `localStorage` as business persistence (old prototype only).
- Do not add critical authorization to frontend only, once a frontend exists.
- Do not write to `scan_results`/`scan_result_history` — deprecated (§3).
- Do not derive Physical Qty from counting Itemize duplicates — confirmed superseded (`BUSINESS_RULES.md` §6).
- Do not guess Keepstock worksheet columns.
- Do not duplicate variance/accuracy formulas outside `finalize.ts`/`workingView.ts`.

## 7. Recommended Build Order (from here)

1. **Clean up dead code + resolve duplication** (§3) — delete the two genuinely-dead `legacy/` files once confirmed unneeded, and pick one canonical implementation for the overlapping `session.ts` functions before more code is built on top of either version.
2. **HTTP layer** — wrap existing `src/api/*.ts` functions as routes (Next.js API routes or Express), one per operation (upload System DB, generate form, upload Itemize, save Physical Qty, get working view, finalize).
3. **Auth middleware** — Supabase Auth + role check + store resolution from session, applied to every route in step 2.
4. **Keepstock integration** — Google Sheets API client, populate `keepstock_cache`, wire into `workingView.ts`.
5. **Frontend** — new UI (or migrate the old `index.html` UX) that calls the HTTP layer from step 2.
6. **PDF** — reconnect PDF export to read from the new backend's working view, not local state.

## 8. Current Blockers

1. ~~Real System DB sample needed to verify columns.~~ **Resolved.**
2. ~~Real Scan Result/Itemize sample needed to verify actual export behavior.~~ **Resolved.**
3. Keepstock worksheet structure not yet verified.
4. ~~Nomor Keepstock source column not verified.~~ **Resolved** — Column 7.
5. Official Accuracy formula not confirmed (implementation uses `ACC_V1` as a placeholder, isolated so it's easy to swap).
6. ~~Final NOT SCANNED policy not confirmed.~~ **Resolved** — blocks finalize (§18 v2.2).
7. Verification above covers one store (XWGN) only — broader sample set recommended before fully closing the parser verification gate.

## 9. Production Definition

Production-ready only when: HTTP layer + auth/isolation exist and are
tested; Keepstock is integrated; a frontend actually calls this
backend; source formats, database, multi-day behavior, Physical Qty
history, NOT_SCANNED handling, variance value, accuracy, finalization,
audit and PDF consistency are all tested end-to-end against real
data — not just unit-tested in isolation.
