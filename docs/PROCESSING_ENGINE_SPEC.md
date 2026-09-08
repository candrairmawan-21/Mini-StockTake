# PROCESSING_ENGINE_SPEC.md

**Version:** 3.0-GS  
**Last updated:** 2026-09-08

## Active pipeline

```text
Upload System DB
    ↓
Smart Parse
    ↓
Validate + Audit
    ↓
Immutable Snapshot
    ↓
Lock Snapshot to Session
    ↓
Itemize / Rack Checklist
    ↓
Generate Rack Working Form
    ↓
Manual Physical Qty
    ↓
Variance
    ↓
Finalize
    ↓
Result Summary
```

## System DB

One active session uses one locked snapshot.

A second System DB upload for that session is rejected.

System DB rows are written in chunks to Google Sheets.

## Rack generation

When a rack is opened:
1. Resolve the session.
2. Resolve its locked System DB snapshot.
3. Select System DB rows for that rack.
4. Create missing `STOCK_TAKE_ITEMS` rows.
5. Preserve existing Physical Qty.
6. Update `last_active_rack`.
7. Return the rack working view.

## Itemize

Itemize confirms SKU + Rack presence.

It does not create quantity.

A System DB line may still appear even when it was never present in Itemize.

## Physical Qty

Each edit updates one `STOCK_TAKE_ITEMS` row.

Variance is calculated server-side:

```text
physical_qty - system_qty
```

The same calculation is used by finalization.

## Finalization

Blocked if any session line has NULL/blank Physical Qty.

When complete:
- calculate totals;
- append RESULT_SUMMARY;
- set session FINALIZED;
- prevent further normal edits.

## Performance

Google Sheets is used as the operational store. Large System DB writes must use chunked `setValues()` rather than `appendRow()` for every row.

Rack working views should remain rack-scoped. Do not load the complete 93k-row snapshot into the browser.

## UI consistency

The UI and finalization must consume the same stored values and server-side variance rules.

The Qube-style UI is a presentation layer only; it must not become a second calculation engine.
