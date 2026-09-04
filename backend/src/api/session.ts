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

/** Rack-scoped working view for the current Physical Count workflow. */
export async function getRackWorkingView(pool: Pool, sessionId: string, rackNumberNormalized: string) {
  return pool.query(
    `SELECT
        sti.id,
        sti.sku,
        sti.rack_number_normalized AS "rack",
        sti.description,
        sti.price,
        sti.system_qty AS "systemQty",
        sti.physical_qty AS "physicalQty",
        CASE WHEN sti.physical_qty IS NULL THEN NULL
             ELSE sti.physical_qty - COALESCE(sti.system_qty, 0) END AS "varianceQty",
        CASE WHEN sti.physical_qty IS NULL OR sti.price IS NULL OR sti.system_qty IS NULL THEN NULL
             ELSE (sti.physical_qty - sti.system_qty) * sti.price END AS "varianceValue",
        CASE
          WHEN sti.status = 'UNKNOWN_SKU' THEN 'UNKNOWN SKU'
          WHEN sti.status = 'WRONG_RACK' THEN 'WRONG RACK'
          WHEN sti.status = 'NOT_SCANNED' THEN 'NOT SCANNED'
          WHEN sti.physical_qty IS NULL THEN 'PENDING PHYSICAL COUNT'
          ELSE 'COUNTED'
        END AS status
     FROM stock_take_items sti
     JOIN stock_take_sessions s ON s.id = sti.session_id
     WHERE sti.session_id = $1 AND sti.rack_number_normalized = $2
     ORDER BY sti.sku ASC`,
    [sessionId, rackNumberNormalized]
  );
}

/**
 * Fix the System DB baseline for a session. Once a session has generated
 * a form, callers should not silently switch it to a newer daily snapshot.
 */
export async function assignSystemSnapshot(
  pool: Pool,
  sessionId: string,
  snapshotId: string,
): Promise<void> {
  await pool.query(
    `UPDATE stock_take_sessions
     SET system_snapshot_id = COALESCE(system_snapshot_id, $2), updated_at = now()
     WHERE id = $1 AND status = 'IN_PROGRESS'`,
    [sessionId, snapshotId],
  );
}

/** Returns the active session and enough progress data for a Continue screen. */
export async function getSessionResumeState(pool: Pool, storeId: string) {
  return pool.query(`
    SELECT
      s.id,
      s.session_code AS "sessionCode",
      s.store_id AS "storeId",
      s.status,
      s.start_date AS "startDate",
      s.last_active_rack AS "lastActiveRack",
      s.system_snapshot_id AS "systemSnapshotId",
      COUNT(sti.id)::int AS "totalLines",
      COUNT(sti.id) FILTER (WHERE sti.physical_qty IS NOT NULL)::int AS "countedLines"
    FROM stock_take_sessions s
    LEFT JOIN stock_take_items sti ON sti.session_id = s.id
    WHERE s.store_id = $1 AND s.status = 'IN_PROGRESS'
    GROUP BY s.id
    LIMIT 1
  `, [storeId]);
}
