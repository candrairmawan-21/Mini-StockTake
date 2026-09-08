# DATABASE_SCHEMA.md

**Version:** 3.0-GS  
**Last updated:** 2026-09-08

This is a Google Sheets schema. SQL migrations are no longer active.

## MASTER Spreadsheet

### STORES

| Column | Meaning |
|---|---|
| store_code | unique business identifier |
| store_name | store display name |
| spreadsheet_id | target store spreadsheet |
| active | active/inactive |

### USERS

| Column | Meaning |
|---|---|
| store_code | store mapping |
| user_name | operational username |
| active | active/inactive |

## Store Spreadsheet

### SYSTEM_DB_HISTORY

`snapshot_id | uploaded_at | sku | rack_number | price | system_qty | date | keepstock_box | barcode | description`

Historical rows are append-only.

### SYSTEM_DB_UPLOAD_AUDIT

`upload_id | snapshot_id | uploaded_at | source_line | raw_line | reason | parsed_sku | parsed_rack | parsed_price | parsed_qty | parsed_barcode | parsed_description`

### ITEMIZE_HISTORY

`upload_id | uploaded_at | session_id | sku | rack_number`

### STOCK_TAKE_ITEMS

`session_id | sku | rack_number | price | system_qty | physical_qty | variance_qty | variance_value | status | keepstock_box | barcode | description | created_at | updated_at`

### SESSIONS

`session_id | store_code | status | created_at | updated_at | finalized_at | last_active_rack | system_snapshot_id`

### PHYSICAL_COUNT_HISTORY

`history_id | session_id | sku | rack_number | old_qty | new_qty | changed_at | changed_by`

### RESULT_SUMMARY

`session_id | finalized_at | total_system_qty | total_physical_qty | total_absolute_variance_qty | total_variance_value | accuracy`

## Relationships

```text
MASTER.STORES
    |
    +--> Store Spreadsheet
             |
             +--> SYSTEM_DB_HISTORY
             |       |
             |       +--> locked by SESSIONS.system_snapshot_id
             |
             +--> ITEMIZE_HISTORY
             |
             +--> STOCK_TAKE_ITEMS
             |       |
             |       +--> PHYSICAL_COUNT_HISTORY
             |
             +--> RESULT_SUMMARY
```

## Isolation

A store operation resolves its spreadsheet from MASTER using `store_code`.

A supplied session ID is accepted only when it exists in that store's SESSIONS sheet and its `store_code` matches.

## Historical model

- System snapshots are immutable.
- Physical count changes are append-audited.
- Final summaries are appended.
- No SQL database is required.
