-- Get It Done: initial schema. Money is stored as integer cents (AUD). Times are unix ms.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  suburb TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  -- Worker / business details. Self-declared until verification is built (see docs/LEGAL.md).
  is_business INTEGER NOT NULL DEFAULT 0,
  business_name TEXT NOT NULL DEFAULT '',
  abn TEXT NOT NULL DEFAULT '',
  trades TEXT NOT NULL DEFAULT '',
  licence_no TEXT NOT NULL DEFAULT '',
  insured INTEGER NOT NULL DEFAULT 0,
  stripe_account_id TEXT,
  payouts_enabled INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- status: open -> awaiting_payment -> funded -> done -> released
--         open/awaiting_payment -> cancelled;  funded/done -> disputed -> released | refunded
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  poster_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('home', 'trade')),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suburb TEXT NOT NULL,
  postcode TEXT NOT NULL,
  -- Only shown to the assigned worker once the job is funded.
  address TEXT NOT NULL DEFAULT '',
  pricing TEXT NOT NULL CHECK (pricing IN ('fixed', 'quote')),
  budget_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  worker_id TEXT REFERENCES users(id),
  quote_id TEXT,
  amount_cents INTEGER,
  fee_cents INTEGER,
  done_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_status ON jobs(status, created_at);
CREATE INDEX jobs_poster ON jobs(poster_id);
CREATE INDEX jobs_worker ON jobs(worker_id);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, worker_id)
);

-- One chat thread per (job, worker): the poster can talk to each worker who quoted.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  worker_id TEXT NOT NULL REFERENCES users(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_thread ON messages(job_id, worker_id, created_at);

-- status: pending (checkout started) -> held -> released | refunded
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  amount_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  simulated INTEGER NOT NULL DEFAULT 0,
  checkout_session_id TEXT,
  payment_intent_id TEXT,
  transfer_id TEXT,
  refund_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX payments_job ON payments(job_id);
CREATE UNIQUE INDEX payments_checkout ON payments(checkout_session_id);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  reviewee_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (job_id, reviewer_id)
);
CREATE INDEX reviews_reviewee ON reviews(reviewee_id);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  raised_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  resolution TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- Stripe webhook idempotency.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Simple fixed-window rate limiting (login, signup, posting).
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
