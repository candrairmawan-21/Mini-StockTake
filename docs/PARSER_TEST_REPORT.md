# SYSTEM DB PARSER TEST REPORT

**File:** `EXSHELF 03-09.txt`  
**Test date:** 2026-09-08  
**Parser:** `gas/SystemDB.gs`

## Result

| Metric | Count |
|---|---:|
| Physical lines | 93,214 |
| Blank lines | 18 |
| Nonblank rows considered | 93,196 |
| Valid rows | 93,190 |
| Invalid/audit rows | 6 |

## Smart corrections verified

Two observed malformed/shifted records were successfully realigned:

- source line 38,386:
  - final Rack: `AG07-01`
  - Price: `9000`
  - System Qty: `0`
  - Barcode: `8979473`
  - Description: `LINT ROLLER 10CM#811`

- source line 85,422:
  - final Rack: `C02`
  - Price: `14500`
  - System Qty: `47`
  - Barcode: `9084875`
  - Description: `STATIONERY SET 2006#`

## Invalid rows retained for audit

The remaining six rows are not silently corrected:

1. Blank SKU.
2. Blank Rack + System Qty 0.
3. Duplicate SKU + Rack.
4. One-field malformed record.
5. One-field malformed record.
6. Negative System Qty.

They are written to `SYSTEM_DB_UPLOAD_AUDIT` when an upload is performed.

## Important

This is a parser verification result, not proof that the entire production upload flow has been tested in Apps Script. The next live test must upload the actual file through the Web App and verify the same counts in the target store spreadsheet.
