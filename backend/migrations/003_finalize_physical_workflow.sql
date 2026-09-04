-- Migration 003: align remaining legacy schema with Physical Count workflow.
-- Run after 001 and 002.

ALTER TABLE stock_take_items
  DROP CONSTRAINT IF EXISTS stock_take_items_status_check;

ALTER TABLE stock_take_items
  ADD CONSTRAINT stock_take_items_status_check
  CHECK (status IN ('PENDING','ITEMIZED','NOT_SCANNED','UNKNOWN_SKU','WRONG_RACK'));

UPDATE stock_take_items
SET status = 'ITEMIZED'
WHERE status = 'SCANNED';

ALTER TABLE session_result_summary
  RENAME COLUMN total_scan_qty TO total_physical_qty;

-- Prevent a finalized session from being edited accidentally at DB level.
CREATE OR REPLACE FUNCTION prevent_finalized_session_item_change() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_take_sessions s
    WHERE s.id = OLD.session_id AND s.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'SESSION_FINALIZED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_finalized_item_change ON stock_take_items;
CREATE TRIGGER trg_prevent_finalized_item_change
BEFORE UPDATE OF physical_qty, physical_qty_updated_by, physical_qty_updated_at, status, system_row_id,
                 system_qty, price, description, system_keepstock_box, barcode, updated_at
ON stock_take_items
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_session_item_change();

CREATE OR REPLACE FUNCTION prevent_finalized_session_item_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_take_sessions s
    WHERE s.id = OLD.session_id AND s.status = 'FINALIZED'
  ) THEN
    RAISE EXCEPTION 'SESSION_FINALIZED';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_finalized_item_delete ON stock_take_items;
CREATE TRIGGER trg_prevent_finalized_item_delete
BEFORE DELETE ON stock_take_items
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_session_item_delete();
