import type { Pool, PoolClient } from "pg";
import type { ItemizeRow } from "../parsers/itemize";

export interface ItemizeApplyResult {
  inserted: number;
  existing: number;
  unknownSku: number;
  wrongRack: number;
}

/**
 * Appends Itemize rows to a session. Existing SKU+Rack rows are preserved;
 * a later upload does not delete or replace earlier racks.
 * System DB enrichment is resolved from the session's fixed snapshot.
 */
export async function applyItemizeBatch(
  pool: Pool,
  sessionId: string,
  uploadBatchId: string,
  rows: ItemizeRow[],
): Promise<ItemizeApplyResult> {
  const client = await pool.connect();
  let inserted = 0;
  let existing = 0;
  let unknownSku = 0;
  let wrongRack = 0;

  try {
    await client.query("BEGIN");
    const session = await client.query<{ store_id: string; system_snapshot_id: string | null; status: string }>(
      `SELECT store_id, system_snapshot_id, status FROM stock_take_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    if (!session.rows.length) throw new Error("SESSION_NOT_FOUND");
    if (session.rows[0].status !== "IN_PROGRESS") throw new Error("SESSION_NOT_EDITABLE");
    if (!session.rows[0].system_snapshot_id) throw new Error("SYSTEM_SNAPSHOT_REQUIRED");

    for (const row of rows) {
      const existingItem = await client.query(`
        SELECT id, status FROM stock_take_items
        WHERE session_id = $1 AND sku = $2 AND rack_number_normalized = $3
      `, [sessionId, row.sku, row.rackNumberNormalized]);

      const exact = await client.query(`
        SELECT id, system_qty, price, description, keepstock_box_number, barcode
        FROM system_inventory_rows
        WHERE snapshot_id = $1 AND sku = $2 AND rack_number_normalized = $3
      `, [session.rows[0].system_snapshot_id, row.sku, row.rackNumberNormalized]);

      let systemRow = exact.rows[0];
      let status = "ITEMIZED";

      if (existingItem.rows.length) {
        // Existing line may have been created during form generation as NOT_SCANNED.
        // Itemize confirms that this SKU+Rack is in the counted list.
        if (systemRow) {
          await client.query(`
            UPDATE stock_take_items
            SET status = 'ITEMIZED', system_row_id = $2, system_qty = $3,
                price = $4, description = $5, system_keepstock_box = $6,
                barcode = $7, updated_at = now()
            WHERE id = $1 AND status = 'NOT_SCANNED'
          `, [existingItem.rows[0].id, systemRow.id, systemRow.system_qty, systemRow.price,
              systemRow.description, systemRow.keepstock_box_number, systemRow.barcode]);
        }
        existing++;
        continue;
      }
      if (!systemRow) {
        const skuAnyRack = await client.query(`
          SELECT id FROM system_inventory_rows
          WHERE snapshot_id = $1 AND sku = $2
          LIMIT 1
        `, [session.rows[0].system_snapshot_id, row.sku]);
        status = skuAnyRack.rows.length ? "WRONG_RACK" : "UNKNOWN_SKU";
        if (status === "WRONG_RACK") wrongRack++; else unknownSku++;
      }

      await client.query(`
        INSERT INTO stock_take_items
          (session_id, sku, rack_number_raw, rack_number_normalized,
           system_row_id, system_qty, price, description,
           system_keepstock_box, barcode, itemize_upload_batch_id, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, [
        sessionId, row.sku, row.rackNumberRaw, row.rackNumberNormalized,
        systemRow?.id ?? null,
        systemRow?.system_qty ?? null,
        systemRow?.price ?? null,
        systemRow?.description ?? null,
        systemRow?.keepstock_box_number ?? null,
        systemRow?.barcode ?? null,
        uploadBatchId,
        status,
      ]);
      inserted++;
    }

    await client.query(`
      UPDATE stock_take_sessions
      SET form_generated_at = COALESCE(form_generated_at, now()), updated_at = now()
      WHERE id = $1
    `, [sessionId]);

    await client.query("COMMIT");
    return { inserted, existing, unknownSku, wrongRack };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
