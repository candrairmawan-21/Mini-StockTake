import { Router } from "express";
import type { Pool } from "pg";
import { generateRackForm } from "../api/formGeneration";
import { getRackWorkingViewV2 } from "../api/workingView";
import { updateLastActiveRack } from "../api/session";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

export function rackRouter(pool: Pool): Router {
  const router = Router();

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
