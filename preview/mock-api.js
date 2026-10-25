// Clickable preview only: an in-browser stand-in for the Worker API (src/app.ts), so the real
// front end (public/app.js) can run with no server. Sample data, nothing saved or sent.
// Keep response shapes in step with src/app.ts.
(() => {
  const HOUR = 3_600_000, DAY = 24 * HOUR, now = Date.now();
  const FEE_BPS = 1000;
  const CATEGORIES = ['Handyman', 'Cleaning', 'Gardening', 'Removals', 'Painting', 'Assembly', 'Electrical', 'Plumbing', 'Carpentry', 'Tiling', 'Roofing', 'Concreting', 'Labour hire', 'Other'];
  const LICENSED = ['Electrical', 'Plumbing', 'Roofing'];

  const user = (o) => ({ suburb: '', postcode: '', bio: '', is_business: 0, business_name: '', abn: '', trades: '', licence_no: '', insured: 0, payouts_enabled: 0, notify_messages: 1, email_verified: 1, created_at: now - 200 * DAY, ...o });
  const db = {
    me: 'priya',
    users: [
      user({ id: 'priya', email: 'priya@example.com', name: 'Priya Raman', suburb: 'Newtown', postcode: '2042', created_at: now - 300 * DAY }),
      user({ id: 'sam', email: 'sam@example.com', name: 'Sam Okafor', suburb: 'Petersham', postcode: '2049', bio: 'Handyman for 9 years. Flat-pack, shelving, doors, small repairs and gardens. I bring my own tools and clean up after.', trades: 'Handyman, assembly, gardening', abn: '51824753556', insured: 1, payouts_enabled: 1, is_business: 1, created_at: now - 400 * DAY }),
      user({ id: 'dana', email: 'dana@example.com', name: 'Dana Nguyen', suburb: 'Leichhardt', postcode: '2040', bio: 'Residential repaints across the inner west. We pass on overflow jobs to trusted painters when we’re booked out.', is_business: 1, business_name: 'Nguyen & Co Painting', abn: '33102417032', trades: 'Painting', insured: 1, payouts_enabled: 1, created_at: now - 500 * DAY }),
      user({ id: 'leo', email: 'leo@example.com', name: 'Leo Marsh', suburb: 'Stanmore', postcode: '2048', trades: 'Assembly, removals', insured: 0, payouts_enabled: 1, created_at: now - 40 * DAY }),
      user({ id: 'mark', email: 'mark@example.com', name: 'Mark Chen', suburb: 'Camperdown', postcode: '2050' }),
      user({ id: 'tom', email: 'tom@example.com', name: 'Tom Ferris', suburb: 'Enmore', postcode: '2042', trades: 'Painting', licence_no: '', insured: 1, payouts_enabled: 1, is_business: 1, business_name: 'Ferris Painting', abn: '72004044937' }),
    ],
    jobs: [],
    quotes: [],
    messages: [],
    reviews: [],
  };
  const job = (o) => db.jobs.push({ kind: 'home', address: '', budget_cents: null, status: 'open', worker_id: null, quote_id: null, amount_cents: null, fee_cents: null, done_at: null, ...o, updated_at: o.created_at });
  const quote = (o) => db.quotes.push({ status: 'pending', message: '', ...o });
  const msg = (o) => db.messages.push({ id: crypto.randomUUID(), ...o });

  job({ id: 'j-wardrobe', poster_id: 'priya', category: 'Assembly', title: 'Assemble IKEA PAX wardrobe and a bed frame', description: 'Two-door PAX wardrobe (236cm tall, needs fixing to the wall) and a MALM queen bed. Second-floor flat, no lift. Boxes are already inside. Any weekday evening or Saturday works.', suburb: 'Newtown', postcode: '2042', address: '14/88 Wilson St', pricing: 'quote', budget_cents: 18000, created_at: now - 5 * HOUR });
  quote({ id: 'q1', job_id: 'j-wardrobe', worker_id: 'sam', amount_cents: 16500, message: 'Done plenty of PAX builds. I’ll anchor it to the wall properly and take the cardboard away. Free Saturday morning.', created_at: now - 3 * HOUR });
  quote({ id: 'q2', job_id: 'j-wardrobe', worker_id: 'leo', amount_cents: 14000, message: 'Can do Thursday evening.', created_at: now - 2 * HOUR });
  msg({ job_id: 'j-wardrobe', worker_id: 'sam', sender_id: 'sam', body: 'Hi Priya, are the walls plasterboard or brick? Just so I bring the right anchors.', created_at: now - 3 * HOUR + 60_000 });
  msg({ job_id: 'j-wardrobe', worker_id: 'sam', sender_id: 'priya', body: 'Plasterboard, but there’s a stud about 40cm from the corner.', created_at: now - 2.5 * HOUR });

  job({ id: 'j-lawn', poster_id: 'priya', category: 'Gardening', title: 'Mow, edge and blow back courtyard + front strip', description: 'Small courtyard (about 30m²) and the nature strip out front. Green bin is by the side gate.', suburb: 'Newtown', postcode: '2042', address: '14/88 Wilson St', pricing: 'fixed', budget_cents: 9000, status: 'funded', worker_id: 'sam', quote_id: 'q3', amount_cents: 9000, fee_cents: 900, created_at: now - 3 * DAY });
  quote({ id: 'q3', job_id: 'j-lawn', worker_id: 'sam', amount_cents: 9000, status: 'accepted', message: 'Happy to do it for the fixed price. Tomorrow 8am?', created_at: now - 3 * DAY + HOUR });
  msg({ job_id: 'j-lawn', worker_id: 'sam', sender_id: 'sam', body: 'Payment’s showing as held, thanks. I’ll be there 8am tomorrow.', created_at: now - 1 * DAY });
  msg({ job_id: 'j-lawn', worker_id: 'sam', sender_id: 'priya', body: 'Great, the side gate code is on the job page.', created_at: now - 1 * DAY + 20 * 60_000 });

  job({ id: 'j-gutters', poster_id: 'priya', category: 'Handyman', title: 'Clear gutters and downpipes', description: 'Single-storey terrace, front and back gutters.', suburb: 'Newtown', postcode: '2042', pricing: 'quote', status: 'released', worker_id: 'sam', quote_id: 'q4', amount_cents: 22000, fee_cents: 2200, created_at: now - 30 * DAY, done_at: now - 27 * DAY });
  quote({ id: 'q4', job_id: 'j-gutters', worker_id: 'sam', amount_cents: 22000, status: 'accepted', created_at: now - 30 * DAY });
  db.reviews.push({ id: 'r1', job_id: 'j-gutters', reviewer_id: 'priya', reviewee_id: 'sam', rating: 5, body: 'Turned up on time, cleared everything and sent photos of the downpipes running. Would book again.', created_at: now - 26 * DAY });
  db.reviews.push({ id: 'r2', job_id: 'j-gutters', reviewer_id: 'sam', reviewee_id: 'priya', rating: 5, body: 'Clear instructions and easy access. Paid promptly.', created_at: now - 26 * DAY });
  db.reviews.push({ id: 'r3', job_id: 'j-old', reviewer_id: 'mark', reviewee_id: 'sam', rating: 4, body: 'Good work on the shelving, took a bit longer than quoted.', created_at: now - 60 * DAY });

  job({ id: 'j-paint', poster_id: 'dana', kind: 'trade', category: 'Painting', title: 'Overflow: prep and repaint two townhouse interiors', description: 'We’re booked out and need a painter or small crew for two 3-bed townhouses in Leichhardt. Walls and ceilings, two coats, low-sheen. We supply all paint; you bring gear and drop sheets. Start next Monday, about 6 working days total.\n\nMust have your own ABN and public liability.', suburb: 'Leichhardt', postcode: '2040', address: 'Units 2 & 3, 41 Marion St', pricing: 'quote', budget_cents: 650000, created_at: now - 9 * HOUR });
  quote({ id: 'q5', job_id: 'j-paint', worker_id: 'tom', amount_cents: 620000, message: 'Two of us, can start Monday and finish Saturday. Happy to send photos of recent jobs.', created_at: now - 6 * HOUR });

  job({ id: 'j-clean', poster_id: 'mark', category: 'Cleaning', title: 'End of lease clean, 2 bed apartment', description: 'Need it bond-ready: oven, bathroom, windows inside, carpets steam cleaned. Empty apartment, keys available from Friday.', suburb: 'Camperdown', postcode: '2050', address: '7/12 Australia St', pricing: 'quote', budget_cents: 45000, created_at: now - 26 * HOUR });
  job({ id: 'j-tap', poster_id: 'mark', category: 'Plumbing', title: 'Replace kitchen mixer tap', description: 'Old mixer is leaking at the base. I’ve bought the new tap (Methven, standard 35mm hole).', suburb: 'Camperdown', postcode: '2050', pricing: 'fixed', budget_cents: 22000, created_at: now - 2 * DAY });
  job({ id: 'j-move', poster_id: 'dana', kind: 'home', category: 'Removals', title: 'Help moving a couch and fridge down one flight', description: 'Two people needed for about an hour. Ute not required, just carrying to the kerb for a pickup service.', suburb: 'Leichhardt', postcode: '2040', pricing: 'fixed', budget_cents: 12000, created_at: now - 40 * 60_000 });

  // ---------- helpers mirroring src/app.ts ----------
  class Fail extends Error { constructor(status, message) { super(message); this.status = status; } }
  const fail = (s, m) => { throw new Fail(s, m); };
  const me = () => db.users.find((u) => u.id === db.me) || null;
  const requireUser = () => me() || fail(401, 'Please log in');
  const requireVerified = () => { const u = requireUser(); if (!u.email_verified) fail(403, `Please confirm your email first. We sent a link to ${u.email}.`); return u; };
  const userById = (id) => db.users.find((u) => u.id === id);
  const rating = (id) => {
    const rs = db.reviews.filter((r) => r.reviewee_id === id);
    return { avg: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : null, count: rs.length };
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, suburb: u.suburb, bio: u.bio, isBusiness: !!u.is_business, businessName: u.business_name, abn: u.abn, trades: u.trades, licenceNo: u.licence_no, insured: !!u.insured, payoutsReady: !!u.payouts_enabled, memberSince: u.created_at, rating: rating(u.id) });
  const getJob = (id) => db.jobs.find((j) => j.id === id) || fail(404, 'Job not found');
  const roleOn = (j, u) => (!u ? null : u.id === j.poster_id ? 'poster' : u.id === j.worker_id ? 'worker' : null);
  const cents = (v) => {
    const s = String(v ?? '').replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const c = Math.round(parseFloat(s) * 100);
    return c >= 1000 && c <= 5_000_000 ? c : null;
  };
  const mask = (t) => t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email hidden]').replace(/(\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}/g, '[phone hidden]');
  const str = (v, field, max, min = 0) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s.length < min) fail(400, min > 1 ? `${field} needs at least ${min} characters` : `${field} is required`);
    if (s.length > max) fail(400, `${field} is too long (max ${max})`);
    return s;
  };
  const listRow = (j) => ({ id: j.id, kind: j.kind, category: j.category, title: j.title, suburb: j.suburb, postcode: j.postcode, pricing: j.pricing, budget_cents: j.budget_cents, status: j.status, created_at: j.created_at, quote_count: db.quotes.filter((q) => q.job_id === j.id && q.status === 'pending').length });
  const move = (j, from, to, extra = {}) => {
    if (!from.includes(j.status)) fail(409, `Can’t do that while the job is ${j.status.replace('_', ' ')}`);
    Object.assign(j, { status: to, updated_at: Date.now() }, extra);
  };
  const byNewest = (a, b) => b.created_at - a.created_at;

  // ---------- routes ----------
  const routes = [
    ['GET', /^\/meta$/, () => ({ categories: CATEGORIES, licensedCategories: LICENSED, feeBps: FEE_BPS, simulatedPayments: true, autoReleaseDays: 5 })],
    ['GET', /^\/me$/, () => {
      const u = me();
      return { user: u ? { ...publicUser(u), email: u.email, postcode: u.postcode, notifyMessages: !!u.notify_messages, emailVerified: !!u.email_verified, isAdmin: false } : null };
    }],
    ['PUT', /^\/me$/, (b) => {
      const u = requireUser();
      Object.assign(u, { name: str(b.name, 'Name', 80, 2), suburb: str(b.suburb, 'Suburb', 60), postcode: b.postcode || '', bio: str(b.bio, 'Bio', 1000), is_business: b.isBusiness ? 1 : 0, business_name: b.businessName || '', abn: (b.abn || '').replace(/\s/g, ''), trades: b.trades || '', licence_no: b.licenceNo || '', insured: b.insured ? 1 : 0, notify_messages: b.notifyMessages === false ? 0 : 1 });
      return { ok: true };
    }],
    ['POST', /^\/auth\/login$/, (b) => {
      const u = db.users.find((x) => x.email === String(b.email || '').toLowerCase()) || fail(401, 'Email or password is wrong. In the preview, use the switcher at the top.');
      db.me = u.id;
      return { ok: true };
    }],
    ['POST', /^\/auth\/signup$/, (b) => {
      const email = str(b.email, 'Email', 200, 3).toLowerCase();
      if (String(b.password || '').length < 10) fail(400, 'Password needs at least 10 characters');
      if (b.acceptTerms !== true) fail(400, 'Please accept the terms and privacy policy');
      if (db.users.some((u) => u.email === email)) fail(409, 'An account with that email already exists. Try logging in.');
      const u = user({ id: crypto.randomUUID(), email, name: str(b.name, 'Name', 80, 2), suburb: b.suburb || '', postcode: b.postcode || '', email_verified: 0, created_at: Date.now() });
      db.users.push(u);
      db.me = u.id;
      window.dispatchEvent(new CustomEvent('gid:preview-user', { detail: u.id }));
      return { ok: true };
    }],
    ['POST', /^\/auth\/logout$/, () => { db.me = null; window.dispatchEvent(new CustomEvent('gid:preview-user', { detail: null })); return { ok: true }; }],
    ['POST', /^\/auth\/forgot$/, () => ({ ok: true })],
    ['POST', /^\/auth\/verify$/, () => fail(400, 'Confirmation links arrive by email in the real app. The preview doesn’t send email.')],
    ['POST', /^\/auth\/verify\/resend$/, () => ({ ok: true, alreadyVerified: !!requireUser().email_verified })],
    ['POST', /^\/auth\/reset$/, () => fail(400, 'Reset links arrive by email in the real app. The preview doesn’t send email.')],
    ['POST', /^\/auth\/password$/, (b) => { requireUser(); if (String(b.password || '').length < 10) fail(400, 'Password needs at least 10 characters'); return { ok: true }; }],
    ['GET', /^\/users\/([^/]+)$/, (_, [id]) => {
      const u = userById(id) || fail(404, 'User not found');
      return { user: publicUser(u), reviews: db.reviews.filter((r) => r.reviewee_id === id).sort(byNewest).map((r) => ({ rating: r.rating, body: r.body, created_at: r.created_at, reviewer: userById(r.reviewer_id).name })) };
    }],
    ['GET', /^\/jobs$/, (_, __, q) => {
      let js = db.jobs.filter((j) => j.status === 'open');
      if (q.get('kind')) js = js.filter((j) => j.kind === q.get('kind'));
      if (q.get('category')) js = js.filter((j) => j.category === q.get('category'));
      if (/^\d{4}$/.test(q.get('postcode') || '')) js = js.filter((j) => j.postcode.slice(0, 3) === q.get('postcode').slice(0, 3));
      if (q.get('q')) js = js.filter((j) => (j.title + j.description).toLowerCase().includes(q.get('q').toLowerCase()));
      return { jobs: js.sort(byNewest).map(listRow) };
    }],
    ['GET', /^\/jobs\/mine$/, () => {
      const u = requireUser();
      const byUpdated = (a, b) => b.updated_at - a.updated_at;
      return {
        posted: db.jobs.filter((j) => j.poster_id === u.id).sort(byUpdated).map(listRow),
        working: db.jobs.filter((j) => j.worker_id === u.id).sort(byUpdated).map(listRow),
        quoted: db.quotes.filter((q) => q.worker_id === u.id && q.status === 'pending').map((q) => ({ ...listRow(getJob(q.job_id)), my_quote_cents: q.amount_cents, my_quote_status: q.status })),
      };
    }],
    ['POST', /^\/jobs$/, (b) => {
      const u = requireVerified();
      if (!CATEGORIES.includes(b.category)) fail(400, 'Pick a category');
      const pricing = b.pricing === 'fixed' ? 'fixed' : 'quote';
      let budget = null;
      if (pricing === 'fixed' || b.budget) budget = cents(b.budget) ?? fail(400, 'Price must be between $10 and $50,000');
      if (!/^\d{4}$/.test(b.postcode || '')) fail(400, 'Postcode must be 4 digits');
      const id = crypto.randomUUID();
      job({ id, poster_id: u.id, kind: b.kind === 'trade' ? 'trade' : 'home', category: b.category, title: str(b.title, 'Title', 100, 5), description: str(b.description, 'Description', 4000, 20), suburb: str(b.suburb, 'Suburb', 60, 2), postcode: b.postcode, address: b.address || '', pricing, budget_cents: budget, created_at: Date.now() });
      return { id };
    }],
    ['GET', /^\/jobs\/([^/]+)$/, (_, [id]) => {
      const u = me(), j = getJob(id), role = roleOn(j, u);
      if (j.status !== 'open' && !role) fail(404, 'Job not found');
      const funded = ['funded', 'done', 'released', 'disputed', 'refunded'].includes(j.status);
      const quotes = db.quotes.filter((q) => q.job_id === j.id && (role === 'poster' || q.worker_id === u?.id))
        .map((q) => ({ id: q.id, amountCents: q.amount_cents, message: q.message, status: q.status, createdAt: q.created_at, worker: publicUser(userById(q.worker_id)) }));
      const threadIds = role === 'poster' ? [...new Set([...db.messages, ...db.quotes].filter((x) => x.job_id === j.id).map((x) => x.worker_id))] : [];
      return {
        job: { id: j.id, kind: j.kind, category: j.category, title: j.title, description: j.description, suburb: j.suburb, postcode: j.postcode, address: role === 'poster' || (role === 'worker' && funded) ? j.address : null, pricing: j.pricing, budgetCents: j.budget_cents, status: j.status, workerId: j.worker_id, amountCents: j.amount_cents, feeCents: role === 'poster' ? undefined : j.fee_cents, doneAt: j.done_at, createdAt: j.created_at, licensedCategory: LICENSED.includes(j.category) },
        poster: publicUser(userById(j.poster_id)),
        role,
        quotes,
        threads: threadIds.map((wid) => ({ workerId: wid, name: userById(wid).name })),
        reviewed: !!u && db.reviews.some((r) => r.job_id === j.id && r.reviewer_id === u.id),
      };
    }],
    ['POST', /^\/jobs\/([^/]+)\/quotes$/, (b, [id]) => {
      const u = requireVerified(), j = getJob(id);
      if (j.poster_id === u.id) fail(400, 'You can’t quote on your own job');
      if (j.status !== 'open') fail(409, 'This job is no longer taking quotes');
      const amount = j.pricing === 'fixed' ? j.budget_cents : cents(b.amount) ?? fail(400, 'Quote must be between $10 and $50,000');
      const existing = db.quotes.find((q) => q.job_id === j.id && q.worker_id === u.id);
      if (existing) Object.assign(existing, { amount_cents: amount, message: mask(b.message || ''), status: 'pending', created_at: Date.now() });
      else quote({ id: crypto.randomUUID(), job_id: j.id, worker_id: u.id, amount_cents: amount, message: mask(b.message || ''), created_at: Date.now() });
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/quotes\/withdraw$/, (_, [id]) => {
      const u = requireUser();
      db.quotes.filter((q) => q.job_id === id && q.worker_id === u.id && q.status === 'pending').forEach((q) => (q.status = 'withdrawn'));
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/accept$/, (b, [id]) => {
      const u = requireVerified(), j = getJob(id);
      if (roleOn(j, u) !== 'poster') fail(403, 'Only the poster can accept a quote');
      const q = db.quotes.find((x) => x.id === b.quoteId && x.job_id === id && x.status === 'pending') || fail(404, 'That quote isn’t available any more');
      move(j, ['open'], 'awaiting_payment', { worker_id: q.worker_id, quote_id: q.id, amount_cents: q.amount_cents, fee_cents: Math.round((q.amount_cents * FEE_BPS) / 10_000) });
      db.quotes.filter((x) => x.job_id === id).forEach((x) => (x.status = x.id === q.id ? 'accepted' : x.status === 'pending' ? 'declined' : x.status));
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/pay$/, (_, [id]) => {
      const u = requireVerified(), j = getJob(id);
      if (roleOn(j, u) !== 'poster') fail(403, 'Only the poster pays for a job');
      move(j, ['awaiting_payment'], 'funded');
      return { simulated: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/cancel$/, (_, [id]) => {
      const u = requireUser(), j = getJob(id);
      if (roleOn(j, u) !== 'poster') fail(403, 'Only the poster can cancel');
      move(j, ['open', 'awaiting_payment'], 'cancelled');
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/done$/, (_, [id]) => {
      const u = requireUser(), j = getJob(id);
      if (roleOn(j, u) !== 'worker') fail(403, 'Only the hired worker can mark the job done');
      move(j, ['funded'], 'done', { done_at: Date.now() });
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/confirm$/, (_, [id]) => {
      const u = requireUser(), j = getJob(id);
      if (roleOn(j, u) !== 'poster') fail(403, 'Only the poster can confirm the job is done');
      move(j, ['done'], 'released');
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/dispute$/, (b, [id]) => {
      const u = requireUser(), j = getJob(id);
      if (!roleOn(j, u)) fail(403, 'Only the poster or hired worker can raise a problem');
      str(b.reason, 'Reason', 2000, 10);
      move(j, ['funded', 'done'], 'disputed');
      return { ok: true };
    }],
    ['POST', /^\/jobs\/([^/]+)\/reviews$/, (b, [id]) => {
      const u = requireUser(), j = getJob(id), role = roleOn(j, u);
      if (!role) fail(403, 'Only the people on this job can review it');
      if (j.status !== 'released') fail(409, 'Reviews open once the job is finished and paid');
      if (db.reviews.some((r) => r.job_id === id && r.reviewer_id === u.id)) fail(409, 'You’ve already reviewed this job');
      db.reviews.push({ id: crypto.randomUUID(), job_id: id, reviewer_id: u.id, reviewee_id: role === 'poster' ? j.worker_id : j.poster_id, rating: Number(b.rating), body: b.body || '', created_at: Date.now() });
      return { ok: true };
    }],
    ['GET', /^\/jobs\/([^/]+)\/messages$/, (_, [id], q) => {
      const u = requireUser(), j = getJob(id);
      const worker = roleOn(j, u) === 'poster' ? q.get('worker') : u.id;
      const after = Number(q.get('after') || 0);
      return { messages: db.messages.filter((m) => m.job_id === id && m.worker_id === worker && m.created_at > after).sort((a, b) => a.created_at - b.created_at)
        .map((m) => ({ id: m.id, senderId: m.sender_id, senderName: userById(m.sender_id).name, body: m.body, createdAt: m.created_at })) };
    }],
    ['POST', /^\/jobs\/([^/]+)\/messages$/, (b, [id]) => {
      const u = requireVerified(), j = getJob(id);
      const worker = roleOn(j, u) === 'poster' ? b.worker : u.id;
      let text = str(b.body, 'Message', 2000, 1);
      if (!['funded', 'done', 'released', 'disputed'].includes(j.status) || worker !== j.worker_id) text = mask(text);
      msg({ job_id: id, worker_id: worker, sender_id: u.id, body: text, created_at: Date.now() });
      return { ok: true };
    }],
    ['POST', /^\/payouts\/onboard$/, () => { requireVerified().payouts_enabled = 1; return { simulated: true }; }],
    ['POST', /^\/payouts\/refresh$/, () => ({ payoutsReady: !!requireUser().payouts_enabled })],
  ];

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname.replace(/^.*?\/api/, '');
    if (!url.pathname.includes('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    await new Promise((r) => setTimeout(r, 120)); // feel like a network call
    try {
      for (const [m, re, fn] of routes) {
        const match = method === m && path.match(re);
        if (match) return json(200, fn(body, match.slice(1), url.searchParams));
      }
      return json(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof Fail) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Something went wrong in the preview' });
    }
  };
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  window.gidPreview = { setUser: (id) => { db.me = id; }, currentUser: () => db.me, verifyMe: () => { if (me()) me().email_verified = 1; } };
})();
