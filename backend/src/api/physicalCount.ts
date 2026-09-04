import type { Pool } from "pg";

/** Save one manual Physical Qty. NULL is allowed only when clearing an entry. */
export async function savePhysicalQty(
  pool: Pool,
  itemId: string,
  userId: string,
  physicalQty: number | null,
  reason?: string,
): Promise<void> {
  if (physicalQty !== null && (!Number.isFinite(physicalQty) || physicalQty < 0)) {
    throw new Error("INVALID_PHYSICAL_QTY");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ id: string; session_id: string; physical_qty: string | null }>(`
      SELECT sti.id, sti.session_id, sti.physical_qty
      FROM stock_take_items sti
      JOIN stock_take_sessions s ON s.id = sti.session_id
      WHERE sti.id = $1 AND s.status = 'IN_PROGRESS'
      FOR UPDATE
    `, [itemId]);
    if (!current.rows.length) throw new Error("ITEM_NOT_EDITABLE");

    const oldQty = current.rows[0].physical_qty === null ? null : Number(current.rows[0].physical_qty);
    if (oldQty !== physicalQty) {
      await client.query(`
        INSERT INTO physical_count_history
          (stock_take_item_id, session_id, previous_qty, new_qty, changed_by, reason)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [itemId, current.rows[0].session_id, oldQty, physicalQty, userId, reason ?? null]);
    }

    await client.query(`
      UPDATE stock_take_items
      SET physical_qty = $2, physical_qty_updated_by = $3,
          physical_qty_updated_at = now(), updated_at = now()
      WHERE id = $1
    `, [itemId, physicalQty, userId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
