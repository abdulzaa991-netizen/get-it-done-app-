import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Env, feeBps, isAdmin, isSimulated } from './env';
import { hashPassword, newId, randomToken, sha256, verifyPassword } from './lib/crypto';
import { CATEGORIES, LICENSED_CATEGORIES, dollarsToCents, maskContactDetails, platformFee, transition, type Actor, type JobAction, type JobStatus } from './lib/rules';
import { markFunded, refundPayment, releasePayment } from './payments';
import { stripeFor, verifyStripeWebhook } from './stripe';

interface User {
  id: string;
  email: string;
  name: string;
  suburb: string;
  postcode: string;
  bio: string;
  is_business: number;
  business_name: string;
  abn: string;
  trades: string;
  licence_no: string;
  insured: number;
  stripe_account_id: string | null;
  payouts_enabled: number;
  created_at: number;
}

interface Job {
  id: string;
  poster_id: string;
  kind: 'home' | 'trade';
  category: string;
  title: string;
  description: string;
  suburb: string;
  postcode: string;
  address: string;
  pricing: 'fixed' | 'quote';
  budget_cents: number | null;
  status: JobStatus;
  worker_id: string | null;
  quote_id: string | null;
  amount_cents: number | null;
  fee_cents: number | null;
  done_at: number | null;
  created_at: number;
  updated_at: number;
}

type Vars = { user: User | null };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const SESSION_COOKIE = 'gid_session';
const SESSION_DAYS = 30;

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------- helpers ----------

class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 429 | 502, message: string) {
    super(message);
  }
}
const fail = (status: HttpError['status'], message: string): never => {
  throw new HttpError(status, message);
};

function str(v: unknown, field: string, max: number, min = 0): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) fail(400, min > 1 ? `${field} needs at least ${min} characters` : `${field} is required`);
  if (s.length > max) fail(400, `${field} is too long (max ${max})`);
  return s;
}

const postcode = (v: unknown) => {
  const s = str(v, 'Postcode', 4, 4);
  if (!/^\d{4}$/.test(s)) fail(400, 'Postcode must be 4 digits');
  return s;
};

async function body(c: C): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' ? b : {};
  } catch {
    return {};
  }
}

function requireUser(c: C): User {
  const u = c.get('user');
  if (!u) fail(401, 'Please log in');
  return u!;
}

async function rateLimit(env: Env, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT count, window_start FROM rate_limits WHERE key = ?`).bind(key).first<{ count: number; window_start: number }>();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare(`INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)`).bind(key, now).run();
    return;
  }
  if (row.count >= limit) fail(429, 'Too many attempts. Please wait a few minutes and try again.');
  await env.DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
}

const clientIp = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';

/** What anyone can see about a user. Email, address and payout details are never public. */
function publicUser(u: User, rating?: { avg: number | null; count: number }) {
  return {
    id: u.id,
    name: u.name,
    suburb: u.suburb,
    bio: u.bio,
    isBusiness: !!u.is_business,
    businessName: u.business_name,
    abn: u.abn,
    trades: u.trades,
    licenceNo: u.licence_no,
    insured: !!u.insured,
    payoutsReady: !!u.payouts_enabled,
    memberSince: u.created_at,
    rating: rating ? { avg: rating.avg ? Math.round(rating.avg * 10) / 10 : null, count: rating.count } : undefined,
  };
}

async function ratingFor(env: Env, userId: string) {
  return (await env.DB.prepare(`SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE reviewee_id = ?`).bind(userId).first<{ avg: number | null; count: number }>())!;
}

async function getJob(env: Env, id: string): Promise<Job> {
  const job = await env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(id).first<Job>();
  if (!job) fail(404, 'Job not found');
  return job!;
}

function roleOn(job: Job, user: User | null, env: Env): Actor | null {
  if (!user) return null;
  if (user.id === job.poster_id) return 'poster';
  if (user.id === job.worker_id) return 'worker';
  if (isAdmin(env, user.email)) return 'admin';
  return null;
}

/** Applies a state-machine transition with an optimistic check so concurrent requests can't both win. */
async function moveJob(env: Env, job: Job, action: JobAction, actor: Actor, extra: Record<string, unknown> = {}) {
  const next = transition(job.status, action, actor);
  if (!next) fail(409, `Can't ${action.replace('_', ' ')} a job that is ${job.status.replace('_', ' ')}`);
  const cols = Object.keys(extra);
  const set = ['status = ?', 'updated_at = ?', ...cols.map((k) => `${k} = ?`)].join(', ');
  const r = await env.DB.prepare(`UPDATE jobs SET ${set} WHERE id = ? AND status = ?`)
    .bind(next, Date.now(), ...cols.map((k) => extra[k]), job.id, job.status)
    .run();
  if (r.meta.changes !== 1) fail(409, 'This job just changed. Refresh and try again.');
  return next!;
}

