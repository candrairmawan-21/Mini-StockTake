-- Mini Stock Take — Migration 002: Physical Count Workflow
-- Supersedes scan_qty/recount semantics for Itemize.
-- Itemize is a counting list (SKU + Rack), NOT a quantity source.

ALTER TABLE upload_batches
  DROP CONSTRAINT IF EXISTS upload_batches_upload_type_check;

ALTER TABLE upload_batches
  ADD CONSTRAINT upload_batches_upload_type_check
  CHECK (upload_type IN ('SYSTEM_DATABASE','ITEMIZE'));

ALTER TABLE stock_take_sessions
  ADD COLUMN IF NOT EXISTS system_snapshot_id uuid REFERENCES system_inventory_snapshots(id),
  ADD COLUMN IF NOT EXISTS form_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_store_updated
  ON stock_take_sessions (store_id, updated_at DESC);

-- One row = one unique SKU + Rack to be counted in the session.
-- Physical Qty starts NULL and is entered later by the PIC.
CREATE TABLE IF NOT EXISTS stock_take_items (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                 uuid NOT NULL REFERENCES stock_take_sessions(id) ON DELETE CASCADE,
  sku                        varchar(50) NOT NULL,
  rack_number_raw            varchar(50) NOT NULL,
  rack_number_normalized     varchar(50) NOT NULL,
  system_row_id              uuid REFERENCES system_inventory_rows(id),
  system_qty                 numeric(18,3),
  price                      numeric(18,2),
  description                text,
  system_keepstock_box       varchar(100),
  barcode                    varchar(100),
  itemize_upload_batch_id    uuid REFERENCES upload_batches(id),
  status                     varchar(20) NOT NULL DEFAULT 'PENDING'
                               CHECK (status IN ('PENDING','SCANNED','NOT_SCANNED','UNKNOWN_SKU','WRONG_RACK')),
  physical_qty               numeric(18,3),
  physical_qty_updated_by    uuid REFERENCES users(id),
  physical_qty_updated_at    timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sku, rack_number_normalized)
);

CREATE INDEX IF NOT EXISTS idx_stock_take_items_rack
  ON stock_take_items (session_id, rack_number_normalized, sku);

CREATE INDEX IF NOT EXISTS idx_stock_take_items_status
  ON stock_take_items (session_id, status);

CREATE TABLE IF NOT EXISTS physical_count_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_item_id uuid NOT NULL REFERENCES stock_take_items(id) ON DELETE CASCADE,
  session_id         uuid NOT NULL REFERENCES stock_take_sessions(id) ON DELETE CASCADE,
  previous_qty       numeric(18,3),
  new_qty            numeric(18,3),
  changed_by         uuid NOT NULL REFERENCES users(id),
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_count_history_item
  ON physical_count_history (stock_take_item_id, created_at DESC);

-- Existing scan tables are intentionally retained for rollback/history of the prototype migration.
-- Production application code must NOT write to scan_results after this migration.
