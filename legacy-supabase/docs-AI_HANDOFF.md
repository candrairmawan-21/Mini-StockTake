# AI_HANDOFF.md

# Mini Stock Take — AI Handoff

**Version:** 2.4  
**Last updated:** 2026-09-05

## Changelog

- **2.4** — Auth middleware built (`src/http/auth.ts`) and wired into
  every route. Authorization logic verified against real data;
  Supabase integration itself not yet tested (no sandbox network
  access to Supabase). §3/§4 updated to match.
- **2.3** — HTTP layer built and e2e tested against real PostgreSQL;
  `session.ts` duplication resolved. §3/§4 updated to match.
- **2.2** — Confirmed pivot to manual Physical Qty entry reflected
  throughout (§2, §2a, §5). §3/§4 updated to describe the real
  `backend/` code that now exists (was purely aspirational before).
  New non-negotiable rules for the `NO ADDRESS` case (empty rack,
  confirmed conditional on System Qty > 0) and one-snapshot-per-session.
- **2.1** — Added §2a Verified Facts. §5 Open Decisions trimmed of
  items resolved by real-file verification and business confirmation.
- **2.0** — Full rewrite (English, handoff protocol).

## 1. Read Order

```text
1. BUSINESS_RULES.md
2. DATABASE_SCHEMA.md
3. DATA_FORMAT.md
4. PROCESSING_ENGINE_SPEC.md
5. DEVELOPMENT_STATUS.md
6. AI_HANDOFF.md
7. README.md
```

`BUSINESS_RULES.md` is the SSOT.

## 2. Non-Negotiable Rules