// ---------- middleware ----------

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

app.use('/api/*', async (c, next) => {
  // CSRF: state-changing requests must be JSON from our own origin. Browsers can't send
  // cross-site JSON without a CORS preflight, which we never grant. The Stripe webhook is exempt
  // (it is authenticated by its signature instead).
  if (c.req.method !== 'GET' && c.req.path !== '/api/stripe/webhook') {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) fail(403, 'Bad origin');
    if (!(c.req.header('Content-Type') ?? '').startsWith('application/json')) fail(400, 'Expected JSON');
  }
  const token = getCookie(c, SESSION_COOKIE);
  let user: User | null = null;
  if (token) {
    user = await c.env.DB.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).bind(await sha256(token), Date.now()).first<User>();
  }
  c.set('user', user);
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

// ---------- auth ----------

async function startSession(c: C, userId: string) {
  const token = randomToken();
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  await c.env.DB.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`).bind(await sha256(token), userId, expires).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

app.post('/api/auth/signup', async (c) => {
  await rateLimit(c.env, `signup:${clientIp(c)}`, 10, 3_600_000);
  const b = await body(c);
  const email = str(b.email, 'Email', 200, 3).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'That email doesn’t look right');
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 10) fail(400, 'Password needs at least 10 characters');
  if (password.length > 200) fail(400, 'Password is too long');
  if (b.acceptTerms !== true) fail(400, 'Please accept the terms and privacy policy');
  const name = str(b.name, 'Name', 80, 2);
  const id = newId();
  const now = Date.now();
  const exists = await c.env.DB.prepare(`SELECT 1 FROM users WHERE email = ?`).bind(email).first();
  if (exists) fail(409, 'An account with that email already exists. Try logging in.');
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, name, suburb, postcode, terms_accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, email, await hashPassword(password), name, str(b.suburb, 'Suburb', 60), b.postcode ? postcode(b.postcode) : '', now, now).run();
  await startSession(c, id);
  return c.json({ ok: true }, 201);
});

app.post('/api/auth/login', async (c) => {
  const b = await body(c);
  const email = str(b.email, 'Email', 200, 3).toLowerCase();
  await rateLimit(c.env, `login:${clientIp(c)}`, 20, 900_000);
  await rateLimit(c.env, `login:${email}`, 10, 900_000);
  const row = await c.env.DB.prepare(`SELECT id, password_hash FROM users WHERE email = ?`).bind(email).first<{ id: string; password_hash: string }>();
  const ok = row && (await verifyPassword(String(b.password ?? ''), row.password_hash));
  if (!ok) fail(401, 'Email or password is wrong');
  await startSession(c, row!.id);
  return c.json({ ok: true });
});

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// ---------- meta & profiles ----------

app.get('/api/meta', (c) =>
  c.json({
    categories: CATEGORIES,
    licensedCategories: [...LICENSED_CATEGORIES],
    feeBps: feeBps(c.env),
    simulatedPayments: isSimulated(c.env),
    autoReleaseDays: Number(c.env.AUTO_RELEASE_DAYS || 5),
  }),
);

app.get('/api/me', async (c) => {
  const u = c.get('user');
  if (!u) return c.json({ user: null });
  return c.json({
    user: { ...publicUser(u, await ratingFor(c.env, u.id)), email: u.email, postcode: u.postcode, isAdmin: isAdmin(c.env, u.email) },
  });
});

app.put('/api/me', async (c) => {
  const u = requireUser(c);
  const b = await body(c);
  const abn = str(b.abn, 'ABN', 14).replace(/\s/g, '');
  if (abn && !/^\d{11}$/.test(abn)) fail(400, 'ABN must be 11 digits');
  await c.env.DB.prepare(
    `UPDATE users SET name = ?, suburb = ?, postcode = ?, bio = ?, is_business = ?, business_name = ?, abn = ?, trades = ?, licence_no = ?, insured = ? WHERE id = ?`,
  ).bind(
    str(b.name, 'Name', 80, 2),
    str(b.suburb, 'Suburb', 60),
    b.postcode ? postcode(b.postcode) : '',
    str(b.bio, 'Bio', 1000),
    b.isBusiness ? 1 : 0,
    str(b.businessName, 'Business name', 120),
    abn,
    str(b.trades, 'Trades', 200),
    str(b.licenceNo, 'Licence number', 40),
    b.insured ? 1 : 0,
    u.id,
  ).run();
  return c.json({ ok: true });
});

app.get('/api/users/:id', async (c) => {
  const u = await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(c.req.param('id')).first<User>();
  if (!u) fail(404, 'User not found');
  const { results: reviews } = await c.env.DB.prepare(
    `SELECT r.rating, r.body, r.created_at, u.name AS reviewer FROM reviews r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewee_id = ? ORDER BY r.created_at DESC LIMIT 20`,
  ).bind(u!.id).all();
  return c.json({ user: publicUser(u!, await ratingFor(c.env, u!.id)), reviews });
});

// ---------- jobs ----------

const jobListCols = `j.id, j.kind, j.category, j.title, j.suburb, j.postcode, j.pricing, j.budget_cents, j.status, j.created_at,
  (SELECT COUNT(*) FROM quotes q WHERE q.job_id = j.id AND q.status = 'pending') AS quote_count`;

app.get('/api/jobs', async (c) => {
  const q = c.req.query();
  const where = [`j.status = 'open'`];
  const args: unknown[] = [];
  if (q.kind === 'home' || q.kind === 'trade') (where.push('j.kind = ?'), args.push(q.kind));
  if (q.category && (CATEGORIES as readonly string[]).includes(q.category)) (where.push('j.category = ?'), args.push(q.category));
  // Postcode "near me": same first 3 digits is a rough-but-useful local area in Australia.
  if (/^\d{4}$/.test(q.postcode ?? '')) (where.push('substr(j.postcode, 1, 3) = ?'), args.push(q.postcode.slice(0, 3)));
  if (q.q) (where.push(`(j.title LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')`), args.push(...Array(2).fill(`%${q.q.slice(0, 50).replace(/[\\%_]/g, '\\$&')}%`)));
  const { results } = await c.env.DB.prepare(`SELECT ${jobListCols} FROM jobs j WHERE ${where.join(' AND ')} ORDER BY j.created_at DESC LIMIT 50`).bind(...args).all();
  return c.json({ jobs: results });
});

