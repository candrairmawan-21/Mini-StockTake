# DATABASE_SCHEMA.md

## MASTER Spreadsheet

### STORES
- store_code
- store_name
- spreadsheet_id
- active

### USERS
- store_code
- user_name
- active

## Store Spreadsheet

### SYSTEM_DB_LOOKUP
Temporary daily lookup only. Replaced on every System DB upload.

- sku
- rack_number_raw
- rack_number_normalized
- price
- system_qty
- date
- keepstock_box
- barcode
- description

### SYSTEM_DB_UPLOAD_AUDIT
Temporary audit for the current daily System DB upload.

The audit schema has no `snapshot_id` because System DB is lookup-only and no historical snapshot is created.

- upload_id
- uploaded_at
- source_line
- raw_line
- reason
- parsed_sku
- parsed_rack
- parsed_price
- parsed_qty
- parsed_barcode
- parsed_description

### ITEMIZE_HISTORY
- upload_id
- uploaded_at
- session_id
- sku
- rack_number

Itemize history belongs to the active stock-take session and is additive.

### STOCK_TAKE_ITEMS
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
- checked_at

Only Itemize/Scan rows become stock-take lines.

### SESSIONS
- session_id
- store_code
- status
- created_at
- updated_at
- finalized_at
- last_active_rack
- system_snapshot_id (legacy compatibility field; active code does not use it)

### PHYSICAL_COUNT_HISTORY
- history_id
- session_id
- sku
- rack_number
- old_qty
- new_qty
- changed_at
- changed_by

### RESULT_SUMMARY
- session_id
- finalized_at
- total_system_qty
- total_physical_qty
- total_absolute_variance_qty
- total_variance_value
- accuracy

## Legacy

`SYSTEM_DB_HISTORY` may remain physically present from earlier versions but is deprecated and must not be used by active code.

## Checking-date semantics

`STOCK_TAKE_ITEMS.checked_at` is the first successful physical-count timestamp for the SKU+Rack line in the active stock-take session.

It is **not** the System DB upload date and it is **not** the last edit time. It is the source of truth for daily checking productivity.

The timestamp is written when the team first saves a valid Physical Qty. Later quantity edits do not replace the original `checked_at`. Clearing/re-entering a quantity also does not erase the original checking timestamp.
