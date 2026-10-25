// End-to-end run of the whole job lifecycle against a local `wrangler dev` (simulated payments).
// Usage: npm run db:migrate:local && npx wrangler dev --var ADMIN_EMAILS:admin@test.local --var DEV_OUTBOX:true  (then)  npm run e2e
const BASE = process.env.BASE_URL || 'http://localhost:8787';
const run = Date.now();
let failures = 0;

function client() {
  let cookie = '';
  return async (path, body, method) => {
    const res = await fetch(BASE + '/api' + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

function check(name, cond, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + JSON.stringify(detail)}`);
  if (!cond) failures++;
}

const emailOf = (who) => `${who}-${run}@test.local`;
/** Emails captured by the dev outbox (sent after the response, so poll briefly). */
async function emailsTo(addr, minCount = 1) {
  for (let i = 0; i < 20; i++) {
    const { emails } = await (await fetch(`${BASE}/api/dev/outbox?to=${encodeURIComponent(addr)}`)).json();
    if (emails.length >= minCount) return emails;
    await new Promise((r) => setTimeout(r, 150));
  }
  const { emails } = await (await fetch(`${BASE}/api/dev/outbox?to=${encodeURIComponent(addr)}`)).json();
  return emails;
}
async function hasEmail(addr, subjectPart) {
  for (let i = 0; i < 20; i++) {
    if ((await emailsTo(addr, 0)).some((e) => e.subject.includes(subjectPart))) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

const poster = client(), worker = client(), other = client(), admin = client(), anon = client();
/** Follows the newest verification link emailed to addr. */
async function verifyEmail(addr) {
  for (let i = 0; i < 20; i++) {
    const mail = (await emailsTo(addr, 0)).find((e) => e.subject.includes('confirm your email') || e.subject.includes('Confirm your email'));
    const token = mail?.body.match(/#\/verify\?token=([a-f0-9]{64})/)?.[1];
    if (token) return (await anon('/auth/verify', { token })).status;
    await new Promise((r) => setTimeout(r, 150));
  }
  return 0;
}
const signupRaw = (c, who) => c('/auth/signup', { email: `${who}-${run}@test.local`, password: 'longenough123', name: who, suburb: 'Parramatta', postcode: '2150', acceptTerms: true });
const signup = async (c, who) => {
  const r = await signupRaw(c, who);
  if (r.status === 201) await verifyEmail(emailOf(who));
  return r;
};

check('poster signs up', (await signup(poster, 'Pat')).status === 201);
check('worker signs up', (await signup(worker, 'Wes')).status === 201);
check('other signs up', (await signup(other, 'Ola')).status === 201);
if ((await admin('/auth/signup', { email: 'admin@test.local', password: 'longenough123', name: 'Admin', acceptTerms: true })).status === 201) await verifyEmail('admin@test.local');
check('admin logs in', (await admin('/auth/login', { email: 'admin@test.local', password: 'longenough123' })).status === 200);
check('welcome + confirm email sent', await hasEmail(emailOf('Pat'), 'Welcome to Get It Done: please confirm your email'));
check('signup needs terms', (await anon('/auth/signup', { email: `x${run}@t.local`, password: 'longenough123', name: 'X' })).status === 400);
check('wrong password rejected', (await anon('/auth/login', { email: `pat-${run}@test.local`, password: 'nope' })).status === 401);
check('form-encoded POST rejected (CSRF)', (await fetch(BASE + '/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' })).status === 400);
check('cross-origin POST rejected', (await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })).status === 403);

const meta = (await anon('/meta')).data;
check('simulated payments on locally', meta.simulatedPayments === true);

const job = await poster('/jobs', { kind: 'home', category: 'Gardening', title: 'Mow front and back lawn', description: 'About 200m2, edges too, green bin available.', suburb: 'Parramatta', postcode: '2150', address: '1 Secret St', pricing: 'quote', budget: '120' });
check('poster posts job', job.status === 201, job.data);
const id = job.data.id;

const pub = await anon(`/jobs/${id}`);
check('public sees open job without address', pub.status === 200 && pub.data.job.address === null, pub.data.job);
check('public profile hides email', !JSON.stringify(pub.data.poster).includes('@'));
check('job appears in nearby browse', (await anon('/jobs?postcode=2151')).data.jobs.some((j) => j.id === id));
check('anon cannot quote', (await anon(`/jobs/${id}/quotes`, { amount: '100' })).status === 401);
check('poster cannot quote own job', (await poster(`/jobs/${id}/quotes`, { amount: '100' })).status === 400);

check('worker sets up payouts (simulated)', (await worker('/payouts/onboard', {})).data.simulated === true);
check('worker quotes', (await worker(`/jobs/${id}/quotes`, { amount: '110', message: 'Can do Saturday, text 0412 345 678' })).status === 201);
check('other quotes', (await other(`/jobs/${id}/quotes`, { amount: '95' })).status === 201);
check('poster emailed about each quote', (await emailsTo(emailOf('Pat'), 3)).filter((e) => e.subject.startsWith('New quote')).length === 2);
check('worker cannot see other quotes', (await worker(`/jobs/${id}`)).data.quotes.length === 1);

const pjob = (await poster(`/jobs/${id}`)).data;
check('poster sees both quotes', pjob.quotes.length === 2);
check('phone masked in quote', pjob.quotes.find((q) => q.amountCents === 11000)?.message.includes('[phone hidden]'), pjob.quotes);
const wesId = pjob.quotes.find((q) => q.amountCents === 11000).worker.id;

check('worker messages poster', (await worker(`/jobs/${id}/messages`, { body: 'Is the side gate unlocked? me@mail.com' })).status === 201);
check('poster replies', (await poster(`/jobs/${id}/messages`, { body: 'Yes it is', worker: wesId })).status === 201);
const msgs = (await poster(`/jobs/${id}/messages?worker=${wesId}`)).data.messages;
check('poster emailed about message', await hasEmail(emailOf('Pat'), 'New message from Wes'));
check('worker emailed about reply', await hasEmail(emailOf('Wes'), 'New message from Pat'));
await worker(`/jobs/${id}/messages`, { body: 'second message' });
await new Promise((r) => setTimeout(r, 400));
check('message emails throttled', (await emailsTo(emailOf('Pat'))).filter((e) => e.subject.startsWith('New message')).length === 1);
check('chat thread has 2 messages, email masked', msgs.length === 2 && msgs[0].body.includes('[email hidden]'), msgs);
check('other cannot read worker thread', (await other(`/jobs/${id}/messages?worker=${wesId}`)).data.messages.length === 0);
check('poster cannot open thread with stranger', (await poster(`/jobs/${id}/messages`, { body: 'hi', worker: 'nobody' })).status === 404);

const quoteId = pjob.quotes.find((q) => q.amountCents === 11000).id;
check('worker cannot accept', (await worker(`/jobs/${id}/accept`, { quoteId })).status === 403);
check('poster accepts quote', (await poster(`/jobs/${id}/accept`, { quoteId })).status === 200);
check('worker emailed: got the job', await hasEmail(emailOf('Wes'), 'You got the job'));
check('double accept blocked', (await poster(`/jobs/${id}/accept`, { quoteId })).status >= 400);
check('job hidden from public once taken', (await anon(`/jobs/${id}`)).status === 404);
check('worker cannot mark done before payment', (await worker(`/jobs/${id}/done`, {})).status === 409);
check('worker does not see address before payment', (await worker(`/jobs/${id}`)).data.job.address === null);

check('poster pays (simulated hold)', (await poster(`/jobs/${id}/pay`, {})).data.simulated === true);
let w = (await worker(`/jobs/${id}`)).data;
check('job funded, worker now sees address', w.job.status === 'funded' && w.job.address === '1 Secret St', w.job);
check('worker emailed: payment held', await hasEmail(emailOf('Wes'), 'Payment held'));
check('poster emailed: booked', await hasEmail(emailOf('Pat'), 'Booked'));
check('worker sees fee and payout', w.job.feeCents === 1100);
check('poster cannot release before done', (await poster(`/jobs/${id}/confirm`, {})).status === 409);
check('poster cannot cancel once funded', (await poster(`/jobs/${id}/cancel`, {})).status === 409);
check('worker marks done', (await worker(`/jobs/${id}/done`, {})).status === 200);
check('poster emailed: please confirm', await hasEmail(emailOf('Pat'), 'Please confirm'));
check('review blocked before release', (await poster(`/jobs/${id}/reviews`, { rating: 5 })).status === 409);
check('poster confirms & releases', (await poster(`/jobs/${id}/confirm`, {})).status === 200);
check('worker emailed: paid with net amount', (await emailsTo(emailOf('Wes'))).some((e) => e.subject.startsWith('You’ve been paid') && e.body.includes('$99')));
check('double release blocked', (await poster(`/jobs/${id}/confirm`, {})).status === 409);
check('poster reviews worker', (await poster(`/jobs/${id}/reviews`, { rating: 5, body: 'Great job' })).status === 201);
check('worker reviews poster', (await worker(`/jobs/${id}/reviews`, { rating: 4 })).status === 201);
check('duplicate review blocked', (await poster(`/jobs/${id}/reviews`, { rating: 1 })).status === 409);
check('outsider cannot review', (await other(`/jobs/${id}/reviews`, { rating: 1 })).status === 403);
const prof = (await anon(`/users/${wesId}`)).data;
check('worker rating shows', prof.user.rating.avg === 5 && prof.reviews.length === 1, prof.user);

// Dispute path: trade job, fixed price.
const job2 = (await poster('/jobs', { kind: 'trade', category: 'Painting', title: 'Overflow: repaint 3 bed unit', description: 'Interior walls and ceilings, we supply paint. Need done this week.', suburb: 'Parramatta', postcode: '2150', pricing: 'fixed', budget: '2400' })).data.id;
check('fixed-price quote ignores amount', (await worker(`/jobs/${job2}/quotes`, { amount: '1' })).status === 201);
const q2 = (await poster(`/jobs/${job2}`)).data.quotes[0];
check('fixed quote at fixed price', q2.amountCents === 240000);
await poster(`/jobs/${job2}/accept`, { quoteId: q2.id });
await poster(`/jobs/${job2}/pay`, {});
check('worker raises problem', (await worker(`/jobs/${job2}/dispute`, { reason: 'Poster has not given access to the unit.' })).status === 200);
check('poster + admin emailed about dispute', (await hasEmail(emailOf('Pat'), 'A problem was reported')) && (await hasEmail('admin@test.local', 'New dispute')));
check('non-admin cannot list disputes', (await poster('/admin/disputes')).status === 403);
const disputes = (await admin('/admin/disputes')).data.disputes;
const d = disputes.find((x) => x.jobId === job2);
check('admin sees dispute', !!d, disputes);
check('admin refunds', (await admin(`/admin/disputes/${d.id}/resolve`, { outcome: 'refund', note: 'Agreed by both' })).status === 200);
check('both emailed resolution', (await hasEmail(emailOf('Pat'), 'Problem resolved')) && (await hasEmail(emailOf('Wes'), 'Problem resolved')));
check('job refunded', (await poster(`/jobs/${job2}`)).data.job.status === 'refunded');

// Cancel path
const job3 = (await poster('/jobs', { kind: 'home', category: 'Cleaning', title: 'End of lease clean', description: 'Two bedroom apartment, carpets included please.', suburb: 'Parramatta', postcode: '2150', pricing: 'quote' })).data.id;
check('poster cancels open job', (await poster(`/jobs/${job3}/cancel`, {})).status === 200);
check('cannot quote cancelled job', (await worker(`/jobs/${job3}/quotes`, { amount: '300' })).status >= 400);

const mine = (await worker('/jobs/mine')).data;
check('worker "working" list has both jobs', mine.working.length === 2);

// Password reset and change
const rita = client(), ritaOtherDevice = client(), resetter = client();
check('rita signs up', (await signup(rita, 'Rita')).status === 201);
check('rita logs in on another device', (await ritaOtherDevice('/auth/login', { email: emailOf('Rita'), password: 'longenough123' })).status === 200);
check('forgot: unknown email looks the same', (await anon('/auth/forgot', { email: `nobody-${run}@test.local` })).status === 200);
await new Promise((r) => setTimeout(r, 300));
check('forgot: no email for unknown address', (await emailsTo(`nobody-${run}@test.local`, 0)).length === 0);
check('forgot: known email ok', (await anon('/auth/forgot', { email: emailOf('Rita').toUpperCase() })).status === 200);
const resetMail = (await emailsTo(emailOf('Rita'), 2)).find((e) => e.subject.includes('Reset'));
const token = resetMail?.body.match(/#\/reset\?token=([a-f0-9]{64})/)?.[1];
check('reset email contains link', !!token, resetMail);
check('reset rejects bad token', (await resetter('/auth/reset', { token: 'f'.repeat(64), password: 'brandnewpass1' })).status === 400);
check('reset rejects short password', (await resetter('/auth/reset', { token, password: 'short' })).status === 400);
check('reset with token works', (await resetter('/auth/reset', { token, password: 'brandnewpass1' })).status === 200);
check('reset logs you in', (await resetter('/me')).data.user?.name === 'Rita');
check('token is single use', (await anon('/auth/reset', { token, password: 'anotherpass12' })).status === 400);
check('old sessions logged out', (await ritaOtherDevice('/me')).data.user === null);
check('old password no longer works', (await anon('/auth/login', { email: emailOf('Rita'), password: 'longenough123' })).status === 401);
check('new password works', (await anon('/auth/login', { email: emailOf('Rita'), password: 'brandnewpass1' })).status === 200);
check('password-changed email sent', await hasEmail(emailOf('Rita'), 'password was changed'));
await anon('/auth/forgot', { email: emailOf('Rita') });
const first = (await emailsTo(emailOf('Rita'), 4)).find((e) => e.subject.includes('Reset'))?.body.match(/token=([a-f0-9]{64})/)?.[1];
await anon('/auth/forgot', { email: emailOf('Rita') });
check('new reset link cancels the previous one', (await anon('/auth/reset', { token: first, password: 'anotherpass12' })).status === 400);
check('change password: wrong current rejected', (await resetter('/auth/password', { current: 'nope', password: 'thirdpassword1' })).status === 400);
check('change password works', (await resetter('/auth/password', { current: 'brandnewpass1', password: 'thirdpassword1' })).status === 200);
check('still logged in after change', (await resetter('/me')).data.user?.name === 'Rita');
check('message emails can be turned off', (await resetter('/me', { name: 'Rita', notifyMessages: false }, 'PUT')).status === 200 && (await resetter('/me')).data.user.notifyMessages === false);

// Email verification
const vic = client();
check('vic signs up (not verified yet)', (await signupRaw(vic, 'Vic')).status === 201);
check('vic is unverified', (await vic('/me')).data.user.emailVerified === false);
const jobBody = { kind: 'home', category: 'Handyman', title: 'Hang three picture frames', description: 'Plaster walls, frames and hooks supplied, about 30 minutes.', suburb: 'Parramatta', postcode: '2150', pricing: 'fixed', budget: '60' };
check('unverified cannot post a job', (await vic('/jobs', jobBody)).status === 403);
check('unverified cannot quote', (await vic(`/jobs/${job3}/quotes`, { amount: '50' })).status === 403);
check('unverified cannot set up payouts', (await vic('/payouts/onboard', {})).status === 403);
check('unverified can still browse', (await vic('/jobs')).status === 200);
check('unverified admin email gets no admin rights', (await vic('/admin/disputes')).status === 403);
const firstLink = (await emailsTo(emailOf('Vic'))).find((e) => e.subject.includes('confirm'))?.body.match(/token=([a-f0-9]{64})/)?.[1];
check('resend works', (await vic('/auth/verify/resend', {})).status === 200);
await new Promise((r) => setTimeout(r, 400));
check('resent link cancels the first', (await anon('/auth/verify', { token: firstLink })).status === 400);
check('bad token rejected', (await anon('/auth/verify', { token: 'a'.repeat(64) })).status === 400);
const secondLink = (await emailsTo(emailOf('Vic'), 2)).find((e) => e.subject === 'Confirm your email for Get It Done')?.body.match(/token=([a-f0-9]{64})/)?.[1];
check('verify works without being logged in', (await anon('/auth/verify', { token: secondLink })).status === 200);
check('link is single use', (await anon('/auth/verify', { token: secondLink })).status === 400);
check('vic is now verified', (await vic('/me')).data.user.emailVerified === true);
check('verified can post', (await vic('/jobs', jobBody)).status === 201);
check('resend after verifying is a no-op', (await vic('/auth/verify/resend', {})).data.alreadyVerified === true);
const una = client();
await signupRaw(una, 'Una');
await anon('/auth/forgot', { email: emailOf('Una') });
const unaReset = (await emailsTo(emailOf('Una'), 2)).find((e) => e.subject.includes('Reset'))?.body.match(/token=([a-f0-9]{64})/)?.[1];
await anon('/auth/reset', { token: unaReset, password: 'unasnewpass1' });
check('password reset also confirms the email', (await anon('/auth/login', { email: emailOf('Una'), password: 'unasnewpass1' })).status === 200 && (await anon('/me')).data.user.emailVerified === true);

console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
