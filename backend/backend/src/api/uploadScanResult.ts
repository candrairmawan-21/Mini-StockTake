/**
 * Scan Result upload pipeline — PROCESSING_ENGINE_SPEC.md §3,
 * BUSINESS_RULES.md §7 (recount = replace, never sum).
 *
 * Steps 1-6 (auth, session resolve, snapshot resolve, parse, validate,
 * normalize) happen before this; this file covers steps 7-10:
 * derive -> upsert -> history -> commit.
 */

import type { Pool, PoolClient } from "pg";
import { DerivedScanRow } from "../parsers/scanResult";

const BATCH_SIZE = 2000; // DATABASE_SCHEMA.md §5.3 — chunked bulk writes

export async function applyScanResultBatch(
  pool: Pool,
  sessionId: string,
  uploadBatchId: string,
  derivedRows: DerivedScanRow[],
  changedByUserId: string
): Promise<{ inserted: number; updated: number }> {
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (let i = 0; i < derivedRows.length; i += BATCH_SIZE) {
      const chunk = derivedRows.slice(i, i + BATCH_SIZE);
      const result = await upsertChunk(client, sessionId, uploadBatchId, chunk, changedByUserId);
      inserted += result.inserted;
      updated += result.updated;
    }

    await client.query("COMMIT");
    return { inserted, updated };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function upsertChunk(
  client: PoolClient,
  sessionId: string,
  uploadBatchId: string,
  chunk: DerivedScanRow[],
  changedByUserId: string
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const row of chunk) {
    // Read current value first so we can write history + know insert vs update.
    const current = await client.query<{ id: string; scan_qty: string | null }>(
      `SELECT id, scan_qty FROM scan_results
       WHERE session_id = $1 AND sku = $2 AND rack_number_normalized = $3`,
      [sessionId, row.sku, row.rackNumberNormalized]
    );

    if (current.rows.length === 0) {
      await client.query(
        `INSERT INTO scan_results
           (session_id, sku, rack_number_raw, rack_number_normalized, scan_qty, source_upload_batch_id, last_updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sessionId, row.sku, row.rackNumberRaw, row.rackNumberNormalized, row.scanQty, uploadBatchId, changedByUserId]
      );
      inserted++;
      continue;
    }

    const existing = current.rows[0];
    const previousQty = existing.scan_qty === null ? null : Number(existing.scan_qty);

    // Recount rule: REPLACE, never sum (BUSINESS_RULES.md §7). Each file
    // represents a complete recount for the rack it covers.
    if (previousQty !== row.scanQty) {
      await client.query(
        `UPDATE scan_results
         SET scan_qty = $2, source_upload_batch_id = $3, last_updated_by = $4, last_updated_at = now()
         WHERE id = $1`,
        [existing.id, row.scanQty, uploadBatchId, changedByUserId]
      );

      await client.query(
        `INSERT INTO scan_result_history
           (scan_result_id, session_id, sku, rack_number_normalized,
            previous_scan_qty, new_scan_qty, source_upload_batch_id, changed_by, change_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECOUNT_UPLOAD')`,
        [existing.id, sessionId, row.sku, row.rackNumberNormalized, previousQty, row.scanQty, uploadBatchId, changedByUserId]
      );
      updated++;
    }
  }

  return { inserted, updated };
}
