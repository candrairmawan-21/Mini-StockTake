# DEVELOPMENT_STATUS.md

## Current architecture
Google Apps Script + Google Sheets is the active production direction.

Supabase/PostgreSQL is legacy/reference only.

## Completed
- MASTER -> per-store spreadsheet provisioning
- 25 store spreadsheets
- default Sheet1 cleanup
- store/session isolation
- session lifecycle
- Qube-style UI
- System DB smart parser
- real System DB parser verification
- Itemize XLSX/TXT/CSV parser
- daily two-file workflow model
- Itemize-driven display rows
- exact SKU+Rack lookup enrichment
- UNKNOWN SKU and WRONG RACK handling
- Physical Qty history
- First physical checking timestamp (`checked_at`)
- Daily checking summary by checking date
- variance
- finalize

## Current two-file model
Daily:
1. System DB -> temporary lookup
2. Itemize/Scan -> display source

System-only rows are comparison/audit only and never become physical-count rows.

## Current next test
Deploy the GAS project and test:
- login
- System DB upload
- Itemize upload
- rack navigation
- physical entry
- variance
- unresolved SKU/rack blocking
- finalize

## Latest change — v1.2

The system now records `checked_at` on each `STOCK_TAKE_ITEMS` line when the team first successfully enters Physical Qty. This is the operational checking date/time and is independent from `updated_at`.

Daily productivity can be read with `getDailyCheckingSummary()`.
