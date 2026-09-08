import type { Request, Response, NextFunction } from "express";
import type { Pool } from "pg";
import crypto from "crypto";

export interface AuthUser {
  id: string;
  storeId: string | null;
  storeCode: string | null;
  storeName: string | null;
  role: "STORE_USER" | "SUPERVISOR" | "ADMIN";
  authProviderId: string | null;
}

declare global { namespace Express { interface Request { authUser?: AuthUser } } }

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function issueStoreLogin(pool: Pool, storeName: string) {
  const store = await pool.query<{id:string;store_code:string;store_name:string}>(
    `SELECT id, store_code, store_name FROM stores WHERE is_active=true AND lower(store_name)=lower($1) LIMIT 1`,
    [storeName.trim()]
  );
  if (!store.rows.length) throw new Error("STORE_NOT_FOUND");

  const s = store.rows[0];
  const user = await pool.query<{id:string;role:AuthUser["role"]}>(
    `SELECT id, role FROM users WHERE store_id=$1 AND role='STORE_USER' AND is_active=true ORDER BY created_at LIMIT 1`,
    [s.id]
  );
  if (!user.rows.length) throw new Error("STORE_USER_NOT_PROVISIONED");

  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `DELETE FROM store_login_sessions WHERE expires_at < now() OR store_id=$1`, [s.id]
  );
  await pool.query(
    `INSERT INTO store_login_sessions (token_hash,user_id,store_id,expires_at) VALUES ($1,$2,$3,now()+interval '12 hours')`,
    [hashToken(token), user.rows[0].id, s.id]
  );

  return { token, userId:user.rows[0].id, role:user.rows[0].role, storeId:s.id, storeCode:s.store_code, storeName:s.store_name };
}

export function authMiddleware(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.header("authorization");
      if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "UNAUTHENTICATED" });
      const token = header.slice(7).trim();
      if (!token) return res.status(401).json({ error: "UNAUTHENTICATED" });
      const db = await pool.query<{id:string;store_id:string|null;role:AuthUser["role"];store_code:string|null;store_name:string|null;auth_provider_id:string|null}>(
        `SELECT u.id,u.store_id,u.role,s.store_code,s.store_name,u.auth_provider_id
         FROM store_login_sessions ls
         JOIN users u ON u.id=ls.user_id
         LEFT JOIN stores s ON s.id=u.store_id
         WHERE ls.token_hash=$1 AND ls.expires_at>now() AND u.is_active=true`, [hashToken(token)]
      );
      if (!db.rows.length) return res.status(401).json({ error: "INVALID_TOKEN" });
      const r=db.rows[0];
      req.authUser={id:r.id,storeId:r.store_id,storeCode:r.store_code,storeName:r.store_name,role:r.role,authProviderId:r.auth_provider_id};
      next();
    } catch { res.status(500).json({ error: "AUTH_ERROR" }); }
  };
}

export function requireStoreAccess(req: Request, storeId: string) {
  const u=req.authUser;
  if(!u) throw new Error("UNAUTHENTICATED");
  if(u.role==="ADMIN"||u.role==="SUPERVISOR") return;
  if(u.storeId!==storeId) throw new Error("STORE_ACCESS_DENIED");
}

export async function requireSessionAccess(pool: Pool, req: Request, sessionId: string) {
  const r=await pool.query<{store_id:string}>(`SELECT store_id FROM stock_take_sessions WHERE id=$1`,[sessionId]);
  if(!r.rows.length) throw new Error("SESSION_NOT_FOUND");
  requireStoreAccess(req,r.rows[0].store_id);
}
