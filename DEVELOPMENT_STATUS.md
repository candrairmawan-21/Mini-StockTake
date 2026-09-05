# DEVELOPMENT_STATUS.md

# Mini Stock Take — Development Status

**Version:** 3.1  
**Review date:** 2026-09-04

## Changelog

- **3.1** — HTTP layer built and tested end-to-end against a real
  PostgreSQL instance (not just typechecked): resolve session → upload
  System DB → open rack → upload Itemize → save Physical Qty →
  finalize, plus the finalize-lock trigger and duplicate-snapshot
  rejection. This testing found and fixed a real bug in
  `workingView.ts` (a line counted directly, without ever being
  Itemized, incorrectly stayed labeled `NOT SCANNED` forever — status
  label priority was wrong). The `session.ts` duplication flagged in
  3.0 is resolved: `getRackWorkingView`/`assignSystemSnapshot` removed
  from `session.ts`, which now only owns session lifecycle.
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
   src/api/*.ts                               <- core logic, called by src/http/
   src/http/*.ts                              <- Express HTTP layer, tested end-to-end (§2)
```

The old prototype has not been touched or replaced yet — it is still
what a user would actually see if they opened `index.html` today. The
new `backend/` code, including its HTTP layer, is real, typechecked,
and tested end-to-end against a real PostgreSQL instance — but it has
**no auth** (§4) and **no frontend calling it yet**. It is reachable
over HTTP, but not safe to expose to real users.

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
| Working view (rack-scoped read) | `src/api/workingView.ts` | ✅ done — canonical version, status-label bug fixed after e2e testing (§ Changelog 3.1) |
| Finalize (blocks on incomplete Physical Qty, writes summary) | `src/api/finalize.ts` | ✅ done, e2e tested |
| Session resolve/resume/resume-state (`last_active_rack`, one active session per store) | `src/api/session.ts` | ✅ done — lifecycle only, duplication resolved (§3) |
| HTTP layer (Express) over all of the above | `src/http/*.ts` | ✅ done, e2e tested against real PostgreSQL |

## 3. Dead Code & Duplication

**Genuinely dead** (superseded by the confirmed pivot, unused by anything, still reads/writes the deprecated `scan_results`/`scan_result_history` tables):

- `backend/legacy/scanResult.ts` — the old COUNT-derivation parser.
- `backend/legacy/uploadScanResult.ts` — writes to `scan_results`. Not imported anywhere. (Both already moved to `legacy/`.)

**Resolved (was flagged in v3.0, fixed in 3.1):** `session.ts`'s
`getRackWorkingView` and `assignSystemSnapshot` duplicated
`workingView.ts` and `systemDbSnapshot.ts` respectively. Both were
removed from `session.ts`, which now only owns session lifecycle
(`resolveActiveSession`, `updateLastActiveRack`,
`getSessionResumeState`). The HTTP layer imports the canonical
versions only.

## 4. What's Still Missing

- **Auth middleware.** Every route in `src/http/*Routes.ts` currently
  trusts `storeId`/`userId`/`uploadedBy`/`finalizedBy` sent directly
  in the request body — flagged with warning comments in the code
  itself and in `backend/README.md`. This is the top-priority gap:
  `DATABASE_SCHEMA.md` §7 is explicit that this must not reach real
  users.
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
| HTTP API | ✅ done, e2e tested (Express, chosen over Next.js since frontend framework is undecided) |
| Frontend (new) | ❌ not started |

## 6. Do Not

- Do not use `localStorage` as business persistence (old prototype only).
- Do not add critical authorization to frontend only, once a frontend exists.
- Do not write to `scan_results`/`scan_result_history` — deprecated (§3).
- Do not derive Physical Qty from counting Itemize duplicates — confirmed superseded (`BUSINESS_RULES.md` §6).
- Do not guess Keepstock worksheet columns.
- Do not duplicate variance/accuracy formulas outside `finalize.ts`/`workingView.ts`.
- Do not expose `src/http/*` to real users before auth middleware exists (§4) — every route currently trusts client-supplied identity.

## 7. Recommended Build Order (from here)

1. ~~Clean up dead code + resolve duplication.~~ **Done** (§3).
2. ~~HTTP layer.~~ **Done, e2e tested** (§2).
3. **Auth middleware** — Supabase Auth + role check + store resolution from session, applied to every route currently in `src/http/*Routes.ts`. This is the next step.
4. **Keepstock integration** — Google Sheets API client, populate `keepstock_cache`, wire into `workingView.ts`.
5. **Frontend** — new UI (or migrate the old `index.html` UX) that calls the HTTP layer.
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
