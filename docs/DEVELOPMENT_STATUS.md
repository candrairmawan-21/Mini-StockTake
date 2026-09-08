# DEVELOPMENT_STATUS.md

**Version:** 4.0-GS  
**Review date:** 2026-09-08

## Completed before migration

- MASTER → Store Spreadsheet mapping.
- 25 store spreadsheets provisioned.
- Required store sheets created.
- Empty default Sheet1 cleaned.
- Session lifecycle tested:
  - create;
  - get;
  - store isolation;
  - touch;
  - finalize;
  - finalized edit rejection.

## ZIP review

The supplied ZIP was deeply reviewed.

It contains:
- Express/TypeScript backend;
- PostgreSQL persistence;
- Supabase authentication;
- SQL migrations;
- Qube-style frontend;
- System DB parser;
- Itemize parser;
- physical count/finalize workflow.

The business logic is reusable, but the persistence/API/auth stack is not.

## Active migration

The active implementation is now Google Apps Script + Google Sheets.

### Implemented

- Apps Script Web App entrypoint.
- MASTER store lookup.
- Store spreadsheet lookup.
- Session creation/resume.
- Session store isolation.
- System DB snapshot storage.
- Snapshot lock per session.
- Smart System DB parser.
- System DB invalid-row audit.
- Chunked System DB writes.
- Itemize deduplication.
- XLSX/XLS basic Itemize reader.
- Rack form generation.
- Manual Physical Qty.
- Physical Count History.
- Server-side Variance.
- Finalization and Result Summary.
- Qube-style UI retained.

## Supplied System DB verification

`EXSHELF 03-09.txt`:
- 93,214 physical lines.
- 18 blank lines.
- 93,196 nonblank rows.
- 93,190 valid rows.
- 6 audit rows.

The parser successfully handles descriptions containing commas and observed shifted-field records.

## Not yet production-verified

- Full Apps Script Web App deployment.
- Live writes against all 25 stores.
- Full-size 93k-row upload through the browser.
- Production Itemize XLSX variants.
- Keepstock integration.
- PDF generation.
- Official Accuracy formula confirmation.
- Production identity/security policy.

## Current milestone

**Milestone: Google Sheets backend + Qube UI integration foundation**

Next recommended test:

```text
MASTER
  ↓
select store
  ↓
create/resume session
  ↓
upload EXSHELF 03-09.txt
  ↓
verify snapshot + audit count
  ↓
upload Itemize
  ↓
open rack
  ↓
enter Physical Qty
  ↓
verify Variance
  ↓
finalize
```

Do not reintroduce PostgreSQL/Supabase into this path.