1. Never hard-code the number of stores.
2. Backend/database enforces store isolation.
3. Working identity = session + SKU + Rack.
4. Itemize files are additive across days — never remove earlier lines.
5. New Itemize uploads do not replace old racks' lines.
6. **Physical Qty is always manual entry — never derived from counting Itemize rows** (confirmed pivot v2.2; supersedes the earlier COUNT-derivation model).
7. Re-entering Physical Qty for the same line replaces the value (not summed) and is logged to history.
8. A session is locked to exactly **one** System DB snapshot for its whole lifetime — no re-upload mid-session.
9. System-only rows must appear as `NOT_SCANNED` until Physical Qty is entered.
10. `NOT_SCANNED` **blocks finalization** — confirmed hard rule, not a policy toggle.
11. `Rack = "-"` becomes `NO RACK`, unconditionally (not conditioned on System Qty).
12. `Rack = ""` (truly empty, distinct from `-`) becomes `NO ADDRESS`, but **only when System Qty > 0**; with System Qty = 0 the row is rejected (no location, nothing to track).
13. Keepstock is supporting information, not automatically added to Physical Qty.
14. All Keepstock boxes for a SKU must be displayable.
15. Finalized sessions are locked at both application and database-trigger level.
16. `localStorage` is not production persistence.
17. Do not guess Keepstock worksheet columns (Nomor Keepstock's System DB position is already verified — Column 7).
18. Accuracy is provisional (`ACC_V1`) until confirmed.
19. UI/PDF/finalize use the same processing engine/service — never a second calculation path.
20. Never write to `scan_results`/`scan_result_history` — deprecated, kept for rollback reference only.

## 2a. Verified Facts (Do Not Re-Ask)

Confirmed against real files (store XWGN: `XWGN_-_Tarikan_data_2.txt`,
`Itemize_XWGN_dummy.xlsx`) plus direct business confirmation:

- System DB is 9 columns, **not RFC4180-quoted CSV** (raw commas as
  Indonesian decimal separators and raw quote chars as inch marks
  appear unescaped in Description) — parse by splitting the first 8
  commas only, treat the remainder as Description verbatim. UTF-8,
  header present. Full mapping in `DATA_FORMAT.md` §3.
- Itemize is 2 columns (SKU, Rack) **only**, **no header**, no
  quantity column of any kind.
- **Physical Qty is always manual entry** (confirmed business
  decision, superseding the earlier verified-but-since-changed
  COUNT-derivation model). Itemize is a checklist only — duplicate
  SKU+Rack rows in it are deduplicated and carry no quantity meaning.
- Nomor Keepstock (Box Number) = System DB Column 7.
- `Rack = "-"` → `NO RACK`, unconditionally.
- `Rack = ""` (empty string, distinct from `-`) → `NO ADDRESS`, but
  only valid when System Qty > 0; System Qty = 0 rows with empty rack
  are rejected.
- A session locks to exactly one System DB snapshot for its lifetime
  — confirmed by the current implementation (`systemDbSnapshot.ts`),
  stricter than an earlier draft that allowed multiple snapshots.

## 3. Current Repository Reality

Two things coexist and are **not connected to each other**:

- `index.html`, `css/style.css`, `js/app.js` — the original frontend
  prototype (localStorage + Google Apps Script). Untouched, still not
  production architecture.
- `backend/` — real, typechecked, end-to-end tested backend code
  (migrations, parsers, core logic, Express HTTP layer, and auth
  middleware — `src/http/auth.ts`, Supabase Auth + role + store/session
  isolation). Store isolation is enforced and its logic is verified
  against real data. **Not yet integration-tested against a real
  Supabase project** (this sandbox has no network access to Supabase),
  no user-provisioning flow, no rate limiting/CORS, no frontend calls
  into it yet.

Full gap list in `DEVELOPMENT_STATUS.md`.

## 4. Next Mission

Per `DEVELOPMENT_STATUS.md` §7, in order:

1. ~~Delete dead code, resolve `session.ts` duplication.~~ **Done.**
2. ~~Build the HTTP layer.~~ **Done, e2e tested** (`src/http/*`).
3. ~~Add auth middleware.~~ **Built, authorization logic verified**
   (`src/http/auth.ts`). Remaining before production: integration-test
   against a real Supabase project (untested in this sandbox — no
   network access to Supabase), add a user-provisioning flow (nothing
   currently creates a `users` row when someone signs up in Supabase),
   add rate limiting/CORS.
4. **Keepstock Google Sheets integration** — this is the next step.
5. Frontend that actually calls the new backend.
6. Reconnect PDF export to the new backend's data.

## 5. Open Decisions

Do not guess:

- Keepstock worksheet schema (Google Sheets side).
- official accuracy formula;
- reopen permissions for a `FINALIZED` session.

Resolved and no longer open: exact Nomor Keepstock source column
(Column 7); System DB / Itemize column structure; Physical Qty is
always manual entry, never derived (confirmed pivot v2.2 — this also
retires the earlier "blank Scan Qty"/"recount accumulation" questions
entirely, since there is no file-derived quantity anymore); `NOT_SCANNED`
blocks finalization (confirmed hard rule); Rack `-` → `NO RACK`
unconditional; Rack `""` → `NO ADDRESS` only when System Qty > 0; one
System DB snapshot per session, locked for its lifetime.

## 6. Handoff Protocol

Whenever a business/design decision changes:

```text
update BUSINESS_RULES
→ update affected schema/format/engine docs
→ update DEVELOPMENT_STATUS
→ update AI_HANDOFF
→ then change code
```

Every AI handoff should state:

```text
Changed:
Verified:
Not verified:
Open decisions:
Next step:
```

## 7. Verification

Once the target stack exists, run the actual scripts in `package.json`, at minimum:

```bash
git status
git log -5 --oneline
npm install
npm run lint
npm test
npm run build
```

## 8. Stop Conditions

Stop and ask for clarification if a real source file conflicts with the docs, Keepstock differs from assumptions, accuracy policy changes, NOT SCANNED treatment changes, recount semantics change, or store isolation cannot be guaranteed.

## 2026-09-06 — Web integration milestone

Current repository state is intentionally focused on getting the real system running end-to-end.

### New in this milestone
- Cleaned repository structure: technical documentation is under `docs/`.
- Added `frontend/` minimal browser UI served by Express.
- Browser flow: Supabase login -> `/sessions/resolve` -> System DB upload -> Itemize upload -> rack open -> manual Physical Qty save -> finalize.
- Added `GET /config` for public Supabase browser configuration and kept service-role credentials out of the frontend.
- Added `GET /sessions/:sessionId/racks` for rack progress data.
- Removed an unused Itemize query from form generation.

### Important implementation boundary
The frontend is a first integration shell, not the final visual product. Do not reintroduce localStorage as a source of truth. Postgres/session APIs remain authoritative.

### Immediate next step
Run the backend against the real Supabase/Postgres project and complete one real browser E2E using a real store user. Then improve counting UX, Keepstock, Storage, PDF, and deployment hardening in that order.
