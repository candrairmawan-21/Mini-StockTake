# PROCESSING_ENGINE_SPEC.md

# Mini Stock Take — Processing Engine

**Version:** 1.1  
**Last updated:** 2026-09-03

## Changelog

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
6. Create immutable System snapshot.
7. Persist rows.
8. Mark batch success/failure.

A newer System DB never deletes an older snapshot.

## 3. Scan Result

1. Resolve authenticated store.
2. Resolve session.
3. Resolve referenced System snapshot.
4. Parse raw rows (SKU, Rack only — **no header, no Scan Qty column**, `DATA_FORMAT.md` §4).
5. Validate SKU/Rack presence per row.
6. Normalize rack (`-` → `NO RACK`).
7. **Group raw rows by (sku, rack_number_normalized) and count them** — this count is the Scan Qty for that pair (`DATA_FORMAT.md` §4). Do this before touching `scan_results`.
8. Insert new SKU+rack rows with the derived count.
9. For existing SKU+rack, write history then update current quantity to the newly derived count (replace, never sum — see `BUSINESS_RULES.md` §7).
10. Commit.

Never replace the complete scan table with the latest file.

## 4. Merge for Selected Rack

### Step A — Scan-driven rows

For each current Scan Result row:

```text
lookup System by SKU + Rack
```

Found → `SCANNED`.

Not found → `UNKNOWN SKU`.

### Step B — Missing System rows

For every System row on the rack with no Scan Result:

```text
NOT SCANNED
```

Append at bottom.

### Step C — Keepstock

Lookup by:

```text
store + SKU
```

Return every box and total qty.

Do not add Keepstock Qty to Scan Qty.

## 5. Rack Ordering

Normalize `Rack = -` to `NO RACK`, unconditionally (`BUSINESS_RULES.md` §11).

Rack list is deterministic/alphanumeric. Within a rack, sort SKU ascending after status grouping.

Recommended row grouping:

1. SCANNED
2. UNKNOWN/WRONG RACK
3. NOT SCANNED

## 6. Variance

```text
variance_qty = scan_qty - system_qty
variance_value = variance_qty × price
```

`NOT SCANNED` remains unresolved (`NULL` variance) until final policy says otherwise.

## 7. Accuracy

Provisional engine version:

```text
ACC_V1
```

```text
(Total System Qty - Total Absolute Variance Qty)
÷ Total System Qty × 100
```

Handle `Total System Qty = 0` explicitly. Do not duplicate this formula in UI/PDF.

## 8. Keepstock Performance

Do not call Google Sheets once per table row.

Preferred:

```text
load worksheet once
→ Map<SKU, boxes[]>
→ enrich all rows in memory
```

Similarly index System/Scan data by:

```text
SKU|RACK
```

## 9. Idempotency

Use file hash + session/store to detect exact duplicate uploads.

Exact duplicate should return a deterministic duplicate result rather than silently duplicating data.

## 10. Finalization

Required gates:

- session exists and belongs to authorized store;
- status is IN_PROGRESS;
- System snapshot exists;
- no fatal processing errors;
- required quantities are valid;
- rack processing requirements are met;
- NOT SCANNED policy is satisfied;
- final calculation succeeds.

Then create `session_result_summary` and set `FINALIZED` atomically.

## 11. PDF

PDF must consume the same processed result service as UI/finalization.

## 12. Acceptance Tests

At minimum:

1. multi-day append;
2. same SKU+rack recount;
3. recount history retained;
4. newer System snapshot does not alter old scan batch reference;
5. NOT SCANNED;
6. UNKNOWN SKU;
7. NO RACK;
8. multiple Keepstock boxes;
9. no Keepstock;
10. invalid quantities;
11. duplicate upload;
12. finalized edit blocked;
13. cross-store access blocked;
14. UI/PDF calculations match.
