import type { Pool } from "pg";

/** Finalize only when every form line has a physical count. */
export async function finalizeStockTake(pool: Pool, sessionId: string, finalizedBy: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM stock_take_sessions WHERE id = $1 FOR UPDATE`, [sessionId]
    );
    if (!session.rows.length) throw new Error("SESSION_NOT_FOUND");
    if (session.rows[0].status !== "IN_PROGRESS") throw new Error("SESSION_NOT_EDITABLE");

    const pending = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stock_take_items WHERE session_id = $1 AND physical_qty IS NULL`, [sessionId]
    );
    if (Number(pending.rows[0].count) > 0) throw new Error("PHYSICAL_COUNT_INCOMPLETE");

    const totals = await client.query<{
      total_system_qty: string; total_physical_qty: string; total_variance_qty: string;
      total_variance_value: string; accuracy_percent: string; not_scanned_count: string; variance_sku_count: string;
    }>(`SELECT
        COALESCE(SUM(system_qty),0) AS total_system_qty,
        COALESCE(SUM(physical_qty),0) AS total_physical_qty,
        COALESCE(SUM(physical_qty - COALESCE(system_qty,0)),0) AS total_variance_qty,
        COALESCE(SUM((physical_qty - COALESCE(system_qty,0)) * COALESCE(price,0)),0) AS total_variance_value,
        CASE WHEN COALESCE(SUM(system_qty),0) = 0 THEN 100
             ELSE ((SUM(system_qty) - SUM(ABS(physical_qty - COALESCE(system_qty,0)))) / SUM(system_qty)) * 100 END AS accuracy_percent,
        -- Note: this counts items whose Itemize-match status is
        -- NOT_SCANNED, i.e. counted directly without ever appearing
        -- in an Itemize upload. It is NOT "items missing a count" —
        -- finalize can only reach this point once every line has a
        -- non-NULL physical_qty (checked above), so that number is
        -- always 0 here by construction. This field answers "how many
        -- lines were counted without going through Itemize first?".
        COUNT(*) FILTER (WHERE status = 'NOT_SCANNED') AS not_scanned_count,
        COUNT(*) FILTER (WHERE physical_qty - COALESCE(system_qty,0) <> 0) AS variance_sku_count
       FROM stock_take_items WHERE session_id = $1`, [sessionId]);

    const t = totals.rows[0];
    await client.query(`INSERT INTO session_result_summary
      (session_id,total_system_qty,total_physical_qty,total_variance_qty,total_variance_value,
       accuracy_percent,not_scanned_count,variance_sku_count,finalized_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sessionId,t.total_system_qty,t.total_physical_qty,t.total_variance_qty,t.total_variance_value,
       t.accuracy_percent,t.not_scanned_count,t.variance_sku_count,finalizedBy]);

    await client.query(`UPDATE stock_take_sessions SET status='FINALIZED', finalized_at=now(), finalized_by=$2, updated_at=now() WHERE id=$1`, [sessionId, finalizedBy]);
    await client.query("COMMIT");
    return { ...t, status: "FINALIZED" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
