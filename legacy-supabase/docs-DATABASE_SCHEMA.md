# DATABASE_SCHEMA.md

# Mini Stock Take — Database Schema

**Version:** 2.4  
**Last updated:** 2026-09-04

## Changelog

- **2.4** — Confirmed pivot to manual Physical Qty entry
  (`BUSINESS_RULES.md` v2.2). `scan_results`/`scan_result_history`
  marked deprecated (kept for rollback reference only, not written
  to); added `stock_take_items` and `physical_count_history` as their
  replacements. `session_result_summary.total_scan_qty` renamed to
  `total_physical_qty`. §6 transaction flow updated.
- **2.3** — §5 expanded to "Indexing & Performance": scale reference
  grounded in verified real data (93,150 SKU rows for one store),
  bulk-insert strategy, rack-scoped pagination requirement, and
  when (not yet) to consider partitioning.
- **2.2** — `stock_take_sessions` gains `last_active_rack` and a
  unique partial index enforcing one `IN_PROGRESS` session per store,
  supporting the multi-day resume flow.
- **2.1** — Reconciled with verified real-file structure
  (`BUSINESS_RULES.md` v2.1). `system_inventory_rows` gains
  `source_date` and `barcode`; `keepstock_box_number` source column
  confirmed (no longer TBD).
- **2.0** — Full rewrite (snapshot model, recount history).

Derived from `BUSINESS_RULES.md`.

## 1. Data Layers

```text
RAW UPLOAD → PROCESSED/CURRENT DATA → FINAL SNAPSHOT
```

Never overwrite historical raw uploads or finalized data.

## 2. Tables

### `stores`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| store_code | varchar(20) | UNIQUE |
| store_name | varchar(100) | UNIQUE |
| is_active | boolean | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### `users`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| store_id | uuid | FK; nullable for global admin |
| username/email | varchar | UNIQUE |
| role | varchar(30) | STORE_USER/SUPERVISOR/ADMIN |
| auth_provider_id | varchar | external identity |
| is_active | boolean | required |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

### `stock_take_sessions`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| store_id | uuid | FK |
| session_code | varchar(50) | UNIQUE |
| start_date | date | required |
| status | varchar(20) | IN_PROGRESS/FINALIZED |
| last_active_rack | varchar(50) | nullable; last rack the user was working on, for resume |
| finalized_at | timestamptz | nullable |
| finalized_by | uuid | FK |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

**One active session per store.** Enforced with a unique partial
index — prevents two `IN_PROGRESS` sessions existing for the same
store at once:

```sql
CREATE UNIQUE INDEX one_active_session_per_store
ON stock_take_sessions (store_id)
WHERE status = 'IN_PROGRESS';
```

**Resume flow:** on store login, the backend looks up the store's
`IN_PROGRESS` session. If found, load it (including
`last_active_rack` to reopen where the user left off) instead of
creating a new one. If not found, create a new session. This is how
"stop today, continue tomorrow" works — no special resume feature is
needed beyond this lookup, as long as every save writes to this
database rather than to local/browser storage.

### `upload_batches`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| upload_type | varchar(30) | SYSTEM_DATABASE/SCAN_RESULT |
| file_name | varchar(255) | required |
| file_hash | varchar(128) | recommended |
| storage_path | text | raw file |
| upload_date | date | required |
| uploaded_by | uuid | FK |
| reference_system_batch_id | uuid | required for Scan Result in production |
| processing_status | varchar(20) | PENDING/PROCESSING/SUCCESS/PARTIAL/FAILED |
| row_count | integer | parsed rows |
| valid_row_count | integer | valid rows |
| invalid_row_count | integer | invalid rows |
| error_message | text | nullable |
| created_at | timestamptz | required |

### `system_inventory_snapshots`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| upload_batch_id | uuid | UNIQUE FK |
| snapshot_date | date | required |
| created_at | timestamptz | required |

### `system_inventory_rows`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| snapshot_id | uuid | FK |
| sku | varchar(50) | required |
| rack_number_raw | varchar(50) | source value |
| rack_number_normalized | varchar(50) | indexed working value |
| price | numeric(18,2) | required |
| system_qty | numeric(18,3) | required |
| description | text | nullable (source Column 9) |
| source_date | date | nullable; source Column 6, informational only |
| keepstock_box_number | varchar(100) | nullable; **verified** source Column 7 (`BUSINESS_RULES.md` §12a) |
| barcode | varchar(100) | nullable; source Column 8, distinct from `sku`, never used as merge key |
| created_at | timestamptz | required |

Unique:

```text
(snapshot_id, sku, rack_number_normalized)
```

### ⚠️ `scan_results` — DEPRECATED, do not write to this table

