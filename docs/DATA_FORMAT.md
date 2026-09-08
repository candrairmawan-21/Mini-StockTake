# DATA_FORMAT.md

**Version:** 3.0-GS  
**Last updated:** 2026-09-08

## System DB

Reference: `EXSHELF 03-09.txt`.

The export is CSV-like text without a reliable RFC4180 structure. The first 8 positions are stable; Description is the remainder.

| Position | Field |
|---:|---|
| 1 | SKU |
| 2 | Rack Number |
| 3 | Price |
| 4 | System Qty |
| 5 | unused |
| 6 | Date |
| 7 | Keepstock Box |
| 8 | Barcode |
| 9+ | Description |

### Rules

- SKU is string.
- Rack is string.
- Price is numeric >= 0.
- System Qty is numeric >= 0.
- Date is `DD/MM/YYYY`.
- Keepstock Box is string.
- Barcode is string.
- Description is free text.
- Extra commas in Description are preserved.
- `-` Rack becomes `NO RACK`.
- blank Rack becomes `NO ADDRESS`; blank Rack + System Qty 0 is rejected.
- Duplicate SKU + Rack in one snapshot is flagged/audited; the first valid occurrence is retained.

### Known malformed source behavior

The supplied file contains a small number of shifted rows where a rack-like field appears before the real rack. The parser detects the observed pattern and realigns it without guessing arbitrary values.

## Supplied-file parser verification

For `EXSHELF 03-09.txt`:
- physical lines: 93,214
- blank lines: 18
- nonblank rows considered: 93,196
- accepted rows: 93,190
- audited invalid rows: 6

The six invalid rows are preserved for audit and are not silently fixed.

## Itemize

Itemize is a checklist:
- SKU
- Rack Number

No quantity is derived from duplicate Itemize rows.

Supported active formats:
- TXT/CSV;
- XLSX/XLS basic worksheet reader.

## Encoding

Use UTF-8 for text uploads.

Do not coerce SKU or Barcode to numeric values.
