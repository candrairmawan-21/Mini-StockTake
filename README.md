# MIDNORTH MINI STOCK TAKE — Google Sheets / Apps Script

**Architecture:** Google Apps Script + Google Sheets  
**Status:** migration from the previous Supabase/PostgreSQL prototype is now the active direction.

## What changed

The ZIP supplied for review was a TypeScript/Express + PostgreSQL/Supabase implementation. Its business logic is useful, but that backend is no longer the production target.

The active implementation in this package is:

```text
Google Apps Script Web App
        |
        +-- Index.html / App.js / App.css
        |
        +-- Apps Script service functions
        |
        +-- MASTER Spreadsheet
        |      +-- STORES
        |      +-- USERS
        |
        +-- Store Spreadsheet per store
               +-- SYSTEM_DB_HISTORY
               +-- SYSTEM_DB_UPLOAD_AUDIT
               +-- ITEMIZE_HISTORY
               +-- STOCK_TAKE_ITEMS
               +-- SESSIONS
               +-- PHYSICAL_COUNT_HISTORY
               +-- RESULT_SUMMARY
```

The old Supabase/PostgreSQL project is retained only under `legacy-supabase/` for historical/reference purposes. It is **not part of the active runtime**.

## Existing Google Sheets foundation

MASTER spreadsheet:

`MIDNORTH MINI STOCK TAKE - MASTER`

ID:

`1sGSkv-Re6E2Ta9ka05sTGeZ6d5WiF2r6ZKI4UUhuykA`

The previously completed foundation is retained:
- 25 store spreadsheets provisioned.
- Store spreadsheet IDs mapped from MASTER.
- Required store sheets created.
- Empty default `Sheet1` removed.
- Session lifecycle implemented and tested.
- Store/session isolation is checked in Apps Script before store data is read or written.

## UI rule

The supplied Qube Back End Stock Take screenshot is the **actual UI reference**, not merely inspiration.

The current `Index.html` deliberately preserves the ERP/Qube structure:
- top application bar;
- blue toolbar;
- left Inventory navigation;
- Stock Take Preparation;
- Stock Take Entry;
- document-style header;
- status panel on the right;
- table/action areas.

Only the requested business substitutions are made.

### Stock Take table

```text
#No. | Sku Code | Description | Qty Physical | Qty System | Variance
```

Mapping from Qube:
- `#No.` → generated sequentially;
- `Sku Code` → SKU;
- `Description` → Description;
- `Quantity` → Qty Physical;
- `UOM` → Qty System;
- `Barcode` → Variance;
- `ShortDesc` → removed.

`Rack Number` is shown in the Qube-style header as **Remarks/current rack context**.

`Qty Physical` starts blank.

`Variance`:

```text
Qty Physical - Qty System
```

Blank Physical Qty produces blank Variance.

## System DB

Reference file:

`EXSHELF 03-09.txt`

Observed:
- 93,214 physical lines;
- 18 blank lines;
- 93,196 non-blank rows;
- current smart parser accepts 93,190 rows and flags 6 rows in the supplied sample.

The parser is intentionally not a normal quote-aware CSV parser because the source export contains raw commas and quotes inside Description.

It uses the stable first fields:
1. SKU
2. Rack
3. Price
4. System Qty
5. reserved/unused
6. Date
7. Keepstock Box
8. Barcode
9+. Description remainder

It also detects a small class of observed shifted rows where a rack-like value appears before the real rack.

The parser test against the supplied file produced:
- parsed nonblank rows: **93,196**
- valid rows: **93,190**
- invalid/audit rows: **6**

The six currently flagged records are not silently repaired:
- blank SKU;
- blank rack + zero quantity;
- duplicate SKU+Rack;
- two malformed one-field records;
- negative System Qty.

The parser also successfully normalizes the observed shifted rows around source lines 38,386 and 85,422.

## Upload model

A System DB upload creates an immutable `snapshot_id`.

A session can be locked to one System DB snapshot. A second System DB upload to the same session is rejected.

Previous snapshots are never overwritten.

Invalid rows are stored in `SYSTEM_DB_UPLOAD_AUDIT`.

## Itemize

Itemize is a checklist only.

It does **not** create a quantity.

Duplicates for the same SKU + Rack are discarded.

Supported in the active Apps Script implementation:
- CSV/TXT;
- XLSX/XLS with a basic worksheet XML reader.

## Physical Count

Physical Qty is manual.

Rules:
- numeric;
- >= 0;
- blank means not yet counted;
- recount replaces the previous value;
- every change is recorded in `PHYSICAL_COUNT_HISTORY`;
- finalization is blocked while any session line has blank Physical Qty.

## Finalization

Finalization calculates:
- total System Qty;
- total Physical Qty;
- total absolute variance;
- total variance value;
- accuracy.

Accuracy currently follows:

```text
100%, when Total System Qty = 0
otherwise:
((Total System Qty - Total Absolute Variance) / Total System Qty) * 100
```

The final result is stored in `RESULT_SUMMARY`.

## Setup

1. Open Apps Script attached to the project.
2. Add the `.gs` files from `gas/`.
3. Add HTML files:
   - `Index`
   - `App.css`
   - `App.js`
4. Ensure `appsscript.json` is configured.
5. Run `setupMasterSpreadsheet()` once.
6. Ensure MASTER `STORES` contains active stores.
7. Run `setupAllStores()`.
8. Run `cleanupAllStoreDefaultSheets()` if required.
9. Deploy as Web App.

Recommended deployment for internal use: execute as the deploying account and restrict access to the intended organization/users.

## Important

This package does not require:
- PostgreSQL;
- Supabase;
- Express;
- Node.js;
- SQL migrations.

Those are historical reference material only.
