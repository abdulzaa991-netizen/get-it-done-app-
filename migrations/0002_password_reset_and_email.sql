-- Password reset tokens (only the SHA-256 hash is stored; links expire after 1 hour, single use).
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX password_resets_user ON password_resets(user_id);

-- Users can turn off "new message" emails. Transactional job/payment emails always send.
ALTER TABLE users ADD COLUMN notify_messages INTEGER NOT NULL DEFAULT 1;

-- Local development only: emails are captured here when DEV_OUTBOX is "true" and no provider key is set.
CREATE TABLE dev_outbox (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
