import express from "express";
import path from "path";
import { Pool } from "pg";
import { sessionRouter } from "./sessionRoutes";
import { systemDbRouter } from "./systemDbRoutes";
import { rackRouter } from "./rackRoutes";
import { itemizeRouter } from "./itemizeRoutes";
import { physicalCountRouter } from "./physicalCountRoutes";
import { finalizeRouter } from "./finalizeRoutes";
import { authMiddleware } from "./auth";

/**
 * ⚠️ PARTIALLY SECURED — see DEVELOPMENT_STATUS.md for current status.
 *
 * `authMiddleware` below verifies a Supabase Auth bearer token and
 * resolves it to an internal `users` row (store, role) before any
 * route runs. Every route handler uses `req.authUser` /
 * `requireStoreAccess` / `requireSessionAccess` — it does not trust
 * `storeId`/`userId` values from the request body anymore.
 *
 * Still outstanding before this can take real traffic: rate limiting,
 * CORS configuration, and end-to-end testing against a real Supabase
 * project (this sandbox could only verify the unauthenticated-request
 * path and the authorization logic in isolation — see
 * DEVELOPMENT_STATUS.md for exactly what was and wasn't verified).
 */
export function createApp(pool: Pool) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true, service: "mini-stock-take-backend" }));
  // Supabase URL + anon key are public client configuration; never expose a service-role key here.
  app.get("/config", (_req, res) => res.json({
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  }));
  app.use(express.static(path.resolve(__dirname, "../../frontend")));
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