app.get('/api/jobs/mine', async (c) => {
  const u = requireUser(c);
  const posted = await c.env.DB.prepare(`SELECT ${jobListCols} FROM jobs j WHERE j.poster_id = ? ORDER BY j.updated_at DESC LIMIT 100`).bind(u.id).all();
  const working = await c.env.DB.prepare(`SELECT ${jobListCols} FROM jobs j WHERE j.worker_id = ? ORDER BY j.updated_at DESC LIMIT 100`).bind(u.id).all();
  const quoted = await c.env.DB.prepare(
    `SELECT ${jobListCols}, q.amount_cents AS my_quote_cents, q.status AS my_quote_status FROM quotes q JOIN jobs j ON j.id = q.job_id
     WHERE q.worker_id = ? AND q.status = 'pending' ORDER BY q.created_at DESC LIMIT 100`,
  ).bind(u.id).all();
  return c.json({ posted: posted.results, working: working.results, quoted: quoted.results });
});

app.post('/api/jobs', async (c) => {
  const u = requireUser(c);
  await rateLimit(c.env, `post:${u.id}`, 20, 86_400_000);
  const b = await body(c);
  const kind = b.kind === 'trade' ? 'trade' : 'home';
  const category = String(b.category ?? '');
  if (!(CATEGORIES as readonly string[]).includes(category)) fail(400, 'Pick a category');
  const pricing = b.pricing === 'fixed' ? 'fixed' : 'quote';
  let budget: number | null = null;
  if (pricing === 'fixed' || (b.budget !== undefined && b.budget !== '')) {
    budget = dollarsToCents(b.budget);
    if (budget === null) fail(400, 'Price must be between $10 and $50,000');
  }
  const id = newId();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO jobs (id, poster_id, kind, category, title, description, suburb, postcode, address, pricing, budget_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, u.id, kind, category,
    str(b.title, 'Title', 100, 5),
    str(b.description, 'Description', 4000, 20),
    str(b.suburb, 'Suburb', 60, 2),
    postcode(b.postcode),
    str(b.address, 'Address', 200),
    pricing, budget, now, now,
  ).run();
  return c.json({ id }, 201);
});

