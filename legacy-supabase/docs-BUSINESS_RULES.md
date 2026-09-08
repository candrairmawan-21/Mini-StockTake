# BUSINESS_RULES.md

# Mini Stock Take — Business Rules

**Version:** 2.2  
**Last updated:** 2026-09-04  
**Status:** Working baseline / SSOT

## Changelog

- **2.2** — **Confirmed business pivot**: quantity is no longer
  derived from counting duplicate Itemize rows (old §6a). Itemize is
  now a checklist only; Physical Qty is always manual entry by the
  PIC (new §6b, §6c). §7, §9, §10, §13–§18, §21 updated accordingly.
  §8 tightened: one System DB snapshot per session, locked for its
  lifetime. This supersedes the COUNT-derived model that was
  previously verified against the real Itemize file — that
  verification is still factually accurate about the file's
  structure, it is the business decision about how to use it that
  changed.
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

## 6. Itemize — Multi-day

**Verified real-file structure** (`Itemize_XWGN_dummy.xlsx`): the file
has **no header row** and only **2 columns**: SKU and Rack Number.
There is no quantity column of any kind.

**Confirmed pivot (superseding the derived-count model below):**
Itemize is a **counting checklist**, not a quantity source. It tells
the app which SKU+Rack combinations exist on the ground for a rack —
nothing more. Duplicate SKU+Rack rows within one Itemize file are
**deduplicated and discarded**; they must **never** be interpreted as
quantity. The physical quantity for every line always comes from
**manual entry** by the PIC (§6b), never from counting rows.

> **History note:** an earlier version of this document (and an
> earlier parser implementation) treated duplicate rows as the
> quantity signal (`scan_qty = COUNT(rows)`), verified against the
> same real file. That model has been **deliberately replaced** by
> direct decision of the business owner — manual entry is the
> intended workflow, not automatic count-from-duplicates. Any code
> still reading/writing `scan_results` (COUNT-based) is legacy and
> must not be used (§8, `DEVELOPMENT_STATUS.md`).

Itemize is incremental. A later file is a separate, independent
upload — it normally covers different racks than a previous day's
file, because racks are not tied to a specific calendar day.

```text
Day 1 → AG01-01, AG01-02
Day 2 → AG01-03, AG01-04
```

Day 2 must not remove Day 1's lines.

## 6a. Itemize Outcomes

When an Itemize row's SKU+Rack is matched against the session's fixed
System DB snapshot (§8):

| Match result | Line status |
|---|---|
| SKU found in this exact Rack | `ITEMIZED` |
| SKU found in System DB, but a different Rack | `WRONG_RACK` |
| SKU not found in System DB at all | `UNKNOWN_SKU` |

A System DB line with no matching Itemize row stays `NOT_SCANNED`
(§10) — form generation seeds every System DB row as `NOT_SCANNED`
first (§6c), and Itemize upload promotes matching rows to `ITEMIZED`.

## 6b. Physical Qty (Manual Entry)

Physical Qty is entered **manually**, one line at a time, by the user
working the rack — regardless of whether that line's status is
`ITEMIZED`, `NOT_SCANNED`, `WRONG_RACK`, or `UNKNOWN_SKU`. It is never
derived from a file.

- Starts `NULL` for every line until entered.
- Must be numeric and `>= 0` when set; negative or invalid text is
  rejected, never silently coerced.
- Every change is recorded in a history/audit trail (previous value,
  new value, who, when) — see §20.
- Editing is blocked once the session is `FINALIZED` (§18).

## 6c. Form Generation

Before Itemize or Physical Qty can be entered for a rack, the
System DB snapshot's rows for that rack are used to seed the working
list (`stock_take_items`), each starting at status `NOT_SCANNED` and
Physical Qty `NULL`. Generating the form again for the same rack must
never overwrite an existing line's Physical Qty or status — it only
adds System DB rows not already present.

## 7. Recount Rule (Physical Qty)

Primary identity:

```text
session_id + SKU + Rack Number
```

If a user re-enters Physical Qty for the same line, it **replaces**
the previous value (not summed), and the change is written to history
(§6b, §20). Re-uploading Itemize for a rack does not touch existing
Physical Qty values — it only affects `ITEMIZED`/`WRONG_RACK`/
`UNKNOWN_SKU` status (§6a).

## 8. System Snapshot Reference

