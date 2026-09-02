# BUSINESS_RULES.md

# Mini Stock Take — Business Rules

**Version:** 2.0  
**Last updated:** 2026-09-02  
**Status:** Working baseline / SSOT

> This document is the business source of truth. If another document or code conflicts with it, this document wins until the business rule is explicitly changed.

## 1. Scope

Mini Stock Take supports physical stock counting for MR DIY Midnorth Java stores. The application must support store login/isolation, daily System DB uploads, incremental multi-day Scan Result uploads, Keepstock lookup, rack-level working results, variance, finalization and PDF output.

## 2. Store Master

- Current store count is approximately 25; **never hard-code the count**.
- Stores may be added/deactivated without code changes.
- `store_code` is the business identifier.
- `store_name` is the store/Keepstock worksheet name.
- Historical sessions must survive store deactivation.

Initial mapping:

| Store Code | Store Name |
|---|---|
| JC2017 | XGSS |
| JC8001 | XBDS |
| JC2021 | XWGN |
| JC1029 | XPRC |
| JC1020 | XRES |
| JC3001 | XWDR |
| JC2001 | SLGD |
| JC2008 | EPPKA |
| JC5005 | XLWU |
| JC6003 | XJLB |
| JC2012 | XBLO |
| JC1014 | XLUN |
| JC2018 | XSRS |
| JC4006 | XSRA |
| JC8005 | XSRG |
| JC3003 | XRMO |
| JC1005 | XKTR |
| JC5002 | XPMH |
| JC1012 | XOYO |
| JC2002 | SLSQ |
| JC5003 | XKTS |
| JC8006 | XDLU |
| JC2016 | XPKL |
| JC1027 | XKLA |
| JC8004 | XKLN |

## 3. Authentication & Store Isolation

- Backend resolves the user's `store_id` from authentication.
- Frontend-supplied `store_id` is never trusted.
- Store users can only access their own store's sessions/data.
- ADMIN/SUPERVISOR may have cross-store permission according to role rules.
- Isolation must be enforced server-side and, where supported, with database RLS.

## 4. Stock Take Session

A session belongs to one store and may span multiple calendar days.

Statuses:

```text
IN_PROGRESS → FINALIZED
```

`FINALIZED` blocks normal store editing. Reopen/unfinalize requires elevated permission and audit.

## 5. System Database

System DB is an expected-inventory **snapshot**.

Required source columns:

| Business Column | Field |
|---:|---|
| 1 | SKU |
| 2 | Rack Number |
| 3 | Price |
| 4 | System Qty |
| 8 | Description |
| TBD | Nomor Keepstock / Box Number |

The exact source position of Nomor Keepstock must be verified from a real file; do not guess it.

Every System DB upload gets its own snapshot/batch. A new snapshot never deletes historical snapshots.

## 6. Scan Result — Multi-day

Scan Result is incremental. A later file normally contains only newly processed racks/items.

```text
Day 1 → AG01-01, AG01-02
Day 2 → AG01-03, AG01-04
```

Day 2 must not replace Day 1.

## 7. Recount Rule

Primary identity:

```text
session_id + SKU + Rack Number
```

If the same SKU+rack is uploaded again, it is a recount/update:

```text
current_scan_qty = latest valid quantity
```

Do **not** sum the old and new values unless the business explicitly changes this rule. Preserve previous values in history/audit.

## 8. System Snapshot Reference

Every Scan Result batch must record the System DB snapshot used for that processing batch. This makes historical results reproducible even after a newer System DB is uploaded.

## 9. Merge Rule

Working result is built from:

```text
System DB + Scan Result + Keepstock
```

Primary key for matching:

```text
SKU + Rack Number
```

A scanned SKU/rack not found in the selected System snapshot remains visible as `UNKNOWN SKU`.

## 10. NOT SCANNED

For the selected rack, every System DB SKU+rack with no Scan Result must still appear at the bottom of the table with status:

