/**
 * Session resolution — DATABASE_SCHEMA.md §"Resume flow", §2.2.
 *
 * "Stop today, continue tomorrow" is just this lookup, as long as every
 * write goes to Postgres (not browser localStorage, unlike the old
 * prototype — see DEVELOPMENT_STATUS.md).
 *
 * Scope note: this module owns session *lifecycle* only (resolve,
 * resume, resume-state). Rack-scoped data reads live in
 * workingView.ts, and System DB snapshot locking lives in
 * systemDbSnapshot.ts — do not re-add duplicate versions of either
 * here (see DEVELOPMENT_STATUS.md §3 for why this note exists).
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
