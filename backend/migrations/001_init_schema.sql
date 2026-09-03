-- Mini Stock Take — Initial Schema
-- Generated from DATABASE_SCHEMA.md v2.3
-- Every table/index/comment below traces back to a section in that document.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- =========================================================
-- stores  (DATABASE_SCHEMA.md §2 "stores")
-- =========================================================
CREATE TABLE stores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code    varchar(20) NOT NULL UNIQUE,   -- e.g. JC2021 (BUSINESS_RULES.md §2)
  store_name    varchar(100) NOT NULL UNIQUE,  -- e.g. XWGN — also the Keepstock sheet title
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- users  (§2 "users")
-- =========================================================
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid REFERENCES stores(id), -- nullable: ADMIN/SUPERVISOR may be global
  email             varchar(255) NOT NULL UNIQUE,
  role              varchar(30) NOT NULL CHECK (role IN ('STORE_USER','SUPERVISOR','ADMIN')),
  auth_provider_id  varchar(255), -- Supabase Auth user id
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- stock_take_sessions  (§2 "stock_take_sessions")
-- =========================================================
CREATE TABLE stock_take_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           uuid NOT NULL REFERENCES stores(id),
  session_code       varchar(50) NOT NULL UNIQUE,
  start_date         date NOT NULL,
  status             varchar(20) NOT NULL DEFAULT 'IN_PROGRESS'
                       CHECK (status IN ('IN_PROGRESS','FINALIZED')),
  last_active_rack   varchar(50), -- resume pointer, see §"Resume flow"
  finalized_at       timestamptz,
  finalized_by       uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_store_status ON stock_take_sessions (store_id, status);

-- One IN_PROGRESS session per store (§"One active session per store")
CREATE UNIQUE INDEX one_active_session_per_store
  ON stock_take_sessions (store_id)
  WHERE status = 'IN_PROGRESS';

-- =========================================================
-- upload_batches  (§2 "upload_batches")
-- =========================================================
CREATE TABLE upload_batches (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  uuid NOT NULL REFERENCES stock_take_sessions(id),
  upload_type                 varchar(30) NOT NULL CHECK (upload_type IN ('SYSTEM_DATABASE','SCAN_RESULT')),
  file_name                   varchar(255) NOT NULL,
  file_hash                   varchar(128), -- idempotency guard
  storage_path                text NOT NULL, -- Supabase Storage path to the raw file
  upload_date                 date NOT NULL,
  uploaded_by                 uuid REFERENCES users(id),
  reference_system_batch_id   uuid REFERENCES upload_batches(id), -- required for SCAN_RESULT in production
  processing_status           varchar(20) NOT NULL DEFAULT 'PENDING'
                                 CHECK (processing_status IN ('PENDING','PROCESSING','SUCCESS','PARTIAL','FAILED')),
  row_count                   integer,
  valid_row_count             integer,
  invalid_row_count           integer,
  error_message                text,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_upload_batches_session ON upload_batches (session_id, upload_type, created_at);

-- =========================================================
-- system_inventory_snapshots  (§2)
-- =========================================================
CREATE TABLE system_inventory_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES stock_take_sessions(id),
  upload_batch_id   uuid NOT NULL UNIQUE REFERENCES upload_batches(id),
  snapshot_date     date NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_snapshots_session_date ON system_inventory_snapshots (session_id, snapshot_date);

-- =========================================================
-- system_inventory_rows  (§2 — verified column mapping, DATA_FORMAT.md §3)
-- =========================================================
CREATE TABLE system_inventory_rows (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id            uuid NOT NULL REFERENCES system_inventory_snapshots(id),
  sku                    varchar(50) NOT NULL,           -- source Column 1
  rack_number_raw        varchar(50) NOT NULL,           -- source Column 2, preserved as-is (incl. "-")
  rack_number_normalized varchar(50) NOT NULL,           -- "-" -> "NO RACK" (BUSINESS_RULES.md §11)
  price                  numeric(18,2) NOT NULL,         -- source Column 3
  system_qty             numeric(18,3) NOT NULL,         -- source Column 4
  description            text,                           -- source Column 9 (NOT Column 8 — verified)
  source_date            date,                           -- source Column 6, informational only
  keepstock_box_number   varchar(100),                   -- source Column 7 — verified Box Number
  barcode                varchar(100),                   -- source Column 8, never a merge key
  created_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (snapshot_id, sku, rack_number_normalized)
);

CREATE INDEX idx_system_rows_rack ON system_inventory_rows (snapshot_id, rack_number_normalized);

-- =========================================================
-- scan_results  (§2 — current value per session/sku/rack)
-- =========================================================
CREATE TABLE scan_results (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES stock_take_sessions(id),
  sku                      varchar(50) NOT NULL,
  rack_number_raw          varchar(50) NOT NULL,
  rack_number_normalized   varchar(50) NOT NULL,
  scan_qty                 numeric(18,3), -- derived by COUNT, see BUSINESS_RULES.md §6a — never read from a source column
  source_upload_batch_id   uuid REFERENCES upload_batches(id),
  last_updated_by          uuid REFERENCES users(id),
  last_updated_at          timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, sku, rack_number_normalized)
);