app.get('/api/jobs/:id', async (c) => {
  const user = c.get('user');
  const job = await getJob(c.env, c.req.param('id'));
  const role = roleOn(job, user, c.env);
  if (job.status !== 'open' && !role) fail(404, 'Job not found');

  const poster = (await c.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(job.poster_id).first<User>())!;
  const { results: quoteRows } = await c.env.DB.prepare(
    `SELECT q.*, u.name, u.suburb, u.is_business, u.business_name, u.trades, u.licence_no, u.insured, u.payouts_enabled, u.abn, u.bio, u.created_at AS u_created
     FROM quotes q JOIN users u ON u.id = q.worker_id WHERE q.job_id = ? ORDER BY q.created_at`,
  ).bind(job.id).all<any>();
  const visibleQuotes = quoteRows.filter((q) => role === 'poster' || role === 'admin' || q.worker_id === user?.id);
  const quotes = await Promise.all(
    visibleQuotes.map(async (q) => ({
      id: q.id,
      amountCents: q.amount_cents,
      message: q.message,
      status: q.status,
      createdAt: q.created_at,
      worker: publicUser({ ...q, id: q.worker_id, created_at: q.u_created } as User, await ratingFor(c.env, q.worker_id)),
    })),
  );

  // Chat threads: the poster sees one per worker who messaged or quoted; anyone else only their own.
  let threads: { workerId: string; name: string }[] = [];
  if (role === 'poster' || role === 'admin') {
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT u.id AS workerId, u.name FROM users u WHERE u.id IN (SELECT worker_id FROM messages WHERE job_id = ? UNION SELECT worker_id FROM quotes WHERE job_id = ?)`,
    ).bind(job.id, job.id).all<{ workerId: string; name: string }>();
    threads = results;
  }

  const funded = ['funded', 'done', 'released', 'disputed', 'refunded'].includes(job.status);
  const myReview = user
    ? await c.env.DB.prepare(`SELECT rating FROM reviews WHERE job_id = ? AND reviewer_id = ?`).bind(job.id, user.id).first()
    : null;

  return c.json({
    job: {
      id: job.id,
      kind: job.kind,
      category: job.category,
      title: job.title,
      description: job.description,
      suburb: job.suburb,
      postcode: job.postcode,
      // Exact address only for the poster, and for the hired worker once the money is held.
      address: role === 'poster' || role === 'admin' || (role === 'worker' && funded) ? job.address : null,
      pricing: job.pricing,
      budgetCents: job.budget_cents,
      status: job.status,
      workerId: job.worker_id,
      amountCents: job.amount_cents,
      feeCents: role === 'poster' ? undefined : job.fee_cents,
      doneAt: job.done_at,
      createdAt: job.created_at,
      licensedCategory: LICENSED_CATEGORIES.has(job.category),
    },
    poster: publicUser(poster, await ratingFor(c.env, poster.id)),
    role,
    quotes,
    threads,
    reviewed: !!myReview,
  });
});

app.post('/api/jobs/:id/quotes', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (job.poster_id === u.id) fail(400, 'You can’t quote on your own job');
  if (job.status !== 'open') fail(409, 'This job is no longer taking quotes');
  if (!isSimulated(c.env) && !u.payouts_enabled) fail(400, 'Set up payouts in your profile before quoting, so you can be paid');
  const b = await body(c);
  const amount = job.pricing === 'fixed' ? job.budget_cents! : dollarsToCents(b.amount);
  if (amount === null) fail(400, 'Quote must be between $10 and $50,000');
  const message = maskContactDetails(str(b.message, 'Message', 1000));
  await c.env.DB.prepare(
    `INSERT INTO quotes (id, job_id, worker_id, amount_cents, message, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (job_id, worker_id) DO UPDATE SET amount_cents = excluded.amount_cents, message = excluded.message, status = 'pending', created_at = excluded.created_at
     WHERE quotes.status IN ('pending', 'withdrawn')`,
  ).bind(newId(), job.id, u.id, amount, message, Date.now()).run();
  return c.json({ ok: true }, 201);
});

app.post('/api/jobs/:id/quotes/withdraw', async (c) => {
  const u = requireUser(c);
  await c.env.DB.prepare(`UPDATE quotes SET status = 'withdrawn' WHERE job_id = ? AND worker_id = ? AND status = 'pending'`).bind(c.req.param('id'), u.id).run();
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/accept', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (roleOn(job, u, c.env) !== 'poster') fail(403, 'Only the poster can accept a quote');
  const b = await body(c);
  const quote = await c.env.DB.prepare(`SELECT * FROM quotes WHERE id = ? AND job_id = ? AND status = 'pending'`)
    .bind(String(b.quoteId ?? ''), job.id)
    .first<{ id: string; worker_id: string; amount_cents: number }>();
  if (!quote) fail(404, 'That quote isn’t available any more');
  await moveJob(c.env, job, 'accept_quote', 'poster', {
    worker_id: quote!.worker_id,
    quote_id: quote!.id,
    amount_cents: quote!.amount_cents,
    fee_cents: platformFee(quote!.amount_cents, feeBps(c.env)),
  });
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE quotes SET status = 'accepted' WHERE id = ?`).bind(quote!.id),
    c.env.DB.prepare(`UPDATE quotes SET status = 'declined' WHERE job_id = ? AND id != ? AND status = 'pending'`).bind(job.id, quote!.id),
  ]);
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/pay', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (roleOn(job, u, c.env) !== 'poster') fail(403, 'Only the poster pays for a job');
  if (job.status !== 'awaiting_payment') fail(409, 'This job isn’t waiting for payment');
  const now = Date.now();
  const paymentId = newId();
  const simulated = isSimulated(c.env);
  await c.env.DB.prepare(
    `INSERT INTO payments (id, job_id, amount_cents, fee_cents, simulated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(paymentId, job.id, job.amount_cents, job.fee_cents, simulated ? 1 : 0, now, now).run();

  if (simulated) {
    await markFunded(c.env, paymentId, null);
    return c.json({ simulated: true });
  }
  const base = c.env.APP_URL;
  const session = await stripeFor(c.env).createCheckout({
    jobId: job.id,
    paymentId,
    title: `Get It Done: ${job.title}`,
    amountCents: job.amount_cents!,
    email: u.email,
    successUrl: `${base}/#/jobs/${job.id}?paid=1`,
    cancelUrl: `${base}/#/jobs/${job.id}`,
  });
  await c.env.DB.prepare(`UPDATE payments SET checkout_session_id = ? WHERE id = ?`).bind(session.id, paymentId).run();
  return c.json({ url: session.url });
});

