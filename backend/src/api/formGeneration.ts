import type { Pool } from "pg";

/**
 * Builds/updates the persistent form lines for one rack.
 * Itemize lines are retained; System-only lines are appended as NOT_SCANNED.
 * Physical Qty remains NULL for every newly generated line.
 */
export async function generateRackForm(
  pool: Pool,
  sessionId: string,
  rackNumberNormalized: string,
): Promise<{ inserted: number; total: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const session = await client.query<{ store_id: string; system_snapshot_id: string | null; status: string }>(
      `SELECT store_id, system_snapshot_id, status
       FROM stock_take_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    if (!session.rows.length) throw new Error("SESSION_NOT_FOUND");
    if (session.rows[0].status !== "IN_PROGRESS") throw new Error("SESSION_NOT_EDITABLE");
    if (!session.rows[0].system_snapshot_id) throw new Error("SYSTEM_SNAPSHOT_REQUIRED");

    const systemRows = await client.query(`
      SELECT id, sku, rack_number_raw, rack_number_normalized,
             system_qty, price, description, keepstock_box_number, barcode
      FROM system_inventory_rows
      WHERE snapshot_id = $1 AND rack_number_normalized = $2
      ORDER BY sku ASC
    `, [session.rows[0].system_snapshot_id, rackNumberNormalized]);

    let inserted = 0;
    for (const row of systemRows.rows) {
      const exists = await client.query(
        `SELECT id, status FROM stock_take_items
         WHERE session_id = $1 AND sku = $2 AND rack_number_normalized = $3`,
        [sessionId, row.sku, row.rack_number_normalized],
      );

      if (exists.rows.length) {
        // If the item was previously marked NOT_SCANNED but later appeared
        // in Itemize, uploadItemize will promote it to SCANNED. Generation
        // itself must never wipe Physical Qty.
        continue;
      }

      await client.query(`
        INSERT INTO stock_take_items
          (session_id, sku, rack_number_raw, rack_number_normalized,
           system_row_id, system_qty, price, description,
           system_keepstock_box, barcode, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'NOT_SCANNED')
      `, [
        sessionId, row.sku, row.rack_number_raw, row.rack_number_normalized,
        row.id, row.system_qty, row.price, row.description,
        row.keepstock_box_number, row.barcode,
      ]);
      inserted++;
    }

    await client.query(`
      UPDATE stock_take_sessions
      SET last_active_rack = $2, form_generated_at = COALESCE(form_generated_at, now()), updated_at = now()
      WHERE id = $1
    `, [sessionId, rackNumberNormalized]);

    const total = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM stock_take_items WHERE session_id = $1 AND rack_number_normalized = $2`,
      [sessionId, rackNumberNormalized],
    );

    await client.query("COMMIT");
    return { inserted, total: Number(total.rows[0].count) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