Superseded by `stock_take_items` + `physical_count_history` below
(confirmed pivot, `BUSINESS_RULES.md` §6/§6b, v2.2). Kept only for
historical/rollback reference from the earlier COUNT-derived-quantity
prototype. Application code must not read or write it going forward.

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| sku | varchar(50) | required |
| rack_number_raw | varchar(50) | source value |
| rack_number_normalized | varchar(50) | required |
| scan_qty | numeric(18,3) | nullable until completed |
| source_upload_batch_id | uuid | FK |
| last_updated_by | uuid | FK |
| last_updated_at | timestamptz | required |
| created_at | timestamptz | required |

### ⚠️ `scan_result_history` — DEPRECATED, do not write to this table

Same status as `scan_results` above — superseded by
`physical_count_history`.

| Column | Type |
|---|---|
| id | uuid PK |
| scan_result_id | uuid FK |
| session_id | uuid FK |
| sku | varchar(50) |
| rack_number_normalized | varchar(50) |
| previous_scan_qty | numeric(18,3) nullable |
| new_scan_qty | numeric(18,3) nullable |
| source_upload_batch_id | uuid FK |
| changed_by | uuid FK |
| change_type | varchar(30) |
| reason | text nullable |
| created_at | timestamptz |

### `stock_take_items` (current — replaces `scan_results`)

One row per unique SKU+Rack being counted in a session. Seeded from
the session's locked System DB snapshot by form generation
(`BUSINESS_RULES.md` §6c), then updated by Itemize upload (status
only) and by manual Physical Qty entry (§6a, §6b).

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK, `ON DELETE CASCADE` |
| sku | varchar(50) | required |
| rack_number_raw | varchar(50) | required |
| rack_number_normalized | varchar(50) | required |
| system_row_id | uuid | FK to `system_inventory_rows`, nullable (null when `UNKNOWN_SKU`) |
| system_qty | numeric(18,3) | nullable, copied from System DB at generation/itemize time |
| price | numeric(18,2) | nullable, copied from System DB |
| description | text | nullable, copied from System DB |
| system_keepstock_box | varchar(100) | nullable, copied from System DB |
| barcode | varchar(100) | nullable, copied from System DB |
| itemize_upload_batch_id | uuid | FK, nullable |
| status | varchar(20) | `PENDING` / `ITEMIZED` / `NOT_SCANNED` / `UNKNOWN_SKU` / `WRONG_RACK` |
| physical_qty | numeric(18,3) | nullable until manually entered — never derived |
| physical_qty_updated_by | uuid | FK, nullable |
| physical_qty_updated_at | timestamptz | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

Unique: `(session_id, sku, rack_number_normalized)`.

A database trigger rejects any `UPDATE`/`DELETE` on this table once
the owning session is `FINALIZED` (`BUSINESS_RULES.md` §18) — defense
in depth beyond the application-layer check.

### `physical_count_history` (current — replaces `scan_result_history`)

| Column | Type |
|---|---|
| id | uuid PK |
| stock_take_item_id | uuid FK, `ON DELETE CASCADE` |
| session_id | uuid FK, `ON DELETE CASCADE` |
| previous_qty | numeric(18,3) nullable |
| new_qty | numeric(18,3) nullable |
| changed_by | uuid FK, required |
| reason | text nullable |
| created_at | timestamptz |

### `keepstock_sheet_mapping`

| Column | Type | Rule |
|---|---|---|
| id | uuid | PK |
| store_id | uuid | UNIQUE FK |
| spreadsheet_id | varchar(100) | required |
| sheet_title | varchar(200) | required |
| sheet_gid | varchar(50) | technical only |
| is_active | boolean | required |
| last_sync_at | timestamptz | nullable |
| created_at | timestamptz | required |
| updated_at | timestamptz | required |

Current spreadsheet:

```text
14J84e5XQ9Jddhr0HiEvOe68RgMQwWPt9Ik7ED0VvqFE
```

### `keepstock_cache` (optional)

```text
id
store_id
sku
box_number
qty
source_sheet
synced_at
```

Google Sheets remains source of truth.

### `session_result_summary`

| Column | Type |
|---|---|
| id | uuid PK |
| session_id | uuid UNIQUE FK |
| total_system_qty | numeric(18,3) |
| total_physical_qty | numeric(18,3) |
| total_variance_qty | numeric(18,3) |
| total_variance_value | numeric(18,2) |
| accuracy_percent | numeric(5,2) |
| not_scanned_count | integer |
| variance_sku_count | integer |
| calculated_at | timestamptz |
| finalized_by | uuid |
| formula_version | varchar(30) |

> `total_scan_qty` renamed to `total_physical_qty` (migration 003).

## 3. Working Result

Prefer a SQL view/service instead of duplicating merged data.

```text
System snapshot
+ current scan results
+ Keepstock lookup
→ working result
```

Output fields:

```text
SKU
Rack
Description
Price
System Qty
Scan Qty
Keepstock Boxes
Keepstock Total
Status
Variance Qty
Variance Value
```

## 4. Statuses

```text
SCANNED
NOT SCANNED
UNKNOWN SKU
WRONG RACK (optional)
REVIEW
```

## 5. Indexing & Performance

### 5.1 Scale reference (verified real data)

