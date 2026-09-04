# DATA_FORMAT.md

# Mini Stock Take — Source File Format

**Version:** 2.2  
**Last updated:** 2026-09-04

## Changelog

- **2.2** — Confirmed pivot to manual Physical Qty entry
  (`BUSINESS_RULES.md` v2.2). §4 renamed Scan Result → Itemize;
  duplicate-row derivation replaced with plain deduplication (a
  checklist, not a quantity source). §6–§7 updated for the
  one-snapshot-per-session model.
- **2.1** — §3 and §4 rewritten against verified real files
  (`XWGN_-_Tarikan_data_2.txt`, `Itemize_XWGN_dummy.xlsx`). Scan
  Result has **no Scan Qty column and no header** — this is a
  correction, not a refinement, of v2.0's assumption. §5 split by
  file type. §11 verification gate updated.
- **2.0** — Initial structured spec (columns partly unverified).

## 1. Column Numbering

Business columns are **1-based**. Code arrays are **0-based**.

| Business Col | Array Index |
|---:|---:|
| 1 | 0 |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| 8 | 7 |

Use named parser constants, never scattered magic indexes.

```ts
const COL_SKU = 0;
const COL_RACK = 1;
const COL_PRICE = 2;
const COL_SYSTEM_QTY = 3;
const COL_DESCRIPTION = 7;
```

## 2. Supported Formats

`.txt`, `.csv`, `.xls`, `.xlsx`.

## 3. System DB

**Verified real file** (`XWGN_-_Tarikan_data_2.txt`): `.txt`
extension, content is actually **CSV**, UTF-8, CRLF line endings,
**header row present**:

```text
sku,rack number,price,qty,,date,nomor keepstock,barcode,description
```

| Business Col | Array Index | Field | Required |
|---:|---:|---|---|
| 1 | 0 | SKU | Yes |
| 2 | 1 | Rack Number | Yes |
| 3 | 2 | Price | Yes |
| 4 | 3 | System Qty | Yes |
| 5 | 4 | *(unused)* | No — always empty in source |
| 6 | 5 | Date | No — informational only |
| 7 | 6 | Nomor Keepstock / Box Number | No — **verified position**, often blank |
| 8 | 7 | Barcode | No — distinct from SKU |
| 9 | 8 | Description | No |

```ts
const COL_SKU = 0;
const COL_RACK = 1;
const COL_PRICE = 2;
const COL_SYSTEM_QTY = 3;
// index 4 unused
const COL_DATE = 5;
const COL_KEEPSTOCK_BOX = 6;
const COL_BARCODE = 7;
const COL_DESCRIPTION = 8;
```

> **Correction:** v2.0 of this document listed Description at Column
> 8 / index 7 and marked Nomor Keepstock as fully unverified (`TBD`).
> Verified against the real file: Description is Column 9 / index 8,
> and Column 8 / index 7 is Barcode.

### Validation

- SKU required; keep as string to preserve leading zeroes.
- Rack required; `-` is valid (→ `NO RACK`, see §8).
- Price numeric and >= 0. `0.00` is a valid, observed value — not an error.
- System Qty numeric and >= 0.
- Description optional.
- Duplicate SKU+rack inside one snapshot = validation error; never silently sum/select one. Not observed in the verified sample, but must still be handled.

## 4. Itemize

**Verified real file** (`Itemize_XWGN_dummy.xlsx`): Excel, single
sheet, **no header row**, **only 2 columns**.

| Business Col | Array Index | Field | Required |
|---:|---:|---|---|
| 1 | 0 | SKU | Yes |
| 2 | 1 | Rack Number | Yes |

```ts
const COL_SKU = 0;
const COL_RACK = 1;
// no quantity column of any kind exists in the source file
```

> **Correction history:** v2.0 of this document assumed a Column 3 /
> Scan Qty field. Verified against the real file: no such column
> exists. v2.1 then derived a quantity by counting duplicate rows.
> **v2.2 supersedes that**, per confirmed business decision
> (`BUSINESS_RULES.md` §6): Itemize is a checklist only, and the file
> structure facts above are still accurate — only what the app *does*
> with duplicates changed.