```text
NOT SCANNED
```

Use a red/red-tinted row.

`NOT SCANNED` is a review state and must **not** silently become physical qty 0/final missing variance until the final business policy is confirmed.

## 11. Rack `-` → `NO RACK`

```text
Rack = "-" AND System Qty > 0 → NO RACK
```

All such rows belong to one virtual rack `NO RACK`.

Recommended default:

```text
Rack = "-" AND System Qty = 0 → exclude from normal stock-take view
```

## 12. Keepstock

Keepstock is an external master Google Spreadsheet with one worksheet per store.

Current master spreadsheet:

```text
14J84e5XQ9Jddhr0HiEvOe68RgMQwWPt9Ik7ED0VvqFE
```

Minimum fields:

- SKU
- Box Number / Nomor Keepstock
- Qty

A SKU may have multiple boxes:

```text
BOX001: 2
BOX007: 3
BOX013: 1
Total: 6
```

All boxes must be displayable.

**Keepstock is supporting information.** Default physical quantity remains `Scan Qty`; Keepstock Qty is not automatically added to Scan Qty.

No match should display `NO KEEPSTOCK` or `-` consistently.

## 13. Scan Quantity

- Numeric and `>= 0`.
- Zero is valid.
- Negative is invalid.
- Blank may exist in an initial upload but must be reviewed/completed before finalization if required by policy.
- Invalid text must never silently become zero.

## 14. Variance

For rows eligible for normal comparison:

```text
variance_qty   = scan_qty - system_qty
variance_value = variance_qty × price
```

Unresolved statuses such as `NOT SCANNED` must not be forced into normal variance without the applicable final policy.

## 15. Accuracy

Provisional formula:

```text
Accuracy % =
(Total System Qty - Total Absolute Variance Qty)
÷ Total System Qty × 100
```

This formula must be isolated in one calculation service and confirmed against the official business definition before production. Suggested version: `ACC_V1`.

## 16. Final Result

After finalization show:

- Total System Qty
- Total Scan Qty
- Total Variance Qty
- Total Variance Value
- Accuracy %
- Variance SKU count
- NOT SCANNED count
- Variance details
- NOT SCANNED details

## 17. Save & Update

Changing Scan Qty must:

1. authorize user;
2. validate quantity;
3. write current value;
4. write history/audit;
5. recalculate working result;
6. preserve all other racks.

`localStorage` is never the production database.

## 18. Finalization

Before finalization validate:

- duplicates resolved;
- SKU/rack/qty valid;
- required System snapshot exists;
- required racks processed according to policy;
- NOT SCANNED reviewed according to policy;
- final calculation succeeds.

Then lock the session and snapshot the final summary.

## 19. PDF

Provide:

- current rack PDF;
- optional final result PDF.

PDF and UI must consume the same processed/calculated data. No second calculation engine.

## 20. Audit

Minimum audit:

- upload filename/type/time/user/status;
- Scan Result source System batch;
- previous/new Scan Qty for recount/manual update;
- finalization user/time;
- final summary snapshot.

## 21. Open Decisions

Do not resolve by guess:

1. Exact System DB column for Nomor Keepstock.
2. Exact Keepstock worksheet columns.
3. Official Accuracy formula.
4. Final treatment of NOT SCANNED.
5. Whether blank Scan Qty blocks finalization.
6. Treatment of `Rack = -` with System Qty 0.
7. Whether any barcode workflow requires quantity accumulation instead of recount semantics.
8. ADMIN/SUPERVISOR reopen permissions.

## 22. Document Hierarchy

```text
BUSINESS_RULES.md
    ↓
DATABASE_SCHEMA.md
    ↓
DATA_FORMAT.md
    ↓
PROCESSING_ENGINE_SPEC.md
    ↓
DEVELOPMENT_STATUS.md
    ↓
AI_HANDOFF.md
    ↓
README.md
```

Update affected documents before changing production code.
