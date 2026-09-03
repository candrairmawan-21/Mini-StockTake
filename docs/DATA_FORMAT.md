# DATA_FORMAT.md

# Mini Stock Take — Source File Format

**Version:** 2.1  
**Last updated:** 2026-09-03

## Changelog

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

## 4. Scan Result

**Verified real file** (`Itemize_XWGN_dummy.xlsx`): Excel, single
sheet, **no header row**, **only 2 columns**.

| Business Col | Array Index | Field | Required |
|---:|---:|---|---|
| 1 | 0 | SKU | Yes |
| 2 | 1 | Rack Number | Yes |

```ts
const COL_SKU = 0;
const COL_RACK = 1;
// no Scan Qty column exists in the source file
```

> **Correction:** v2.0 of this document assumed a Column 3 / Scan Qty
> field ("No in initial source"). Verified against the real file:
> **there is no such column at all, ever.** This is not a case of an
> optionally-blank field — the column does not exist.

### Deriving Scan Qty (replaces reading a column)

Each row represents **one physical unit scanned**. Scan Qty is
derived by counting duplicate rows:

```text
scan_qty(SKU, Rack) = COUNT(rows) with the same SKU + Rack Number
                       within one uploaded file
```

Verified example from the real file: rows `(8950431, R007)` appear
twice → `scan_qty = 2`. Across 11,449 rows in the sample, 10,142
unique SKU+Rack pairs were found, of which 1,021 had `scan_qty > 1`.

```ts
function deriveScanQty(rows: [sku: string, rack: string][]) {
  const counts = new Map<string, number>();
  for (const [sku, rack] of rows) {
    const key = `${sku}|${rack}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts; // key "sku|rack" → scan_qty
}
```

Scan Qty, once derived, is always `>= 1` for any pair that appears in
the file. It is never read, and never blank, as a source value.

## 5. Header

**System DB:** first row is a header and must be skipped (start
parsing from row 2). Verified — see §3.

**Scan Result:** **no header row.** Parsing must start from row 1
(index 0). Do not apply the same skip-first-row logic used for System
DB. As a defensive fallback, a parser may heuristically detect an
unexpected header (e.g. first column is not numeric) and skip it, but
the safe default is to skip nothing unless a header is proven present.

Both parsers must validate that required columns exist before
processing.

## 6. Incremental Upload

Scan files are normally additive by rack/day. A later file must not replace previous `scan_results`.

Same `session + SKU + rack` = recount/update, not automatic addition.

Previous values are retained in history.

## 7. System Snapshot Reference

Each Scan Result upload must reference the System DB batch/snapshot used for that upload.

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
