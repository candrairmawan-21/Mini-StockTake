# BUSINESS_RULES.md

# Mini Stock Take — Business Rules

**Version:** 2.1  
**Last updated:** 2026-09-03  
**Status:** Working baseline / SSOT

## Changelog

- **2.1** — Reconciled with real source-file verification performed
  outside this thread (`XWGN_-_Tarikan_data_2.txt`,
  `Itemize_XWGN_dummy.xlsx`) and direct confirmation from the
  business process owner. §5, §6, §11 corrected from "TBD"/assumed to
  verified facts. §21 Open Decisions updated: items #1 and (partly)
  #6 resolved.
- **2.0** — Full rewrite (English, SSOT structure).

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

**Verified real-file structure** (`XWGN_-_Tarikan_data_2.txt`): the
file has a `.txt` extension but its content is CSV, UTF-8, CRLF line
endings, **with a header row**:

```text
sku,rack number,price,qty,,date,nomor keepstock,barcode,description
```

Required source columns (1-based, verified against the real file):

| Business Column | Field | Notes |
|---:|---|---|
| 1 | SKU | Internal ID — merge key |
| 2 | Rack Number | `-` = not yet placed on a rack (see §11) |
| 3 | Price | |
| 4 | System Qty | |
| 5 | *(unused)* | Always empty in the source |
| 6 | Date | Informational only, not used in calculations |
| 7 | Nomor Keepstock (Box Number) | **Verified** — see §12a |
| 8 | Barcode | Distinct from SKU (e.g. EAN code) — never used as merge key |
| 9 | Description | |

> **Correction from earlier drafts:** Description is Column **9**, not
> Column 8 (Column 8 is Barcode). This was previously marked as an
> unverified assumption and has now been confirmed against the real
> file.

Every System DB upload gets its own snapshot/batch. A new snapshot never deletes historical snapshots.

## 6. Scan Result — Multi-day

**Verified real-file structure** (`Itemize_XWGN_dummy.xlsx`): the scan
file has **no header row** and only **2 columns**: SKU and Rack
Number. **There is no Scan Qty column at all.** One row = one physical
unit scanned. If the same SKU is scanned multiple times on the same
rack, it appears as multiple duplicate rows. Scan Qty must be
**derived**, not read — see §7a.

Scan Result is incremental. Per direct confirmation from the process
owner: a later file is a **separate, independent file** — it normally
covers different racks than a previous day's file, because racks are
not tied to a specific calendar day.

```text
Day 1 → AG01-01, AG01-02
Day 2 → AG01-03, AG01-04
```

Day 2 must not replace Day 1.

## 6a. Deriving Scan Qty

```text
scan_qty(SKU, Rack) = COUNT(rows) with the same SKU + Rack Number
                       within a single uploaded file
```

Example from the verified real file: SKU `8950431` appears twice on
rack `R007` → `scan_qty = 2`.

The parser must `GROUP BY sku, rack_number` and count rows before
persisting to `scan_results` — this replaces any prior assumption of
reading a "Scan Qty column" from the source file.

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

**Confirmed business decision:** all System DB rows with `Rack = "-"`
are grouped as one virtual rack called `NO RACK`, unconditionally —
regardless of System Qty.

```text
Rack = "-" → NO RACK
```

> An earlier draft proposed excluding `Rack = "-" AND System Qty = 0`
> rows from the view entirely. The business owner confirmed the
> simpler unconditional rule above; the qty-based exclusion is **not**
> adopted and is kept only as a possible future refinement (§21).

The raw `-` value is preserved as-is in the database; `NO RACK` is a
display/grouping label applied at the application layer, not a data
transformation.

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

## 12a. Nomor Keepstock in System DB (Verified)

The System DB "Nomor Keepstock" column (Column 7, §5) **is confirmed
to be the Keepstock Box Number** referenced in §12. It is often blank
(items with no active Keepstock box).

- When populated (e.g. `B249`), the application may display it
  directly as a Box Number without a live Google Sheets lookup for
  that specific field.
- **Keepstock Qty is still never available from System DB** — it
  always requires the Google Sheets lookup (§12).
- This column holds only **one** value per row. A SKU with multiple
  boxes is not fully representable by this column alone — that case
  still relies on the Google Sheets lookup for the complete box list.

## 13. Scan Quantity

- Since Scan Qty is **derived** by counting rows (§6a), a SKU+Rack
  combination that has at least one row always has `scan_qty >= 1` —
  it can never be blank or zero as a direct upload artifact.
- A SKU+Rack combination with **no rows at all** in the scan file is
  not "blank Scan Qty" — it is simply absent, and becomes `NOT
  SCANNED` (§10).
- Manual correction of a scan_qty value (outside the derived-from-file
  flow, e.g. a supervisor override) must still be numeric and `>= 0`;
  negative values and invalid text are never silently coerced to zero.

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

1. ~~Exact System DB column for Nomor Keepstock.~~ **Resolved** — Column 7 (§5, §12a).
2. Exact Keepstock worksheet columns (Google Sheets side — not yet verified via API).
3. Official Accuracy formula.
4. Final treatment of `NOT SCANNED` (does it ever become a final missing/variance decision, and under what policy).
5. ~~Whether blank Scan Qty blocks finalization.~~ **Superseded** — Scan Qty is always derived from row count (§6a, §13); "blank Scan Qty" as an upload state no longer applies. Whether an entirely-unscanned rack blocks finalization is still open.
6. Optional refinement: exclude `Rack = "-" AND System Qty = 0` from the working view (not adopted — see §11).
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
