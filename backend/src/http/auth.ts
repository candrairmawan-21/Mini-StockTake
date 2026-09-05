import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import type { Pool } from "pg";

export interface AuthUser { id: string; storeId: string | null; role: "STORE_USER" | "SUPERVISOR" | "ADMIN"; authProviderId: string; }

declare global { namespace Express { interface Request { authUser?: AuthUser } } }

export function authMiddleware(pool: Pool) {
  const supabase = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_ANON_KEY ?? "");
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "UNAUTHENTICATED" });
      const token = header.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: "INVALID_TOKEN" });
      const db = await pool.query<{ id:string; store_id:string|null; role:AuthUser["role"]; auth_provider_id:string }>(
        `SELECT id,store_id,role,auth_provider_id FROM users WHERE auth_provider_id=$1 AND is_active=true`, [data.user.id]);
      if (!db.rows.length) return res.status(403).json({ error: "USER_NOT_PROVISIONED" });
      req.authUser = { id: db.rows[0].id, storeId: db.rows[0].store_id, role: db.rows[0].role, authProviderId: db.rows[0].auth_provider_id };
      next();
    } catch { res.status(500).json({ error: "AUTH_ERROR" }); }
  };
}

export function requireStoreAccess(req: Request, storeId: string) {
  const u = req.authUser;
  if (!u) throw new Error("UNAUTHENTICATED");
  if (u.role === "ADMIN" || u.role === "SUPERVISOR") return;
  if (u.storeId !== storeId) throw new Error("STORE_ACCESS_DENIED");
}

export async function requireSessionAccess(pool: Pool, req: Request, sessionId: string) {
  const r = await pool.query<{store_id:string}>(`SELECT store_id FROM stock_take_sessions WHERE id=$1`, [sessionId]);
  if (!r.rows.length) throw new Error("SESSION_NOT_FOUND");
  requireStoreAccess(req, r.rows[0].store_id);
}
