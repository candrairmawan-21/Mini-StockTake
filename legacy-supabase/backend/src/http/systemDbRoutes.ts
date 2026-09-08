import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import type { Pool } from "pg";
import { parseSystemDb } from "../parsers/systemDb";
import { importSystemDbSnapshot } from "../api/systemDbSnapshot";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Authenticated upload; uploadedBy comes from verified auth context. */
export function systemDbRouter(pool: Pool): Router {
  const router = Router();

  router.post("/:sessionId/system-db", upload.single("file"), async (req, res) => {
    try {
      const sessionId = req.params.sessionId as string;
      await requireSessionAccess(pool, req, sessionId);
      const uploadedBy = req.authUser!.id;
      if (!req.file) return res.status(400).json({ error: "MISSING_FILE" });

      const content = req.file.buffer.toString("utf-8");
      const parsed = parseSystemDb(content);

      if (parsed.validRows.length === 0) {
        return res.status(400).json({
          error: "NO_VALID_ROWS",
          invalidCount: parsed.invalidRows.length,
          sampleInvalid: parsed.invalidRows.slice(0, 5),
        });
      }

      const originalName = req.file.originalname;
      const fileHash = createHash("sha256").update(req.file.buffer).digest("hex");
      const duplicate = await pool.query<{id:string; processing_status:string}>(`SELECT id,processing_status FROM upload_batches WHERE session_id=$1 AND upload_type='SYSTEM_DATABASE' AND file_hash=$2`, [sessionId,fileHash]);
      if (duplicate.rows.length) return res.status(200).json({ uploadBatchId: duplicate.rows[0].id, duplicate: true, processingStatus: duplicate.rows[0].processing_status });
      const today = new Date().toISOString().slice(0, 10);
      const result = await importSystemDbSnapshot(pool, sessionId, {
        fileName: originalName,
        storagePath: `system-db/${sessionId}/${Date.now()}-${originalName}`,
        uploadDate: today,
        snapshotDate: today,
        uploadedBy: uploadedBy ?? null,
        fileHash,
        rows: parsed.validRows,
      });

      res.status(201).json({
        ...result,
        validRowCount: parsed.validRows.length,
        invalidRowCount: parsed.invalidRows.length,
        // Sample only — full invalid list can be large (DATA_FORMAT.md §11 scale).
        sampleInvalid: parsed.invalidRows.slice(0, 20),
      });
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    }
  });

  return router;
}
