import { Router } from "express";
import type { Pool } from "pg";
import { finalizeStockTake } from "../api/finalize";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

export function finalizeRouter(pool: Pool): Router {
  const router = Router();

  router.post("/:sessionId/finalize", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await requireSessionAccess(pool, req, sessionId);
      const finalizedBy = req.authUser!.id;

      const result = await finalizeStockTake(pool, sessionId, finalizedBy);
      res.json(result);
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      // PHYSICAL_COUNT_INCOMPLETE is the expected day-to-day case, not a
      // real error — return enough detail for the UI to say what's left.
      res.status(status).json({ error: code, message });
    }
  });

  return router;
}
