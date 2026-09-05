import { Router } from "express";
import type { Pool } from "pg";
import { resolveActiveSession, getSessionResumeState } from "../api/session";
import { errorToHttp } from "./errors";
import { requireStoreAccess } from "./auth";

export function sessionRouter(pool: Pool): Router {
  const router = Router();
  router.post("/resolve", async (req, res) => {
    try {
      const u = req.authUser!;
      if (!u.storeId && u.role === "STORE_USER") return res.status(403).json({ error:"STORE_NOT_ASSIGNED" });
      const storeId = u.storeId ?? (req.body?.storeId as string | undefined);
      if (!storeId) return res.status(400).json({ error:"storeId is required for cross-store role" });
      requireStoreAccess(req, storeId);
      res.json(await resolveActiveSession(pool, storeId, u.id));
    } catch (e) { const x=errorToHttp(e); res.status(x.status).json({error:x.code,message:x.message}); }
  });
  router.get("/resume/:storeId", async (req,res)=>{
    try { requireStoreAccess(req,req.params.storeId); const r=await getSessionResumeState(pool,req.params.storeId); if(!r.rows.length)return res.status(404).json({error:"NO_ACTIVE_SESSION"}); res.json(r.rows[0]); }
    catch(e){const x=errorToHttp(e);res.status(x.status).json({error:x.code,message:x.message});}
  });
  return router;
}
