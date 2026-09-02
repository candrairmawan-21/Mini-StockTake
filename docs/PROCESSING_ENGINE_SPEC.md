# PROCESSING_ENGINE_SPEC.md

# Mini Stock Take — Processing Engine

**Version:** 1.0  
**Last updated:** 2026-09-02

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
4. Parse and validate.
5. Normalize rack.
6. Insert new SKU+rack rows.
7. For existing SKU+rack, write history then update current quantity.
8. Commit.

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

Normalize `Rack = -` with positive System Qty to `NO RACK`.

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
