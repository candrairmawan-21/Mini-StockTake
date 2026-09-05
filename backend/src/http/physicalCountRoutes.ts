import { Router } from "express";
import type { Pool } from "pg";
import { savePhysicalQty } from "../api/physicalCount";
import { errorToHttp } from "./errors";
import { requireSessionAccess } from "./auth";

export function physicalCountRouter(pool: Pool): Router {
  const router = Router();

  /** One line at a time — BUSINESS_RULES.md §6b, never a batch/file operation. */
  router.put("/items/:itemId/physical-qty", async (req, res) => {
    try {
      const { itemId } = req.params;
      const owner = await pool.query<{session_id:string}>(`SELECT session_id FROM stock_take_items WHERE id=$1`, [itemId]);
      if (!owner.rows.length) return res.status(404).json({ error: "ITEM_NOT_FOUND" });
      await requireSessionAccess(pool, req, owner.rows[0].session_id);
      const { physicalQty, reason } = req.body as { physicalQty?: number | null; reason?: string };
      const userId = req.authUser!.id;
      if (physicalQty !== null && typeof physicalQty !== "number") {
        return res.status(400).json({ error: "INVALID_PHYSICAL_QTY" });
      }

      await savePhysicalQty(pool, itemId, userId, physicalQty ?? null, reason);
      res.status(204).send();
    } catch (error) {
      const { status, code, message } = errorToHttp(error);
      res.status(status).json({ error: code, message });
    }
  });

  return router;
}
