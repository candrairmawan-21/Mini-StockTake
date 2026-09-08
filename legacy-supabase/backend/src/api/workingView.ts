import type { Pool } from "pg";

/**
 * Canonical rack-scoped working view — the single source of truth for
 * UI, PDF, and finalize (PROCESSING_ENGINE_SPEC.md §13). Do not
 * duplicate this query elsewhere; if the shape needs to change,
 * change it here only.
 *
 * Variance is calculated ONLY after Physical Qty exists — blank
 * Physical Qty means blank variance/value (BUSINESS_RULES.md §8).
 *
 * Status label priority (fixed after end-to-end testing found a real
 * bug: an item counted directly, without ever being Itemized, kept
 * showing "NOT SCANNED" forever because the stored `status` column
 * is the Itemize match result, not the overall completion state):
 *   1. UNKNOWN_SKU / WRONG_RACK — always shown, a genuine data-quality
 *      flag worth surfacing even once a Physical Qty exists.
 *   2. physical_qty IS NULL — not yet counted, regardless of whether
 *      the underlying status is PENDING/NOT_SCANNED/ITEMIZED.
 *   3. otherwise — COUNTED. Having a Physical Qty is what "counted"
 *      means; it does not require having gone through Itemize first.
 *
 * Row order follows PROCESSING_ENGINE_SPEC.md §7: counted rows first,
 * then UNKNOWN_SKU/WRONG_RACK, then not-yet-counted last
 * (red-highlighted in the UI, BUSINESS_RULES.md §10).
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
        WHEN sti.physical_qty IS NULL THEN 'NOT SCANNED'
        ELSE 'COUNTED'
      END AS status
    FROM stock_take_items sti
    WHERE sti.session_id = $1
      AND sti.rack_number_normalized = $2
    ORDER BY
      CASE
        WHEN sti.physical_qty IS NULL THEN 2
        WHEN sti.status IN ('UNKNOWN_SKU', 'WRONG_RACK') THEN 1
        ELSE 0
      END ASC,
      sti.sku ASC
  `, [sessionId, rack]);
}
