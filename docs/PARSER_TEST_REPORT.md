# PARSER_TEST_REPORT.md

## System DB
Reference: `EXSHELF 03-09.txt`

Observed:
- 93,214 physical lines
- 18 blank lines
- 93,196 nonblank
- 93,190 valid
- 6 invalid/audit rows

The parser handles commas/quotes in Description and observed shifted-field anomalies.

## Itemize
Reference: `Itemize XWGN dummy.xlsx`

Observed:
- 11,449 raw rows
- 10,142 unique SKU+Rack rows
- 1,307 duplicate rows

The first two columns are SKU and Rack Number, with no business quantity.

## Cross-file comparison
Using the supplied sample files:
- exact SKU+Rack matches: 45
- Itemize SKU exists in System DB but at another Rack: 9,732
- Itemize SKU not found in System DB: 365
- unique Itemize rows: 10,142
- System DB rows not present in Itemize: 93,145

This is a test-data comparison. The dummy Itemize file is not assumed to represent production match quality.

## Display rule
Only the 10,142 unique Itemize SKU+Rack rows are candidates for display. System-only rows are not inserted.


## v1.2.1 repair validation

The following runtime defects identified in v1.2 were repaired:
- XLSX shared-string text nodes now use the Text-node API instead of `asElement()`.
- `SYSTEM_DB_UPLOAD_AUDIT` header count now matches the 11-value audit rows.
- System DB upload timestamp/upload ID are created in outer scope and are available to re-enrichment.
- Itemize accepts `.xlsx`, `.csv`, and `.txt`; binary `.xls` is no longer advertised or routed to the XLSX parser.
- Physical-count audit prefers the active Google account email when Apps Script exposes it, with configured operator fallback.
- Finalized sessions return the browser to the store/session entry screen instead of leaving a dead session in the ERP view.
- The previously validated Session lifecycle behavior is preserved and a regression test function is included.
