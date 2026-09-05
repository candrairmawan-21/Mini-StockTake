-- Migration 004: authenticated store isolation + upload idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS uq_upload_batch_hash
  ON upload_batches (session_id, upload_type, file_hash)
  WHERE file_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider_id);