app.post('/api/jobs/:id/cancel', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (roleOn(job, u, c.env) !== 'poster') fail(403, 'Only the poster can cancel');
  await moveJob(c.env, job, 'cancel', 'poster');
  await c.env.DB.prepare(`UPDATE quotes SET status = 'declined' WHERE job_id = ? AND status IN ('pending', 'accepted')`).bind(job.id).run();
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/done', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (roleOn(job, u, c.env) !== 'worker') fail(403, 'Only the hired worker can mark the job done');
  await moveJob(c.env, job, 'mark_done', 'worker', { done_at: Date.now() });
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/confirm', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  if (roleOn(job, u, c.env) !== 'poster') fail(403, 'Only the poster can confirm the job is done');
  if (!transition(job.status, 'confirm', 'poster')) fail(409, 'The worker hasn’t marked this job done yet');
  if (!(await releasePayment(c.env, job.id, ['done']))) fail(409, 'Payment already released or not held');
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/dispute', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  const role = roleOn(job, u, c.env);
  if (role !== 'poster' && role !== 'worker') fail(403, 'Only the poster or hired worker can raise a problem');
  const reason = str((await body(c)).reason, 'Reason', 2000, 10);
  await moveJob(c.env, job, 'dispute', role!);
  await c.env.DB.prepare(`INSERT INTO disputes (id, job_id, raised_by, reason, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId(), job.id, u.id, reason, Date.now())
    .run();
  return c.json({ ok: true });
});

app.post('/api/jobs/:id/reviews', async (c) => {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id'));
  const role = roleOn(job, u, c.env);
  if (role !== 'poster' && role !== 'worker') fail(403, 'Only the people on this job can review it');
  if (job.status !== 'released') fail(409, 'Reviews open once the job is finished and paid');
  const b = await body(c);
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, 'Rating must be 1 to 5 stars');
  const reviewee = role === 'poster' ? job.worker_id! : job.poster_id;
  const r = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO reviews (id, job_id, reviewer_id, reviewee_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId(), job.id, u.id, reviewee, rating, str(b.body, 'Review', 1000), Date.now()).run();
  if (r.meta.changes !== 1) fail(409, 'You’ve already reviewed this job');
  return c.json({ ok: true }, 201);
});

// ---------- chat ----------

/** Resolves which (job, worker) thread the user may access, or fails. */
async function threadFor(c: C, workerParam: unknown) {
  const u = requireUser(c);
  const job = await getJob(c.env, c.req.param('id')!);
  const role = roleOn(job, u, c.env);
  if (role === 'poster' || role === 'admin') {
    const workerId = String(workerParam ?? job.worker_id ?? '');
    if (!workerId) fail(400, 'Pick who to message');
    const known = await c.env.DB.prepare(
      `SELECT 1 FROM quotes WHERE job_id = ?1 AND worker_id = ?2 UNION SELECT 1 FROM messages WHERE job_id = ?1 AND worker_id = ?2 LIMIT 1`,
    ).bind(job.id, workerId).first();
    if (!known) fail(404, 'No conversation with that person on this job');
    return { u, job, workerId };
  }
  // Anyone else can only use their own thread, and only start one while the job is open.
  if (role !== 'worker' && job.status !== 'open') {
    const had = await c.env.DB.prepare(`SELECT 1 FROM messages WHERE job_id = ? AND worker_id = ? LIMIT 1`).bind(job.id, u.id).first();
    if (!had) fail(403, 'This job is no longer open');
  }
  return { u, job, workerId: u.id };
}

app.get('/api/jobs/:id/messages', async (c) => {
  const { job, workerId } = await threadFor(c, c.req.query('worker'));
  const after = Number(c.req.query('after') ?? 0) || 0;
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.sender_id AS senderId, u.name AS senderName, m.body, m.created_at AS createdAt FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.job_id = ? AND m.worker_id = ? AND m.created_at > ? ORDER BY m.created_at LIMIT 200`,
  ).bind(job.id, workerId, after).all();
  return c.json({ messages: results });
});

