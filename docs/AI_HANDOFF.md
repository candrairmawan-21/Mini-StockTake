# MINI STOCK TAKE — AI HANDOFF v12.1
Date: 2026-09-08

## 1. CURRENT ARCHITECTURE — IMPORTANT

Production backend is now **Google Sheets + Google Apps Script**.

Supabase/PostgreSQL is legacy/reference only and must NOT be reactivated.

Master:
`MIDNORTH MINI STOCK TAKE - MASTER`
ID:
`1sGSkv-Re6E2Ta9ka05sTGeZ6d5WiF2r6ZKI4UUhuykA`

25 store spreadsheets have already been provisioned and default `Sheet1` cleaned.

## 2. THE CORRECT DAILY INPUT MODEL

Every day during the Mini Stock Take process, the user uploads **TWO files**:

### File A — System Database
EXSHELF-like database export.

Purpose:
**LOOKUP ONLY.**

It provides, by SKU + Rack:
- SKU
- Rack
- Price
- System Qty
- Keepstock
- Barcode
- Description
- source date

It is NOT the source of which rows appear in Stock Take Entry.

It is NOT archived.
It is NOT saved as historical snapshots.

### File B — Itemize / Scan Result
The supplied real example is:
`Itemize XWGN dummy.xlsx`

It contains exactly:
- SKU
- Rack Number

No quantity.

Purpose:
**This file determines which SKU+Rack rows are displayed in Midnorth Stock Take Entry.**

This distinction is now NON-NEGOTIABLE.

## 3. DISPLAY RULE

Only unique SKU+Rack combinations from Itemize are materialized into `STOCK_TAKE_ITEMS`.

For each Itemize row:

- exact SKU+Rack exists in today's System DB lookup -> `ITEMIZED`
- SKU exists in System DB but at another Rack -> `WRONG_RACK`
- SKU absent from System DB -> `UNKNOWN_SKU`

System DB rows that are not in Itemize are NEVER automatically inserted into the table.

This supersedes the previous model where System DB-only rows were seeded as `NOT_SCANNED`.

## 4. SYSTEM-ONLY EXCEPTIONS

The comparison still matters.

### System DB SKU+Rack exists but not in Itemize
Classify as:
`SYSTEM_ONLY`

Do not display it as a physical-count line.
Report it as a control/audit count.

### System DB SKU has no address/rack and is not in Itemize
Do not display it.

System DB empty Rack is normalized to:
`NO ADDRESS`
only when System Qty > 0.

If it is absent from Itemize, it remains lookup/audit information only.

### Rack `-`
Normalize to:
`NO RACK`

## 5. VERIFIED SAMPLE FILES

### System DB
`EXSHELF 03-09.txt`

Observed:
- 93,214 physical lines
- 18 blank
- 93,196 nonblank
- 93,190 valid
- 6 invalid/audit

Smart parser handles raw commas/quotes in Description and known shifted-field anomalies.

### Itemize
`Itemize XWGN dummy.xlsx`

Observed:
- 11,449 raw rows
- 10,142 unique SKU+Rack
- 1,307 duplicate rows

### Cross-file test
Using the supplied samples:
- exact SKU+Rack: 45
- Itemize SKU exists at another System DB rack: 9,732
- Itemize SKU unknown: 365
- System DB rows absent from Itemize: 93,145

The dummy Itemize file is test data; these numbers are not production quality metrics.

## 6. TEMPORARY SYSTEM DB STORAGE

Because Google Apps Script calls are stateless between browser events, the current implementation uses:

`SYSTEM_DB_LOOKUP`

inside each store spreadsheet as a **temporary working lookup/cache**, not as a historical database.

On System DB upload:
- previous lookup rows are cleared;
- current parsed rows are written;
- current daily audit is replaced;
- existing Itemize rows can be re-enriched;
- no snapshot ID is created.

On session finalization:
- temporary lookup is cleared;
- temporary audit is cleared.

Legacy `SYSTEM_DB_HISTORY`, if present from earlier setup, is deprecated and receives no active writes.

