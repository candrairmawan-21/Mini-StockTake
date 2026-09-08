# CODE_REVIEW.md

## Review conclusion

The original ZIP contains a mature TypeScript/Express/PostgreSQL implementation with useful business logic.

Its active backend is no longer appropriate because the project has moved to Google Sheets + Apps Script.

## UI
The Qube-style UI is retained directly.

Requested substitutions:
- Quantity -> Qty Physical
- UOM -> Qty System
- Barcode -> Variance
- Rack Number -> Remarks/current rack context

## Business logic retained
- SKU+Rack identity
- Itemize deduplication
- System DB enrichment
- UNKNOWN SKU
- WRONG RACK
- manual Physical Qty
- variance
- recount history
- finalize controls

## Business model corrected
The old implementation seeded System DB-only rows into the form as NOT_SCANNED.

This is no longer active.

The current requirement is:
**Itemize/Scan Result determines the rows shown in Stock Take Entry.**

Therefore:
- System-only same-rack SKU -> audit/control only, not displayed
- System DB SKU with no address and absent from Itemize -> not displayed
- Itemize exact match -> normal row
- Itemize SKU at different system rack -> WRONG RACK
- Itemize SKU absent from System DB -> UNKNOWN SKU

## Current storage
System DB is temporary `SYSTEM_DB_LOOKUP`, replaced daily and cleared after finalize.

No historical System DB snapshots are created.
