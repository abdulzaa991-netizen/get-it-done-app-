-- Email verification. Unverified accounts can browse but not post, quote, message, accept or pay,
-- and admin rights (ADMIN_EMAILS) only apply to a verified address.
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;

-- Accounts created before this migration are treated as verified (there are no live users yet).
UPDATE users SET email_verified_at = created_at;

-- Verification links: only the SHA-256 hash is stored; single use, expire after 24 hours.
CREATE TABLE email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX email_verifications_user ON email_verifications(user_id);