## 7. ACTIVE STORE SHEETS

- SYSTEM_DB_LOOKUP
- SYSTEM_DB_UPLOAD_AUDIT
- ITEMIZE_HISTORY
- STOCK_TAKE_ITEMS
- SESSIONS
- PHYSICAL_COUNT_HISTORY
- RESULT_SUMMARY

`SESSIONS.system_snapshot_id` may still physically exist for backward compatibility but active code does not use it.

## 8. UI — QUBE MUST BE PRESERVED

The Qube screenshot is the actual UI template.

Do NOT redesign it casually.

Preserve:
- top application menu
- toolbar
- left Inventory navigation
- Stock Take Preparation
- Stock Take Entry
- Qube-style document header
- right Status panel
- bottom/action areas
- table structure and ERP visual language

Requested substitutions:

Qube:
`#No. | Sku Code | Description | Quantity | UOM | Barcode`

Midnorth:
`#No. | Sku Code | Description | Qty Physical | Qty System | Variance`

Mapping:
- Quantity -> Qty Physical
- UOM -> Qty System
- Barcode -> Variance
- ShortDesc -> removed

Rack Number is shown in the Qube header under:
`Remarks`

Qty Physical starts blank.

Variance:
`Qty Physical - Qty System`

Blank Physical Qty -> blank Variance.

## 9. PHYSICAL COUNT

Physical Qty is always manual.

Itemize does NOT provide quantity.

Recount replaces the current Physical Qty and records old/new values in `PHYSICAL_COUNT_HISTORY`.

UNKNOWN SKU / WRONG RACK cannot produce a normal System Qty variance.

Finalization is blocked if:
- any displayed line has blank Physical Qty;
- any displayed line remains UNKNOWN SKU;
- any displayed line remains WRONG RACK.

## 10. ACTIVE CODE

Apps Script:
- gas/Config.gs
- gas/Setup.gs
- gas/Session.gs
- gas/SystemDB.gs
- gas/Itemize.gs
- gas/StockTake.gs
- gas/WebApp.gs

UI:
- Index.html
- App.css.html
- App.js.html

## 11. CURRENT CODE CHANGES IN v1.1 / v1.2

`SystemDB.gs`
- no snapshot creation;
- no writes to SYSTEM_DB_HISTORY;
- daily temporary lookup replacement;
- daily audit replacement;
- optional re-enrichment of already uploaded Itemize rows.

`Itemize.gs`
- requires current System DB lookup;
- Itemize is display source;
- System-only rows are not created;
- returns System-only / Wrong Rack / Unknown SKU counts.

`StockTake.gs`
- rack list comes only from Itemize-derived STOCK_TAKE_ITEMS;
- opening a rack never seeds System DB-only rows;
- unresolved lookup lines cannot be physically counted;
- unresolved lookup lines block finalization;
- temporary lookup cleared after finalization.

## 12. NEXT TEST

Deploy current GAS package.

Test exactly:

1. Login/select store.
2. Create/resume session.
3. Upload System DB file.
4. Verify temporary lookup count.
5. Upload Itemize file.
6. Verify only Itemize rows become stock-take lines.
7. Verify System-only count.
8. Open a Rack.
9. Confirm Remarks shows Rack Number.
10. Confirm table is:
   `#No. | Sku Code | Description | Qty Physical | Qty System | Variance`
11. Confirm Physical Qty is blank initially.
12. Enter Physical Qty.
13. Confirm live Variance.
14. Test UNKNOWN SKU.
15. Test WRONG RACK.
16. Test finalization blocking.
17. Finalize and confirm temporary lookup is cleared.

## 13. DO NOT REVERT THESE DECISIONS

- Do not reactivate Supabase/PostgreSQL.
- Do not make System DB the display source.
- Do not seed System DB-only rows.
- Do not derive Physical Qty from Itemize.
- Do not show Barcode as a table column.
- Do not replace Remarks with address.
- Do not redesign the Qube UI without a specific request.

## 8. CHECKING DATE — NEW IN v1.2

