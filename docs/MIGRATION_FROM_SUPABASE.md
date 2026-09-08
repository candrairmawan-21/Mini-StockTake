# Migration Note — Supabase/PostgreSQL → Google Sheets

The supplied ZIP was a Supabase/PostgreSQL implementation.

The active project now uses Google Apps Script + Google Sheets.

## Kept

- Qube-style UI structure.
- Session lifecycle concepts.
- System snapshot concept.
- Itemize checklist concept.
- Manual Physical Qty.
- Physical Count History.
- Server-side variance.
- Finalization rules.
- Store/session isolation checks.
- System DB parser strategy for malformed CSV-like export.

## Replaced

- Express HTTP routes → `google.script.run`.
- PostgreSQL tables → MASTER + per-store Google Sheets.
- SQL migrations → `Setup.gs`.
- Supabase bearer auth → Apps Script deployment/organizational access + server-side store/session validation.
- PostgreSQL transactions → Apps Script locks + controlled write sequences.
- REST upload endpoints → Apps Script upload functions.

## Not active

The following are historical only:
- `legacy-supabase/backend`
- `legacy-supabase/frontend`
- SQL migrations

Do not copy them back into the active runtime.
