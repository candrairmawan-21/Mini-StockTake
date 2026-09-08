# PROCESSING_ENGINE_SPEC.md

## 1. Daily flow

`Login Store -> Create/Resume Session -> Upload System DB -> Upload Itemize -> Open Rack -> Physical Count -> Finalize`

Two uploads are required because they have different roles.

## 2. System DB

System DB is parsed into a temporary per-store lookup.

It is not persisted as historical snapshots.

A new System DB upload replaces the temporary lookup.

## 3. Itemize

Itemize is the authoritative list of physical-count lines.

For each unique SKU+Rack in Itemize:
- exact System DB match -> ITEMIZED
- SKU elsewhere -> WRONG_RACK
- SKU absent -> UNKNOWN_SKU

No System DB-only line is inserted into `STOCK_TAKE_ITEMS`.

## 4. System-only comparison

After Itemize is uploaded, compare Itemize keys with System DB keys.

Report:
- System-only count
- System-only NO ADDRESS count

These are control/audit figures only.

## 5. Working table

`STOCK_TAKE_ITEMS` contains one row per unique Itemize SKU+Rack for the active session.

Fields include:
- session_id
- sku
- rack_number
- price
- system_qty
- physical_qty
- variance_qty
- variance_value
- status
- keepstock_box
- barcode
- description
- created_at
- updated_at

## 6. Rack view

Rack list is derived from `STOCK_TAKE_ITEMS`, therefore from Itemize.

Opening a rack never seeds additional System DB rows.

## 7. Physical Qty

Manual only.

Blank initially.

Saving a value updates the row and records history.

## 8. Variance

`physical_qty - system_qty`

Only calculated when both values exist.

## 9. Finalization

Block if:
- no stock-take lines;
- any Physical Qty is blank;
- any status is UNKNOWN_SKU or WRONG_RACK.

On success calculate:
- total System Qty
- total Physical Qty
- total absolute variance
- total variance value
- accuracy

Then finalize session and clear temporary System DB lookup/audit.

## 10. Store isolation

All reads/writes resolve through MASTER -> STORES -> store spreadsheet.


## Physical checking timestamp

When `savePhysicalQty()` receives a valid Physical Qty for a stock-take line, the engine records `checked_at` only for the first successful check. `updated_at` continues to represent the latest row mutation. This separation is intentional: `checked_at` measures checking productivity, while `updated_at` measures maintenance activity.

`getDailyCheckingSummary(storeCode, sessionId, dateYmd)` can return the number of SKU+Rack lines first checked on a specific Jakarta calendar date. Without `dateYmd`, it returns all daily counts for the session.
