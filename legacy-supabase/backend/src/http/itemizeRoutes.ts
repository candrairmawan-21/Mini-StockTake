import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import type { Pool } from "pg";
import { parseItemize } from "../parsers/itemize";
import { applyItemizeBatch } from "../api/uploadItemize";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function itemizeRouter(pool: Pool): Router {
  const router = Router();

  router.post("/:sessionId/itemize", upload.single("file"), async (req, res) => {
    const client = await pool.connect();
    try {
      const sessionId = req.params.sessionId as string;
      await requireSessionAccess(pool, req, sessionId);
      const uploadedBy = req.authUser!.id;
      if (!req.file) return res.status(400).json({ error: "MISSING_FILE" });

      const parsed = parseItemize(req.file.buffer);
      if (parsed.rows.length === 0) {
        return res.status(400).json({ error: "NO_VALID_ROWS", invalidCount: parsed.invalidRawRowCount });
      }

      // applyItemizeBatch expects an existing upload_batches row —
      // create it here, matching DATABASE_SCHEMA.md's upload_batches
      // shape (mirrors what importSystemDbSnapshot does for System DB).
      const originalName = req.file.originalname;
      const fileHash = createHash("sha256").update(req.file.buffer).digest("hex");
      const duplicate = await client.query<{id:string; processing_status:string}>(`SELECT id,processing_status FROM upload_batches WHERE session_id=$1 AND upload_type='ITEMIZE' AND file_hash=$2`, [sessionId,fileHash]);
      if (duplicate.rows.length) return res.status(200).json({ uploadBatchId: duplicate.rows[0].id, duplicate: true, processingStatus: duplicate.rows[0].processing_status });
      const batch = await client.query<{ id: string }>(
        `INSERT INTO upload_batches
          (session_id, upload_type, file_name, file_hash, storage_path, upload_date, uploaded_by, processing_status)
         VALUES ($1,'ITEMIZE',$2,$3,$4,CURRENT_DATE,$5,'PROCESSING')
         RETURNING id`,
        [sessionId, originalName, fileHash, `itemize/${sessionId}/${Date.now()}-${originalName}`, uploadedBy ?? null],
      );
      const uploadBatchId = batch.rows[0].id;

      const result = await applyItemizeBatch(pool, sessionId, uploadBatchId, parsed.rows);

      await client.query(
        `UPDATE upload_batches SET processing_status='SUCCESS', row_count=$2, valid_row_count=$2, invalid_row_count=$3 WHERE id=$1`,
        [uploadBatchId, parsed.rows.length, parsed.invalidRawRowCount],
      );

      res.status(201).json({
        uploadBatchId,
        ...result,
        duplicateRawRowsDiscarded: parsed.duplicateRawRowCount,
        invalidRawRowCount: parsed.invalidRawRowCount,
      });
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    } finally {
      client.release();
    }
  });

  return router;
}
