# DATA_FORMAT.md

## 1. System Database — daily lookup file

The daily System DB is an EXSHELF-like text/CSV export.

Typical logical structure:

`SKU,Rack Number,Price,System Qty,,Date,Keepstock Box,Barcode,Description`

There may be no header row in the actual export.

Stable fields:
- 0 SKU
- 1 Rack
- 2 Price
- 3 System Qty
- 4 reserved
- 5 Date
- 6 Keepstock Box
- 7 Barcode
- 8+ Description remainder

Description may contain commas and quotes.

Barcode must remain a string.

## 2. System DB lifecycle

System DB is uploaded every working day as a temporary lookup source.

It is not archived as a snapshot.

Active store sheet:
- `SYSTEM_DB_LOOKUP`
- `SYSTEM_DB_UPLOAD_AUDIT`

The lookup is cleared on finalization and replaced by the next daily upload.

## 3. Itemize / Scan Result

Itemize has no header.

Exactly two logical columns:

`SKU | Rack Number`

Each row means:

> this SKU was seen on this Rack.

It does not contain quantity.

Duplicate SKU+Rack rows are deduplicated.

## 4. Matching

Primary key:

`SKU + normalized Rack`

Outcomes:
- exact match -> `ITEMIZED`
- SKU exists elsewhere -> `WRONG_RACK`
- SKU does not exist -> `UNKNOWN_SKU`

Only Itemize rows are materialized into `STOCK_TAKE_ITEMS`.

System-only rows are not materialized.

## 5. Rack normalization

- `-` -> `NO RACK`
- empty Rack in System DB + System Qty > 0 -> `NO ADDRESS`
- empty Rack + System Qty = 0 -> rejected

## 6. Physical Qty

Physical Qty is manual and blank initially.

It is not supplied by Itemize.

## 7. UI fields

`#No. | Sku Code | Description | Qty Physical | Qty System | Variance`

Rack is shown in Remarks/current-rack header.

## 8. Validation

System DB parser audits:
- blank SKU;
- invalid price;
- invalid System Qty;
- blank rack + zero qty;
- duplicate SKU+Rack;
- observed structural anomalies.

Itemize parser validates presence of SKU and Rack and deduplicates SKU+Rack.