app.post('/api/jobs/:id/messages', async (c) => {
  const b = await body(c);
  const { u, job, workerId } = await threadFor(c, b.worker);
  if (u.id === job.poster_id && workerId === u.id) fail(400, 'Pick who to message');
  await rateLimit(c.env, `msg:${u.id}`, 120, 3_600_000);
  let text = str(b.body, 'Message', 2000, 1);
  // Until the job is paid for, hide phone numbers/emails so deals (and protection) stay on-platform.
  if (!['funded', 'done', 'released', 'disputed'].includes(job.status) || workerId !== job.worker_id) text = maskContactDetails(text);
  await c.env.DB.prepare(`INSERT INTO messages (id, job_id, worker_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(newId(), job.id, workerId, u.id, text, Date.now())
    .run();
  return c.json({ ok: true }, 201);
});

// ---------- payouts (Stripe Connect Express) ----------

app.post('/api/payouts/onboard', async (c) => {
  const u = requireUser(c);
  if (isSimulated(c.env)) {
    await c.env.DB.prepare(`UPDATE users SET payouts_enabled = 1 WHERE id = ?`).bind(u.id).run();
    return c.json({ simulated: true });
  }
  const stripe = stripeFor(c.env);
  let account = u.stripe_account_id;
  if (!account) {
    account = (await stripe.createExpressAccount(u.email, u.id)).id;
    await c.env.DB.prepare(`UPDATE users SET stripe_account_id = ? WHERE id = ?`).bind(account, u.id).run();
  }
  const link = await stripe.createAccountLink(account, `${c.env.APP_URL}/#/profile?payouts=retry`, `${c.env.APP_URL}/#/profile?payouts=done`);
  return c.json({ url: link.url });
});

app.post('/api/payouts/refresh', async (c) => {
  const u = requireUser(c);
  if (isSimulated(c.env) || !u.stripe_account_id) return c.json({ payoutsReady: !!u.payouts_enabled });
  const acct = await stripeFor(c.env).getAccount(u.stripe_account_id);
  const ready = acct.payouts_enabled && acct.capabilities?.transfers === 'active';
  await c.env.DB.prepare(`UPDATE users SET payouts_enabled = ? WHERE id = ?`).bind(ready ? 1 : 0, u.id).run();
  return c.json({ payoutsReady: ready });
});

app.post('/api/stripe/webhook', async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) fail(404, 'Not found');
  const payload = await c.req.text();
  const event = await verifyStripeWebhook(payload, c.req.header('Stripe-Signature') ?? null, c.env.STRIPE_WEBHOOK_SECRET!);
  if (!event) fail(400, 'Bad signature');
  const seen = await c.env.DB.prepare(`INSERT OR IGNORE INTO stripe_events (id, created_at) VALUES (?, ?)`).bind(event.id, Date.now()).run();
  if (seen.meta.changes !== 1) return c.json({ received: true, duplicate: true });

  try {
    const obj = event.data?.object ?? {};
    if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
      const p = await c.env.DB.prepare(`SELECT id FROM payments WHERE checkout_session_id = ?`).bind(obj.id).first<{ id: string }>();
      if (p) await markFunded(c.env, p.id, obj.payment_intent);
    } else if (event.type === 'account.updated') {
      const ready = obj.payouts_enabled && obj.capabilities?.transfers === 'active';
      await c.env.DB.prepare(`UPDATE users SET payouts_enabled = ? WHERE stripe_account_id = ?`).bind(ready ? 1 : 0, obj.id).run();
    }
  } catch (e) {
    // Let Stripe retry: forget we saw it.
    await c.env.DB.prepare(`DELETE FROM stripe_events WHERE id = ?`).bind(event.id).run();
    throw e;
  }
  return c.json({ received: true });
});

