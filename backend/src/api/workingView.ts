import type { Pool } from "pg";

/**
 * Working result. Variance is calculated ONLY after Physical Qty exists.
 * Blank Physical Qty => blank variance/value.
 */
export async function getRackWorkingViewV2(pool: Pool, sessionId: string, rack: string) {
  return pool.query(`
    SELECT
      sti.id,
      sti.sku,
      sti.rack_number_normalized AS rack,
      sti.description,
      sti.price,
      sti.system_qty AS "systemQty",
      sti.physical_qty AS "physicalQty",
      CASE
        WHEN sti.physical_qty IS NULL THEN NULL
        ELSE sti.physical_qty - sti.system_qty
      END AS "varianceQty",
      CASE
        WHEN sti.physical_qty IS NULL OR sti.price IS NULL THEN NULL
        ELSE (sti.physical_qty - sti.system_qty) * sti.price
      END AS "varianceValue",
      CASE
        WHEN sti.status = 'UNKNOWN_SKU' THEN 'UNKNOWN SKU'
        WHEN sti.status = 'WRONG_RACK' THEN 'WRONG RACK'
        WHEN sti.physical_qty IS NULL THEN 'PENDING PHYSICAL COUNT'
        ELSE 'COUNTED'
      END AS status
    FROM stock_take_items sti
    WHERE sti.session_id = $1
      AND sti.rack_number_normalized = $2
    ORDER BY sti.sku ASC
  `, [sessionId, rack]);
}
