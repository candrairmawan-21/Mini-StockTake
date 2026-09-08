import { Router } from "express";
import type { Pool } from "pg";
import { issueStoreLogin } from "./auth";

export function loginRouter(pool: Pool): Router {
  const router=Router();
  router.get("/stores", async (_req,res)=>{
    const r=await pool.query(`SELECT store_code AS "storeCode", store_name AS "storeName" FROM stores WHERE is_active=true ORDER BY store_code`);
    res.json({stores:r.rows});
  });
  router.post("/login", async (req,res)=>{
    try {
      const storeName=String(req.body?.storeName??"").trim();
      if(!storeName) return res.status(400).json({error:"STORE_REQUIRED",message:"Silakan pilih toko."});
      const result=await issueStoreLogin(pool,storeName);
      res.json(result);
    } catch(e) {
      const code=e instanceof Error?e.message:"LOGIN_ERROR";
      const status=code==="STORE_NOT_FOUND"?404:code==="STORE_USER_NOT_PROVISIONED"?403:500;
      res.status(status).json({error:code,message:code==="STORE_NOT_FOUND"?"Toko tidak ditemukan.":code==="STORE_USER_NOT_PROVISIONED"?"User toko belum diprovision di database.":"Login gagal."});
    }
  });
  return router;
}