// ---------- admin: disputes ----------

function requireAdmin(c: C) {
  const u = requireUser(c);
  if (!isAdmin(c.env, u.email)) fail(403, 'Admins only');
  return u;
}

app.get('/api/admin/disputes', async (c) => {
  requireAdmin(c);
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.job_id AS jobId, d.reason, d.created_at AS createdAt, u.name AS raisedBy, j.title, j.amount_cents AS amountCents
     FROM disputes d JOIN users u ON u.id = d.raised_by JOIN jobs j ON j.id = d.job_id WHERE d.resolved_at IS NULL ORDER BY d.created_at`,
  ).all();
  return c.json({ disputes: results });
});

app.post('/api/admin/disputes/:id/resolve', async (c) => {
  requireAdmin(c);
  const b = await body(c);
  const d = await c.env.DB.prepare(`SELECT * FROM disputes WHERE id = ? AND resolved_at IS NULL`).bind(c.req.param('id')).first<{ id: string; job_id: string }>();
  if (!d) fail(404, 'Dispute not found');
  const outcome = b.outcome === 'refund' ? 'refund' : b.outcome === 'release' ? 'release' : fail(400, 'Outcome must be release or refund');
  const ok = outcome === 'release' ? await releasePayment(c.env, d!.job_id, ['disputed']) : await refundPayment(c.env, d!.job_id);
  if (!ok) fail(409, 'No held payment for this job');
  await c.env.DB.prepare(`UPDATE disputes SET resolution = ?, resolved_at = ? WHERE id = ?`)
    .bind(`${outcome}: ${str(b.note, 'Note', 1000)}`, Date.now(), d!.id)
    .run();
  return c.json({ ok: true });
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