Store XWGN's real export: **93,150 System DB rows**, **11,449 raw
scan rows** (→ ~10,142 unique SKU+Rack pairs after grouping). Assuming
similar size across all stores:

| Metric | Per store | × 25 stores |
|---|---:|---:|
| `system_rows` per snapshot | ~93,000 | ~2.3M |
| `scan_results` (active, deduped) | ≤ ~93,000 | ≤ ~2.3M |
| Raw scan rows per upload (not stored as-is — see §5.4) | ~11,000 | ~275,000 |

Multiple System DB re-uploads per session (corrections) multiply the
`system_rows` figure by the number of snapshots — even at 3–5
snapshots per session, total volume stays in the **low tens of
millions of rows**. This is a small dataset for PostgreSQL, which
routinely handles hundreds of millions of rows; the numbers above do
not by themselves require partitioning or a different database. What
they do require is correct indexing and correct write/read patterns
(§5.2–§5.5) — without those, queries can still be slow even though
Postgres itself is not the bottleneck.

### 5.2 Required indexes

```text
stores: UNIQUE(store_code), UNIQUE(store_name)
sessions: INDEX(store_id,status), UNIQUE(session_code)
sessions: UNIQUE(store_id) WHERE status = 'IN_PROGRESS'   -- §"one active session per store"
upload_batches: INDEX(session_id,upload_type,created_at)
system_snapshots: UNIQUE(upload_batch_id), INDEX(session_id,snapshot_date)
system_rows: UNIQUE(snapshot_id,sku,rack_number_normalized)
system_rows: INDEX(snapshot_id,rack_number_normalized)     -- rack-scoped listing (§5.5)
scan_results: UNIQUE(session_id,sku,rack_number_normalized), INDEX(session_id,rack_number_normalized)
scan_history: INDEX(scan_result_id,created_at)
keepstock_mapping: UNIQUE(store_id)
```

The two `rack_number_normalized` indexes are the ones that matter
most at this scale — every screen the user sees is scoped to one
rack, so without them a lookup would scan up to ~93,000 rows per
store instead of the handful in that rack.

### 5.3 Bulk insert, not row-by-row

Parsing a 93,000-row System DB file with one `INSERT` per row (common
in naive implementations) is the single most likely real-world
performance problem at this scale — not the database size. Use:

- **`COPY`** (PostgreSQL bulk load) or a driver's batch/multi-row
  `INSERT ... VALUES (...), (...), ...` in chunks of ~1,000–5,000 rows.
- Parse and validate in the application layer first (`DATA_FORMAT.md`
  §3–4), then bulk-write already-clean rows — don't validate row 1,
  insert row 1, validate row 2, insert row 2.
- Wrap each upload's insert in a single transaction (§6) so a failure
  midway does not leave a half-written snapshot.

### 5.4 Itemize dedup at this scale (superseded §6a)

`BUSINESS_RULES.md` §6a (v2.2) no longer derives a quantity — Itemize
rows are deduplicated (first occurrence wins per SKU+Rack) to produce
a checklist, at the same ~11,000-row, in-memory-hash-map scale as
before (`DATA_FORMAT.md` §4). The resulting deduplicated rows are
bulk-upserted into `stock_take_items` (status only — never
`physical_qty`, see §5.3). Physical Qty itself is written one row at
a time as the PIC enters it in the UI — this is a low-frequency,
per-user-action write, not a bulk file-import path, so no special
bulk-write handling is needed for it.

### 5.5 Frontend must paginate by rack, not load the whole session

At ~93,000 rows per store, the API must **never** return an entire
session's working table in one response. The existing rack-by-rack
UI (`js/app.js` rack navigation) is the right shape — the backend API
should mirror it: `GET /sessions/:id/racks/:rackNumber/rows`, scoped
by the `rack_number_normalized` index above, not `GET
/sessions/:id/rows` returning everything.

### 5.6 Longer-term (not needed yet)

Only revisit if a single store's cumulative history grows into the
tens of millions of rows (e.g. years of retained `FINALIZED`
sessions): table partitioning by `store_id` or by
`finalized_at` date range, and archiving old `FINALIZED` sessions to
cold storage. Not required at the 25-store / ~93k-SKU scale observed
today — listed here so it isn't forgotten if the business grows.

## 6. Transactions

System upload:

```text
batch → parse → validate → snapshot (locked once per session, §8) → rows → commit
```

Itemize upload:

```text
batch → resolve session's locked System snapshot → parse → dedupe → match/status → commit
```

Physical Qty entry (per line, not a batch upload):

```text
authorize → validate → write current value → write history → commit
```

Finalize:

```text
authorize → validate every line has non-NULL Physical Qty → calculate → summary → FINALIZED → commit
```

## 7. Security

Every query must resolve store from authenticated identity. Do not trust frontend `store_id`.

Recommended stack:

```text
Next.js + React + TypeScript
PostgreSQL / Supabase
Supabase Auth
Supabase Storage
Google Sheets API
```
