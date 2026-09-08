import { Router } from "express";
import type { Pool } from "pg";
import { generateRackForm } from "../api/formGeneration";
import { getRackWorkingViewV2 } from "../api/workingView";
import { updateLastActiveRack } from "../api/session";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

export function rackRouter(pool: Pool): Router {
  const router = Router();

  /** Lists racks already present in the session, with simple progress counts. */
  router.get("/:sessionId/racks", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await requireSessionAccess(pool, req, sessionId);
      const result = await pool.query(`
        SELECT rack_number_normalized AS rack,
               COUNT(*)::int AS "totalLines",
               COUNT(*) FILTER (WHERE physical_qty IS NOT NULL)::int AS "countedLines"
        FROM stock_take_items
        WHERE session_id = $1
        GROUP BY rack_number_normalized
        ORDER BY rack_number_normalized
      `, [sessionId]);
      res.json({ racks: result.rows });
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    }
  });

  /** Opens a rack: generates/refreshes its checklist, then returns the current view. */
  router.post("/:sessionId/racks/:rack/open", async (req, res) => {
    try {
      const { sessionId, rack } = req.params;
      await requireSessionAccess(pool, req, sessionId);
      const genResult = await generateRackForm(pool, sessionId, rack);
      await updateLastActiveRack(pool, sessionId, rack);
      const view = await getRackWorkingViewV2(pool, sessionId, rack);
      res.json({ generated: genResult, items: view.rows });
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    }
  });

  /** Read-only re-fetch of a rack already opened — does not re-run form generation. */
  router.get("/:sessionId/racks/:rack", async (req, res) => {
    try {
      const { sessionId, rack } = req.params;
      await requireSessionAccess(pool, req, sessionId);
      const view = await getRackWorkingViewV2(pool, sessionId, rack);
      res.json({ items: view.rows });
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    }
  });

  return router;
}
