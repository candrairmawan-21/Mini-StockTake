import express from "express";
import { Pool } from "pg";
import { sessionRouter } from "./sessionRoutes";
import { systemDbRouter } from "./systemDbRoutes";
import { rackRouter } from "./rackRoutes";
import { itemizeRouter } from "./itemizeRoutes";
import { physicalCountRouter } from "./physicalCountRoutes";
import { finalizeRouter } from "./finalizeRoutes";
import { authMiddleware } from "./auth";

/**
 * ⚠️ NOT PRODUCTION-READY — see DEVELOPMENT_STATUS.md §4/§7.
 *
 * No auth middleware is wired in yet. Every route currently trusts
 * `storeId`/`userId`/`uploadedBy`/`finalizedBy` values sent directly
 * in the request body — this violates DATABASE_SCHEMA.md §7
 * ("Do not trust frontend store_id") by design, temporarily, so the
 * HTTP layer itself can be tested end-to-end before auth is added.
 * Auth middleware (Supabase Auth + role check) must sit in front of
 * every route below and inject the authenticated store/user instead,
 * before this is exposed to real users.
 */
export function createApp(pool: Pool) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use(authMiddleware(pool));

  app.use("/sessions", sessionRouter(pool));
  app.use("/sessions", systemDbRouter(pool));
  app.use("/sessions", rackRouter(pool));
  app.use("/sessions", itemizeRouter(pool));
  app.use("/sessions", finalizeRouter(pool));
  app.use("/", physicalCountRouter(pool)); // PUT /items/:itemId/physical-qty

  return app;
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const app = createApp(pool);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  app.listen(port, () => console.log(`Mini Stock Take backend listening on :${port}`));
}