CREATE INDEX idx_scan_results_rack ON scan_results (session_id, rack_number_normalized);

-- =========================================================
-- scan_result_history  (§2 — recount audit trail)
-- =========================================================
CREATE TABLE scan_result_history (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_result_id           uuid NOT NULL REFERENCES scan_results(id),
  session_id               uuid NOT NULL REFERENCES stock_take_sessions(id),
  sku                      varchar(50) NOT NULL,
  rack_number_normalized   varchar(50) NOT NULL,
  previous_scan_qty        numeric(18,3),
  new_scan_qty             numeric(18,3),
  source_upload_batch_id   uuid REFERENCES upload_batches(id),
  changed_by               uuid REFERENCES users(id),
  change_type              varchar(30) NOT NULL, -- e.g. 'RECOUNT_UPLOAD', 'MANUAL_OVERRIDE'
  reason                   text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_history_result ON scan_result_history (scan_result_id, created_at);

-- =========================================================
-- keepstock_sheet_mapping  (§2)
-- =========================================================
CREATE TABLE keepstock_sheet_mapping (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL UNIQUE REFERENCES stores(id),
  spreadsheet_id  varchar(100) NOT NULL,
  sheet_title     varchar(200) NOT NULL, -- matched against store_name
  sheet_gid       varchar(50),           -- technical only, never a manual user input
  is_active       boolean NOT NULL DEFAULT true,
  last_sync_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- keepstock_cache  (§2, optional — Google Sheets remains source of truth)
-- =========================================================
CREATE TABLE keepstock_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id),
  sku           varchar(50) NOT NULL,
  box_number    varchar(100) NOT NULL,
  qty           numeric(18,3) NOT NULL,
  source_sheet  varchar(200),
  synced_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_keepstock_cache_lookup ON keepstock_cache (store_id, sku);

-- =========================================================
-- session_result_summary  (§2 — snapshot at finalize, BUSINESS_RULES.md §16 Final Result)
-- =========================================================
CREATE TABLE session_result_summary (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             uuid NOT NULL UNIQUE REFERENCES stock_take_sessions(id),
  total_system_qty       numeric(18,3) NOT NULL,
  total_scan_qty         numeric(18,3) NOT NULL,
  total_variance_qty     numeric(18,3) NOT NULL,
  total_variance_value   numeric(18,2) NOT NULL,
  accuracy_percent       numeric(5,2) NOT NULL,
  not_scanned_count      integer NOT NULL,
  variance_sku_count     integer NOT NULL,
  calculated_at          timestamptz NOT NULL DEFAULT now(),
  finalized_by           uuid REFERENCES users(id),
  formula_version        varchar(30) NOT NULL DEFAULT 'ACC_V1' -- BUSINESS_RULES.md §17, formula not yet finalized
);

-- =========================================================
-- updated_at auto-touch trigger (applies to tables with updated_at)
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON stock_take_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_keepstock_mapping_updated_at BEFORE UPDATE ON keepstock_sheet_mapping
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
