/**
 * Session resolution — DATABASE_SCHEMA.md §"Resume flow", §2.2.
 *
 * "Stop today, continue tomorrow" is just this lookup, as long as every
 * write goes to Postgres (not browser localStorage, unlike the old
 * prototype — see DEVELOPMENT_STATUS.md).
 */

import type { Pool } from "pg";

export interface StockTakeSession {
  id: string;
  storeId: string;
  sessionCode: string;
  status: "IN_PROGRESS" | "FINALIZED";
  lastActiveRack: string | null;
}

/**
 * Resolves (or creates) the active session for a store.
 * The unique partial index `one_active_session_per_store` in the
 * migration guarantees this never races into two IN_PROGRESS rows.
 */
export async function resolveActiveSession(
  pool: Pool,
  storeId: string,
  createdByUserId: string
): Promise<StockTakeSession> {
  const existing = await pool.query<StockTakeSession>(
    `SELECT id, store_id AS "storeId", session_code AS "sessionCode",
            status, last_active_rack AS "lastActiveRack"
     FROM stock_take_sessions
     WHERE store_id = $1 AND status = 'IN_PROGRESS'
     LIMIT 1`,
    [storeId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const sessionCode = `ST-${storeId.slice(0, 8)}-${Date.now()}`;
  const created = await pool.query<StockTakeSession>(
    `INSERT INTO stock_take_sessions (store_id, session_code, start_date, status)
     VALUES ($1, $2, CURRENT_DATE, 'IN_PROGRESS')
     RETURNING id, store_id AS "storeId", session_code AS "sessionCode",
               status, last_active_rack AS "lastActiveRack"`,
    [storeId, sessionCode]
  );

  return created.rows[0];
}

/** Called whenever the user opens a rack, so resume reopens the right place. */
export async function updateLastActiveRack(pool: Pool, sessionId: string, rackNumberNormalized: string): Promise<void> {
  await pool.query(
    `UPDATE stock_take_sessions SET last_active_rack = $2 WHERE id = $1 AND status = 'IN_PROGRESS'`,
    [sessionId, rackNumberNormalized]
  );
}

/**
 * Rack-scoped fetch — DATABASE_SCHEMA.md §5.5. Never fetch a whole
 * session's rows in one call; this is what keeps a 93,000-row store
 * fast on both API and frontend.
 */
export async function getRackWorkingView(pool: Pool, sessionId: string, rackNumberNormalized: string) {
  return pool.query(
    `SELECT
        sr.sku,
        sr.rack_number_normalized  AS "rack",
        sir.description,
        sir.price,
        sir.system_qty              AS "systemQty",
        sr.scan_qty                 AS "scanQty",
        (COALESCE(sr.scan_qty, 0) - sir.system_qty)               AS "varianceQty",
        (COALESCE(sr.scan_qty, 0) - sir.system_qty) * sir.price    AS "varianceValue",
        CASE WHEN sr.scan_qty IS NULL THEN 'NOT SCANNED' ELSE 'SCANNED' END AS "status"
     FROM system_inventory_rows sir
     JOIN system_inventory_snapshots sis ON sis.id = sir.snapshot_id
     LEFT JOIN scan_results sr
       ON sr.session_id = sis.session_id
       AND sr.sku = sir.sku
       AND sr.rack_number_normalized = sir.rack_number_normalized
     WHERE sis.session_id = $1 AND sir.rack_number_normalized = $2
     ORDER BY (sr.scan_qty IS NULL) ASC, sir.sku ASC` /* NOT SCANNED sorts last — BUSINESS_RULES.md §9 */,
    [sessionId, rackNumberNormalized]
  );
}
