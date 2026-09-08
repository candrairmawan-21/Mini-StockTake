-- Store-only login for the internal Midnorth Backend System.
-- No email/password is required by the browser UI. A short-lived opaque token
-- is issued after selecting an active store and mapped to a STORE_USER account.
CREATE TABLE IF NOT EXISTS store_login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(64) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_login_sessions_token ON store_login_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_store_login_sessions_user ON store_login_sessions(user_id);
