# BUSINESS_RULES.md — Mini Stock Take

## 1. Source of truth and daily workflow

The production architecture is Google Apps Script + Google Sheets.

Every working day of Mini Stock Take, the user uploads **two files** for the selected store/session:

1. **System Database** — EXSHELF-like export containing SKU, Rack, Price, System Qty, date, Keepstock, Barcode, Description.
2. **Itemize / Scan Result** — checklist containing exactly **SKU + Rack Number**.

The two files have different jobs:

- **Itemize / Scan Result is the display source.**
- **System Database is lookup-only.**

The System Database is NOT a historical dataset and is NOT archived as a snapshot.

## 2. Itemize controls what appears in Stock Take Entry

A SKU+Rack combination appears in the Midnorth Stock Take Entry table only when it exists in the uploaded Itemize/Scan file.

Therefore:

- System DB row + no matching Itemize row = **NOT DISPLAYED**.
- System DB row at the same Rack + SKU in Itemize = display and enrich from System DB.
- Itemize SKU/Rack not found in System DB = display as `UNKNOWN SKU`.
- Itemize SKU found in System DB but at a different Rack = display as `WRONG RACK`.

System-only rows are never automatically appended to the physical-count form.

## 3. System-only exceptions

The comparison between System DB and Itemize is still important for control/audit:

### 3.1 SKU registered on the same Rack but absent from Itemize

It is a **SYSTEM-ONLY** exception.

It is NOT inserted into the table.

The upload response should report the number of System DB SKU+Rack rows that were not present in Itemize.

### 3.2 SKU has no Rack/Address in System DB and is absent from Itemize

It is also not displayed.

`Rack = ""` is normalized to `NO ADDRESS` only when System Qty > 0. If it is not in Itemize, it remains a System DB lookup/audit exception and never becomes a physical-count line.

### 3.3 Rack = `-`

`-` is normalized to `NO RACK` unconditionally.

## 4. Itemize format

Itemize has no header and exactly two logical columns:

`SKU | Rack Number`

It is a checklist, not a quantity source.

Duplicate SKU+Rack rows have no quantity meaning and are deduplicated.

Itemize uploads are additive within the active session.

## 5. System DB format

Expected logical fields:

1. SKU
2. Rack Number
3. Price
4. System Qty
5. reserved/blank
6. Date
7. Keepstock Box
8. Barcode
9+. Description

The export can contain commas and quotes inside Description. The parser therefore uses the first eight commas as structural separators and treats the remainder as Description.

Barcode is always handled as text to preserve leading zeroes.

## 6. System DB lookup lifecycle

The System DB upload:

1. parses and validates the daily file;
2. clears the previous temporary lookup for that store;
3. writes the current parsed rows into `SYSTEM_DB_LOOKUP`;
4. stores only the current upload's audit rows in `SYSTEM_DB_UPLOAD_AUDIT`;
5. does NOT create a snapshot/history;
6. does NOT archive the source database.

When the stock take session is finalized, the temporary lookup and audit are cleared.

The old `SYSTEM_DB_HISTORY` sheet may exist in stores provisioned by earlier versions, but active code no longer writes to it.

## 7. Stock Take Entry UI

The UI must retain the Qube Back End Stock Take visual structure.

Table columns:

`#No. | Sku Code | Description | Qty Physical | Qty System | Variance`

Mapping:

- `#No.` = generated sequential number;
- `Sku Code` = SKU;
- `Description` = System DB description;
- `Qty Physical` = manual operator entry, starts blank;
- `Qty System` = exact SKU+Rack lookup from today's System DB;
- `Variance` = Qty Physical - Qty System.

Rack Number is shown in the Qube-style header as **Remarks/current rack context**.

No Barcode column is shown.

## 8. Physical Qty

Physical Qty is never derived from Itemize row counts.

It is entered manually.

Blank Physical Qty means not yet counted.

A recount replaces the current Physical Qty and records the old/new values in `PHYSICAL_COUNT_HISTORY`.

## 9. Variance

If Physical Qty is blank, Variance is blank.

If both Physical Qty and exact System Qty exist:

`Variance = Physical Qty - System Qty`

No variance is calculated for UNKNOWN SKU or WRONG RACK until the lookup issue is resolved.

## 10. Finalization

Finalization is blocked when:

- any displayed Itemize line has blank Physical Qty; or
- any displayed line remains `UNKNOWN SKU` or `WRONG RACK`.

This prevents an unresolved lookup line from being treated as System Qty = 0.

## 11. Store isolation

Every operation must resolve the store through MASTER `STORES` and use that store's spreadsheet.

A session from Store A must never read or write Store B data.

## 12. No Supabase/PostgreSQL

Supabase/PostgreSQL is legacy/reference only.

It is not part of the active runtime.


## Daily checking date

Each displayed SKU+Rack line receives `checked_at` when the team successfully enters Physical Qty for the first time.

This field answers the operational question: **how many SKU were checked by the team on a given day?**

Rules:
- System DB upload does not set `checked_at`.
- Itemize upload does not set `checked_at`.
- Opening a rack does not set `checked_at`.
- A valid Physical Qty entry sets `checked_at` if it has not been recorded yet.
- Editing the Physical Qty later does not change the original `checked_at`.
- Daily productivity is counted from `checked_at`, not from `updated_at`.
- `getDailyCheckingSummary()` provides per-day counts for a session.
