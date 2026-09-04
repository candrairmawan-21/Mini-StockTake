import type { Pool } from "pg";
import type { SystemDbRow } from "../parsers/systemDb";

export interface SystemDbSnapshotInput {
  fileName: string;
  storagePath: string;
  uploadDate: string;
  snapshotDate: string;
  uploadedBy?: string | null;
  fileHash?: string | null;
  rows: SystemDbRow[];
}

/**
 * Persists a System DB upload as an immutable snapshot and locks that snapshot
 * to the Stock Take Session. Raw-file storage itself is handled by the caller
 * (Supabase Storage); this function records its storage_path.
 */
export async function importSystemDbSnapshot(
  pool: Pool,
  sessionId: string,
  input: SystemDbSnapshotInput,
): Promise<{ uploadBatchId: string; snapshotId: string; inserted: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const session = await client.query<{ status: string; system_snapshot_id: string | null }>(
      `SELECT status, system_snapshot_id
       FROM stock_take_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    if (!session.rows.length) throw new Error("SESSION_NOT_FOUND");
    if (session.rows[0].status !== "IN_PROGRESS") throw new Error("SESSION_NOT_EDITABLE");
    if (session.rows[0].system_snapshot_id) throw new Error("SYSTEM_SNAPSHOT_ALREADY_LOCKED");

    const batch = await client.query<{ id: string }>(
      `INSERT INTO upload_batches
        (session_id, upload_type, file_name, file_hash, storage_path, upload_date,
         uploaded_by, processing_status)
       VALUES ($1,'SYSTEM_DATABASE',$2,$3,$4,$5,$6,'PROCESSING')
       RETURNING id`,
      [sessionId, input.fileName, input.fileHash ?? null, input.storagePath,
       input.uploadDate, input.uploadedBy ?? null],
    );
    const uploadBatchId = batch.rows[0].id;

    const snapshot = await client.query<{ id: string }>(
      `INSERT INTO system_inventory_snapshots (session_id, upload_batch_id, snapshot_date)
       VALUES ($1,$2,$3) RETURNING id`,
      [sessionId, uploadBatchId, input.snapshotDate],
    );
    const snapshotId = snapshot.rows[0].id;

    // Keep inserts chunked to avoid PostgreSQL parameter limits on large stores.
    const chunkSize = 1000;
    for (let i = 0; i < input.rows.length; i += chunkSize) {
      const chunk = input.rows.slice(i, i + chunkSize);
      const values: unknown[] = [];
      const placeholders = chunk.map((row, index) => {
        const base = index * 10;
        values.push(
          snapshotId, row.sku, row.rackNumberRaw, row.rackNumberNormalized,
          row.price, row.systemQty, row.description, row.sourceDate,
          row.keepstockBoxNumber, row.barcode,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
      }).join(",");

      await client.query(
        `INSERT INTO system_inventory_rows
          (snapshot_id, sku, rack_number_raw, rack_number_normalized, price, system_qty,
           description, source_date, keepstock_box_number, barcode)
         VALUES ${placeholders}`,
        values,
      );
    }

    await client.query(
      `UPDATE stock_take_sessions
       SET system_snapshot_id = $2, updated_at = now()
       WHERE id = $1`,
      [sessionId, snapshotId],
    );

    await client.query(
      `UPDATE upload_batches
       SET processing_status='SUCCESS', row_count=$2, valid_row_count=$2, invalid_row_count=0
       WHERE id=$1`,
      [uploadBatchId, input.rows.length],
    );

    await client.query("COMMIT");
    return { uploadBatchId, snapshotId, inserted: input.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
