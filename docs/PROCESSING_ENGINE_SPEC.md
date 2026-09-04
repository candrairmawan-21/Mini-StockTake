# PROCESSING_ENGINE_SPEC.md

# Mini Stock Take — Processing Engine

**Version:** 1.2  
**Last updated:** 2026-09-04

## Changelog

- **1.2** — Confirmed pivot to manual Physical Qty entry
  (`BUSINESS_RULES.md` v2.2). Pipeline restructured: §2 System DB now
  locks one snapshot per session; new §3 Form Generation; §4 Itemize
  Upload replaces "Scan Result" (dedupe, not count); new §5 Physical
  Qty Entry as its own per-line flow; §6 renamed to a read of
  `stock_take_items` rather than a merge computation; §8 Variance and
  §12 Finalization updated for the manual-entry model.
- **1.1** — §3 Scan Result pipeline updated: added explicit
  count/derive step for Scan Qty (source file has no Scan Qty
  column — see `DATA_FORMAT.md` §4).
- **1.0** — Initial pipeline spec.

## 1. Pipeline

```text
Upload → Parse → Normalize → Validate → Persist Batch → Process → Merge → Keepstock → Variance → Result
```

The same processing output must feed UI, PDF and finalization.

## 2. System DB

1. Create upload batch.
2. Parse required columns.
3. Validate rows.
4. Normalize rack.
5. Reject duplicate SKU+rack within the snapshot.
6. **Reject the upload entirely if the session already has a locked snapshot** — one System DB snapshot per session, for its whole lifetime (`BUSINESS_RULES.md` §8, confirmed pivot v2.2 — a stricter rule than the earlier "multiple snapshots allowed" model).
7. Create immutable System snapshot, lock it to the session.
8. Persist rows (bulk/chunked insert).
9. Mark batch success/failure.

## 3. Form Generation

Run per rack, on demand (e.g. when a user opens that rack), any time
after the System snapshot is locked:

1. Resolve the session's locked System snapshot.
2. Select all System DB rows for the requested rack.
3. For each, insert a `stock_take_items` row at status `NOT_SCANNED`
   with Physical Qty `NULL` — **only if a line for that SKU+rack does
   not already exist**. Never overwrite an existing line (would wipe
   Physical Qty or status).
4. Update `last_active_rack` on the session (resume support).

## 4. Itemize Upload

1. Resolve authenticated store.
2. Resolve session; require its System snapshot to already be locked.
3. Parse raw rows (SKU, Rack only — **no header, no quantity column**, `DATA_FORMAT.md` §4).
4. Validate SKU/Rack presence per row.
5. Normalize rack (`-` → `NO RACK`).
6. **Deduplicate** by (sku, rack_number_normalized) — duplicate rows carry no quantity meaning and are discarded, never counted (`DATA_FORMAT.md` §4, confirmed pivot v2.2).
7. For each deduplicated pair, match against the locked System snapshot:
   - found at this rack → status `ITEMIZED`;
   - found at a different rack → status `WRONG_RACK`;
   - not found at all → status `UNKNOWN_SKU`.
8. Upsert into `stock_take_items`: if a line already exists (e.g. seeded as `NOT_SCANNED` by form generation), update its status only — **never touch `physical_qty`**. If it doesn't exist yet, insert it.
9. Commit.

Never remove or replace previously-itemized lines from an earlier
upload — this stays additive across the session.

## 5. Physical Qty Entry

Not a batch/file operation — one line at a time, from the UI:

1. Authorize user + verify session is `IN_PROGRESS`.
2. Validate the new value (`BUSINESS_RULES.md` §13: numeric, `>= 0`, or `NULL` to clear).
3. Read the current value for history.
4. Write the new value to `stock_take_items.physical_qty` (replace, never sum/add — `BUSINESS_RULES.md` §7).
5. If changed, write a `physical_count_history` row (previous, new, who, when).
6. Commit.

## 6. Working View for Selected Rack

`stock_take_items` already holds the merged state per rack (seeded by
Form Generation, updated by Itemize and Physical Qty Entry) — this
step is a read, not a merge computation:

```text
SELECT ... FROM stock_take_items WHERE session_id = ? AND rack_number_normalized = ?
```

Status shown per line (`DATABASE_SCHEMA.md` "Working Result"):

- `UNKNOWN_SKU` / `WRONG_RACK` — Itemize found this SKU but it doesn't match the session's System snapshot at this rack.
- `NOT_SCANNED` — no Itemize match yet, or `physical_qty IS NULL`.
- Otherwise — has a Physical Qty, considered counted.

### Keepstock enrichment

Lookup by:

```text
store + SKU
```

Return every box and total qty. Do not add Keepstock Qty to Physical
Qty.

## 7. Rack Ordering

Normalize `Rack = -` to `NO RACK`, unconditionally (`BUSINESS_RULES.md` §11).

Rack list is deterministic/alphanumeric. Within a rack, sort SKU ascending after status grouping.

Recommended row grouping:

1. Counted (has Physical Qty)
2. `UNKNOWN_SKU` / `WRONG_RACK`
3. `NOT_SCANNED`

## 8. Variance

```text
variance_qty = physical_qty - system_qty      -- NULL while physical_qty is NULL
variance_value = variance_qty × price
```

A line with `physical_qty IS NULL` has `NULL` variance — it is never
computed against an implicit 0.

## 9. Accuracy

Provisional engine version:

```text
ACC_V1
```

```text
(Total System Qty - Total Absolute Variance Qty)
÷ Total System Qty × 100
```

Handle `Total System Qty = 0` explicitly. Do not duplicate this formula in UI/PDF.

## 10. Keepstock Performance

Do not call Google Sheets once per table row.

Preferred:

```text
load worksheet once
→ Map<SKU, boxes[]>
→ enrich all rows in memory
```

Similarly index System/Itemize data by:

```text
SKU|RACK
```

## 11. Idempotency

Use file hash + session/store to detect exact duplicate uploads
(applies to both System DB and Itemize uploads).

Exact duplicate should return a deterministic duplicate result rather than silently duplicating data.

## 12. Finalization

Required gates:

- session exists and belongs to authorized store;
- status is `IN_PROGRESS`;
- System snapshot exists (session-locked, §2);
- no fatal processing errors;
- **every `stock_take_items` line has a non-NULL `physical_qty`** — confirmed hard rule (`BUSINESS_RULES.md` §18), not a policy toggle;
- final calculation succeeds.

Then create `session_result_summary` and set `FINALIZED` atomically.
A database trigger additionally rejects edits to a finalized
session's lines, independent of this application-layer check.

## 13. PDF

PDF must consume the same processed result service as UI/finalization.

## 14. Acceptance Tests

At minimum:

1. multi-day Itemize append (does not remove earlier lines);
2. re-uploading Itemize for an already-itemized SKU+rack does not touch its Physical Qty;
3. manual Physical Qty correction (previous value replaced, not summed);
4. Physical Qty change history retained;
5. only one System DB snapshot accepted per session — second upload attempt rejected;
6. duplicate Itemize rows within one file collapse to one checklist entry, never a count;
7. `NOT_SCANNED` blocks finalize until Physical Qty entered;
8. `UNKNOWN_SKU`;
9. `WRONG_RACK`;
10. `NO RACK`;
11. multiple Keepstock boxes;
12. no Keepstock;
13. invalid Physical Qty rejected (negative/non-numeric);
14. duplicate upload (idempotency);
15. finalized edit blocked at both application and database-trigger level;
16. cross-store access blocked;
17. UI/PDF calculations match.
