# DATA_FORMAT.md

# Mini Stock Take — Source File Format

**Version:** 2.0  
**Last updated:** 2026-09-02

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

| Business Col | Array Index | Field | Required |
|---:|---:|---|---|
| 1 | 0 | SKU | Yes |
| 2 | 1 | Rack Number | Yes |
| 3 | 2 | Price | Yes |
| 4 | 3 | System Qty | Yes |
| 8 | 7 | Description | No |
| TBD | TBD | Nomor Keepstock / Box Number | Pending verification |

Columns 5–7 are ignored.

### Validation

- SKU required; keep as string to preserve leading zeroes.
- Rack required; `-` is valid.
- Price numeric and >= 0.
- System Qty numeric and >= 0.
- Description optional.
- Duplicate SKU+rack inside one snapshot = validation error; never silently sum/select one.

## 4. Scan Result

| Business Col | Array Index | Field | Required |
|---:|---:|---|---|
| 1 | 0 | SKU | Yes |
| 2 | 1 | Rack Number | Yes |
| 3 | 2 | Scan Qty | No in initial source |

```ts
const COL_SKU = 0;
const COL_RACK = 1;
const COL_SCAN_QTY = 2;
```

Scan Qty, when present, must be numeric and >= 0. Invalid text is an error, not zero.

## 5. Header

Normally the first row is a header and must not become data. Parser must validate that required columns exist before processing.

## 6. Incremental Upload

Scan files are normally additive by rack/day. A later file must not replace previous `scan_results`.

Same `session + SKU + rack` = recount/update, not automatic addition.

Previous values are retained in history.

## 7. System Snapshot Reference

Each Scan Result upload must reference the System DB batch/snapshot used for that upload.

## 8. Rack Normalization

```text
Rack "-" + System Qty > 0 → NO RACK
Rack "-" + System Qty = 0 → exclude/hidden by default
```

Do not change meaningful rack casing/leading zeroes.

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

Production parser is not considered verified until real samples confirm:

- System DB headers/columns;
- Scan Result headers/columns;
- actual Nomor Keepstock position;
- numeric format;
- Keepstock worksheet structure.

## 12. Required Tests

Cover at least: header handling, invalid/missing fields, duplicate rows, leading-zero SKU, `NO RACK`, blank Scan Qty, invalid Scan Qty, multi-day append, recount update, duplicate file, and non-ASCII descriptions.