### Deduplicating (replaces deriving Scan Qty)

Each row means "this SKU was seen on this Rack." Duplicate rows for
the same SKU+Rack carry **no quantity meaning** and must be collapsed
to a single checklist entry — never counted, never summed.

```text
itemize(SKU, Rack) = { seen: true }   -- one entry per unique SKU+Rack,
                                       -- duplicate rows discarded
```

Verified example from the real file: rows `(8950431, R007)` appear
twice — under the current rule this produces **one** checklist entry
for `(8950431, R007)`, not `scan_qty = 2`. (Historically, before the
confirmed pivot, this same duplication was read as a quantity signal
— see the correction note above; that interpretation is no longer
used.)

```ts
function dedupeItemize(rows: [sku: string, rack: string][]) {
  const seen = new Map<string, { sku: string; rack: string }>();
  for (const [sku, rack] of rows) {
    const key = `${sku}|${rack}`;
    if (!seen.has(key)) seen.set(key, { sku, rack });
  }
  return seen; // key "sku|rack" -> one checklist entry
}
```

The actual physical quantity for every line — whether it came from
Itemize or not — is always entered manually afterward
(`BUSINESS_RULES.md` §6b). This file never supplies a quantity.

## 5. Header

**System DB:** first row is a header and must be skipped (start
parsing from row 2). Verified — see §3.

**Itemize:** **no header row.** Parsing must start from row 1
(index 0). Do not apply the same skip-first-row logic used for System
DB. As a defensive fallback, a parser may heuristically detect an
unexpected header (e.g. first column is not numeric) and skip it, but
the safe default is to skip nothing unless a header is proven present.

Both parsers must validate that required columns exist before
processing.

## 6. Incremental Upload

Itemize files are normally additive by rack/day. A later file must
not remove or replace previously itemized/counted lines in
`stock_take_items`.

Same `session + SKU + rack` uploaded again in a later Itemize file
just re-confirms/updates the checklist status — it never touches an
already-entered Physical Qty (`BUSINESS_RULES.md` §6c).

## 7. System Snapshot Reference

A session is locked to exactly one System DB snapshot for its entire
lifetime (`BUSINESS_RULES.md` §8) — Itemize uploads and form
generation always resolve against that one snapshot, there is no
per-upload snapshot reference to track.

## 8. Rack Normalization

```text
Rack "-" → NO RACK   (unconditional, confirmed — see BUSINESS_RULES.md §11)
```

Do not change meaningful rack casing/leading zeroes. Preserve
`rack_number_raw` as-is; `NO RACK` is only applied at the
normalized/display layer.

## 9. Numeric/Encoding

- Internal SKU = string.
- Qty/Price = decimal/numeric.
- Prefer UTF-8 for text files.
- Locale-specific numeric parsing must be deterministic; never blindly replace punctuation.

## 10. Processing Outcome

Fatal file errors:

```text
FAILED
```

Examples: unreadable file, unsupported format, missing required columns, empty file.

Row-level errors must be recorded. Recommended production rule: do not commit a batch as successful when invalid rows exist.

## 11. Real-File Verification Gate

- System DB headers/columns: **✅ verified** (§3).
- Scan Result headers/columns: **✅ verified** (§4).
- Actual Nomor Keepstock position: **✅ verified** — Column 7 (§3).
- Numeric format: **✅ verified** for System DB (`.` decimal, `DD/MM/YYYY` dates). Not yet verified for Keepstock.
- Keepstock worksheet structure: **❌ not yet verified** — still requires Google Sheets API inspection.

Production parser must still be validated against a broader sample
set (multiple stores/days) before this gate is considered fully
closed — the verification above is based on one System DB export and
one Scan Result export for store XWGN.

## 12. Required Tests

Cover at least: header handling, invalid/missing fields, duplicate rows, leading-zero SKU, `NO RACK`, blank Scan Qty, invalid Scan Qty, multi-day append, recount update, duplicate file, and non-ASCII descriptions.
