import type { Pool } from "pg";

/**
 * Generates the physical-count form for one rack.
 * Primary source = deduplicated Itemize rows. System-only rows for the rack
 * are appended as NOT_SCANNED. Physical Qty always starts NULL.
 */
export async function generateRackForm(pool: Pool, sessionId: string, rack: string): Promise<{ inserted: number; total: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query<{ store_id: string; system_snapshot_id: string | null; status: string }>(
      `SELECT store_id, system_snapshot_id, status FROM stock_take_sessions WHERE id=$1 FOR UPDATE`, [sessionId]
    );
    if (!session.rows.length) throw new Error("SESSION_NOT_FOUND");
    if (session.rows[0].status !== "IN_PROGRESS") throw new Error("SESSION_NOT_EDITABLE");
    if (!session.rows[0].system_snapshot_id) throw new Error("SYSTEM_SNAPSHOT_REQUIRED");

    // 1) Itemize is the primary source of the counting list.
    const itemized = await client.query(`
      SELECT sti.sku, sti.rack_number_raw, sti.rack_number_normalized,
             sir.id AS system_row_id, sir.system_qty, sir.price, sir.description,
             sir.keepstock_box_number, sir.barcode
      FROM stock_take_items sti
      LEFT JOIN system_inventory_rows sir ON sir.id = sti.system_row_id
      WHERE sti.session_id=$1 AND sti.rack_number_normalized=$2
      ORDER BY sti.sku ASC`, [sessionId, rack]);

    // 2) System-only rows become NOT_SCANNED review lines.
    const systemOnly = await client.query(`
      SELECT sir.id, sir.sku, sir.rack_number_raw, sir.rack_number_normalized,
             sir.system_qty, sir.price, sir.description, sir.keepstock_box_number, sir.barcode
      FROM system_inventory_rows sir
      WHERE sir.snapshot_id=$1 AND sir.rack_number_normalized=$2
        AND NOT EXISTS (
          SELECT 1 FROM stock_take_items sti
          WHERE sti.session_id=$3 AND sti.sku=sir.sku
            AND sti.rack_number_normalized=sir.rack_number_normalized
        )
      ORDER BY sir.sku ASC`, [session.rows[0].system_snapshot_id, rack, sessionId]);

    let inserted = 0;
    for (const row of systemOnly.rows) {
      const ins = await client.query(`
        INSERT INTO stock_take_items
          (session_id,sku,rack_number_raw,rack_number_normalized,system_row_id,system_qty,price,description,system_keepstock_box,barcode,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'NOT_SCANNED')
        ON CONFLICT (session_id,sku,rack_number_normalized) DO NOTHING`,
        [sessionId,row.sku,row.rack_number_raw,row.rack_number_normalized,row.id,row.system_qty,row.price,row.description,row.keepstock_box_number,row.barcode]);
      inserted += ins.rowCount ?? 0;
    }

    await client.query(`UPDATE stock_take_sessions SET last_active_rack=$2, form_generated_at=COALESCE(form_generated_at,now()), updated_at=now() WHERE id=$1`, [sessionId,rack]);
    const total = await client.query<{count:string}>(`SELECT COUNT(*)::text count FROM stock_take_items WHERE session_id=$1 AND rack_number_normalized=$2`, [sessionId,rack]);
    await client.query("COMMIT");
    return { inserted, total: Number(total.rows[0].count) };
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