A session is locked to **exactly one** System DB snapshot for its
entire lifetime, set on the first successful System DB upload. All
Itemize uploads and form generation for that session resolve against
this one snapshot — there is no re-upload of System DB mid-session.
(This is stricter than an earlier draft that allowed multiple System
DB snapshots per session; confirmed by the current implementation.)

## 9. Merge Rule

Working result is built from:

```text
System DB (session's locked snapshot) + Itemize outcome + manual Physical Qty + Keepstock
```

Primary key for matching:

```text
SKU + Rack Number
```

An Itemized SKU/rack not found in the session's System DB snapshot is
`UNKNOWN_SKU` (§6a), not silently dropped.

## 10. NOT SCANNED

For the selected rack, every System DB SKU+rack with no matching
Itemize row and no Physical Qty entered must still appear in the
table with status:

```text
NOT_SCANNED
```

Use a red/red-tinted row.

`NOT_SCANNED` blocks finalization (§18) until Physical Qty is entered
— it is a review state during the session, but the confirmed
finalize rule requires every line to have a Physical Qty before the
session can close.

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

**Keepstock is supporting information.** Default physical quantity remains manually-entered Physical Qty (§6b); Keepstock Qty is not automatically added to it.

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

## 13. Physical Qty Validation

- Always starts `NULL` — never derived, always typed in by a user
  (§6b).
- Must be numeric and `>= 0` when set; negative values and invalid
  text are never silently coerced to zero or accepted.
- A line with `Physical Qty = NULL` is `NOT_SCANNED` (§10) and blocks
  finalization (§18) until filled.
- Every change overwrites the previous value and is logged to history
  (§20) — not summed, not appended.

## 14. Variance

For rows eligible for normal comparison:

```text
variance_qty   = physical_qty - system_qty     (NULL until Physical Qty is entered)
variance_value = variance_qty × price
```

`NOT_SCANNED` lines have no variance (`NULL`) until Physical Qty is entered — they are never forced into a 0-qty variance automatically.

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
- Total Physical Qty
- Total Variance Qty
- Total Variance Value
- Accuracy %
- Variance SKU count
- (NOT_SCANNED count will always be 0 at this point — finalize requires every line counted, §18)
- Variance details

## 17. Save & Update

Changing Physical Qty must:

1. authorize user;
2. validate quantity;
3. write current value;
4. write history/audit;
5. recalculate working result;
6. preserve all other racks.

`localStorage` is never the production database.

## 18. Finalization

Before finalization validate:

- every `stock_take_items` line for the session has a non-NULL Physical Qty — **confirmed hard rule**: finalize is blocked while any line is `NOT_SCANNED` (i.e. `physical_qty IS NULL`);
- duplicates resolved;
- SKU/rack/qty valid;
- required System snapshot exists;
- final calculation succeeds.

Then lock the session and snapshot the final summary. A database-level trigger (not just application logic) must also reject edits to a `FINALIZED` session's lines.

## 19. PDF

Provide:

- current rack PDF;
- optional final result PDF.

PDF and UI must consume the same processed/calculated data. No second calculation engine.

## 20. Audit

Minimum audit:

- upload filename/type/time/user/status;
- Itemize source System snapshot reference;
- previous/new Physical Qty for every manual entry/correction;
- finalization user/time;
- final summary snapshot.

## 21. Open Decisions

Do not resolve by guess:

1. ~~Exact System DB column for Nomor Keepstock.~~ **Resolved** — Column 7 (§5, §12a).
2. Exact Keepstock worksheet columns (Google Sheets side — not yet verified via API).
3. Official Accuracy formula.
4. ~~Final treatment of `NOT SCANNED`.~~ **Resolved** — it blocks finalization until Physical Qty is entered (§10, §18); confirmed hard rule, not a policy toggle.
5. ~~Whether blank Scan Qty blocks finalization.~~ **Superseded** — the derived-count Scan Qty model itself was replaced by manual Physical Qty entry (§6–§6c). Every line requiring a non-NULL Physical Qty to finalize is now the confirmed rule (§18), not an open question.
6. Optional refinement: exclude `Rack = "-" AND System Qty = 0` from the working view (not adopted — see §11).
7. ~~Whether any barcode workflow requires quantity accumulation instead of recount semantics.~~ **Moot** — quantity is never derived from any file anymore (§6).
8. ADMIN/SUPERVISOR reopen permissions (reopening a `FINALIZED` session).

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