The required date is the date/time when the team actually performs the physical SKU check. It is NOT the System DB edit/upload date.

Active field added to `STOCK_TAKE_ITEMS`:
- `checked_at`

Semantics:
- System DB upload -> does not set `checked_at`.
- Itemize upload -> does not set `checked_at`.
- Opening a rack -> does not set `checked_at`.
- First valid Physical Qty entry -> sets `checked_at`.
- Later Physical Qty edits -> preserve the original `checked_at`.
- Clearing Physical Qty -> does not erase the original checking timestamp.
- `updated_at` remains the latest row modification timestamp and must not be used for productivity reporting.

Therefore daily team productivity is calculated from `checked_at`.

New server function:
`getDailyCheckingSummary(storeCode, sessionId, dateYmd)`

With `dateYmd` (`YYYY-MM-DD`), it returns the count for that Jakarta calendar date. Without it, it returns all daily counts for the session.

Example concept:
- 2026-09-08 -> 1,250 SKU checked
- 2026-09-09 -> 400 SKU checked

This counts SKU+Rack lines first checked on each date, not the number of later edits.

## 9. DATABASE SCHEMA — v1.2

`STOCK_TAKE_ITEMS` now ends with:
`created_at`, `updated_at`, `checked_at`

No separate System DB edit-history table is being introduced for this requirement. System DB remains temporary lookup-only data. The persistent operational history for physical quantities remains `PHYSICAL_COUNT_HISTORY`, while `checked_at` provides the first-check timestamp used for daily productivity.

## 10. IMPORTANT IMPLEMENTATION NOTES

- Keep the Qube-style UI unchanged unless a specific UI request is made.
- `Remarks` means Rack Number / rack context.
- Itemize remains the sole source of displayed stock-take rows.
- System DB remains lookup-only.
- System DB-only rows must never be materialized as normal stock-take lines.
- UNKNOWN_SKU and WRONG_RACK must remain unresolved and block finalization.
- Do not treat missing System Qty as zero.
- `checked_at` is the correct field for the question: “berapa SKU yang berhasil team lakukan pengecekan dalam 1 hari?”

## 14. v1.2.1 REPAIR RELEASE

The v1.2 audit found defects outside GAS Session. They are repaired in this release.

### Fixed
1. `Itemize.gs`: XLSX shared strings now read TEXT nodes with `asText().getText()`; the supplied `Itemize XWGN dummy.xlsx` is the target format.
2. `Setup.gs` + `SystemDB.gs`: `SYSTEM_DB_UPLOAD_AUDIT` is aligned to 11 columns; `snapshot_id` is not part of the active audit model.
3. `SystemDB.gs`: `uploadId` and `uploadedAt` are created before the optional audit block, so re-enrichment works whether invalid rows exist or not.
4. `.xls` support was removed from the UI/backend contract because binary legacy XLS is not an OOXML XLSX package. Accepted Itemize formats are `.xlsx`, `.csv`, and `.txt`.
5. `StockTake.gs`: physical-history `changed_by` prefers the current Google account email when exposed by Apps Script, then falls back to the configured store operator.
6. `App.js.html`: after successful finalization, the dead session is cleared and the UI returns to store selection so a new session can be started cleanly.
7. `Session.gs`: active-store filtering again requires a configured spreadsheet ID, and the validated finalized-session regression test is retained.

### Intentionally NOT changed yet
- Store selection is still not full user authentication/authorization.
- `SESSIONS.system_snapshot_id` remains as a legacy compatibility column but is not used by active business logic.
- Daily multi-day session lifecycle remains unchanged because the business rule has not explicitly required one session per calendar day.

### Next validation
Run the repaired package against the two supplied sample files:
- `EXSHELF 03-09.txt`
- `Itemize XWGN dummy.xlsx`

The end-to-end validation must confirm parser counts, temporary lookup replacement, Itemize materialization, WRONG_RACK/UNKNOWN_SKU handling, checked_at, physical variance, finalization blocking, and lookup cleanup.

