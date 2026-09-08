# AI_HANDOFF.md

# Mini Stock Take — Current Handoff

**Version:** 4.0-GS  
**Date:** 2026-09-08

## Read order

1. BUSINESS_RULES.md
2. DATABASE_SCHEMA.md
3. DATA_FORMAT.md
4. PROCESSING_ENGINE_SPEC.md
5. DEVELOPMENT_STATUS.md
6. CODE_REVIEW.md
7. README.md

## Current architecture

The active system is:

```text
Qube-style Browser UI
        ↓
Google Apps Script Web App
        ↓
MASTER Google Spreadsheet
        ↓
Per-store Google Spreadsheet
```

Supabase/PostgreSQL is deprecated for this project.

The old implementation is preserved only in `legacy-supabase/`.

## Completed foundation

From the prior work:
- MASTER spreadsheet configured.
- 25 store spreadsheets created.
- Required store sheets created.
- Empty Sheet1 removed.
- Session lifecycle implemented and validated.
- Cross-store session access rejected.
- Finalized session edits rejected.

## Current active code

### Apps Script

- `gas/Config.gs`
- `gas/Setup.gs`
- `gas/Session.gs`
- `gas/SystemDB.gs`
- `gas/Itemize.gs`
- `gas/StockTake.gs`
- `gas/WebApp.gs`

### UI

- `Index.html`
- `App.css.html`
- `App.js.html`

The UI is intentionally based directly on the supplied Qube screenshot.

## UI requirements

Preserve the Qube ERP look:
- top menu;
- toolbar;
- left Inventory navigation;
- document-style Stock Take header;
- right Status panel;
- table/action layout.

Required table:

```text
#No. | Sku Code | Description | Qty Physical | Qty System | Variance
```

Mapping:
- Quantity → Qty Physical;
- UOM → Qty System;
- Barcode → Variance.

Rack Number is displayed in the header `Remarks` field/current rack context.

Physical Qty starts blank.

Variance is:

```text
Physical Qty - Qty System
```

Blank Physical Qty → blank Variance.

## System DB

Reference file:
`EXSHELF 03-09.txt`

Parser verification:
- 93,214 physical lines;
- 18 blank;
- 93,196 nonblank;
- 93,190 accepted;
- 6 audited invalid.

The parser:
- preserves commas in Description;
- preserves Barcode as string;
- normalizes `-` to `NO RACK`;
- recognizes observed shifted-field rows;
- audits invalid rows;
- rejects duplicate SKU+Rack after the first valid occurrence.

## Session

A session has:
- session_id;
- store_code;
- status;
- created_at;
- updated_at;
- finalized_at;
- last_active_rack;
- system_snapshot_id.

One active session per store.

One System DB snapshot per active session.

## Next step

The project is ready for live Apps Script testing.

Recommended immediate sequence:

1. Copy `gas/*.gs` into the Apps Script project.
2. Copy the three HTML files.
3. Run `setupMasterSpreadsheet()`.
4. Run `setupAllStores()` only if a new store needs provisioning.
5. Deploy the Web App internally.
6. Login/select a test store.
7. Upload `EXSHELF 03-09.txt`.
8. Verify:
   - valid row count;
   - invalid audit count;
   - snapshot ID;
   - session lock.
9. Upload a real Itemize file.
10. Open one rack.
11. Enter physical quantities.
12. Verify live variance.
13. Test finalize blocking and finalization.

## Important

Do not:
- recreate the Supabase backend;
- recreate SQL migrations as active code;
- redesign the Qube UI without a specific business request;
- calculate variance independently in the browser;
- overwrite an existing System DB snapshot;
- overwrite an existing Physical Qty during form generation.
