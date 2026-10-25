// Get It Done: mobile web app. No framework, no build step.
// All user content goes in via textContent (the h() helper), never innerHTML.

const view = document.getElementById('view');
const state = { me: null, meta: null, poll: null };

// ---------- tiny helpers ----------

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const clean = (kids) => kids.flat().filter((k) => k != null && k !== false);
/** Replaces the page content, skipping null/false so conditional sections can be inline. */
const show = (...kids) => view.replaceChildren(...clean(kids));

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status });
  return data;
}

const money = (c) => (c == null ? '' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100));
const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};
const stars = (n) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  toast.at = Date.now();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

/** Wraps a button's click: disables it while the async action runs and shows errors as a toast. */
function action(fn) {
  return async (e) => {
    e?.preventDefault();
    const btn = e?.submitter || e?.currentTarget;
    if (btn && 'disabled' in btn) btn.disabled = true;
    try {
      await fn(e);
    } catch (err) {
      if (err.status === 401) return go('#/login');
      toast(err.message);
    } finally {
      if (btn && 'disabled' in btn) btn.disabled = false;
    }
  };
}

const formData = (form) => Object.fromEntries(new FormData(form));
const go = (hash) => (location.hash === hash ? render() : (location.hash = hash));

function field(label, input, hint) {
  return h('div', {}, h('label', { for: input.id }, label), input, hint ? h('p', { class: 'muted' }, hint) : null);
}

const STATUS = {
  open: ['Open for quotes', ''],
  awaiting_payment: ['Waiting for payment', 'warn'],
  funded: ['In progress · payment held', ''],
  done: ['Marked done · awaiting confirmation', 'warn'],
  released: ['Complete · paid', 'grey'],
  refunded: ['Refunded', 'grey'],
  cancelled: ['Cancelled', 'grey'],
  disputed: ['Problem raised · under review', 'warn'],
};
const statusBadge = (s) => h('span', { class: `badge ${STATUS[s]?.[1] ?? ''}` }, STATUS[s]?.[0] ?? s);

// ---------- views ----------

function jobCard(j, extra) {
  return h('a', { class: 'card', href: `#/jobs/${j.id}` },
    h('div', { class: 'row' },
      h('strong', {}, j.title),
      h('span', { class: 'price' }, j.pricing === 'fixed' ? money(j.budget_cents) : j.budget_cents ? `~${money(j.budget_cents)}` : 'Quotes'),
    ),
    h('div', { class: 'row wrap muted' },
      h('span', {}, `${j.category} · ${j.suburb} ${j.postcode}`),
      h('span', {}, ago(j.created_at)),
    ),
    h('div', { class: 'row wrap', style: 'margin-top:6px' },
      h('span', {}, j.kind === 'trade' ? h('span', { class: 'badge warn' }, 'Trade overflow') : h('span', { class: 'badge' }, 'Home job'), ' ',
        j.status !== 'open' ? statusBadge(j.status) : null),
      extra ?? (j.status === 'open' ? h('span', { class: 'muted' }, `${j.quote_count} quote${j.quote_count == 1 ? '' : 's'}`) : null),
    ),
  );
}

async function browseView() {
  const saved = JSON.parse(sessionStorage.getItem('filters') || '{}');
  const f = { kind: saved.kind || '', category: saved.category || '', postcode: saved.postcode || state.me?.postcode || '', q: saved.q || '' };
  const list = h('div', {});
  const load = async () => {
    sessionStorage.setItem('filters', JSON.stringify(f));
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const { jobs } = await api(`/jobs?${qs}`);
    list.replaceChildren(...(jobs.length ? jobs.map((j) => jobCard(j)) : [h('p', { class: 'empty' }, 'No open jobs match. Try clearing the filters, or post one yourself.')]));
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Job type' },
    ...[['', 'All'], ['home', 'Home jobs'], ['trade', 'Trade overflow']].map(([k, label]) =>
      h('button', { type: 'button', 'aria-pressed': String(f.kind === k), onclick: (e) => {
        f.kind = k;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        load();
      } }, label)));
  const cat = h('select', { 'aria-label': 'Category', onchange: (e) => ((f.category = e.target.value), load()) },
    h('option', { value: '' }, 'All categories'), ...state.meta.categories.map((c) => h('option', { value: c, selected: f.category === c }, c)));
  const pc = h('input', { inputmode: 'numeric', maxlength: 4, placeholder: 'Postcode', 'aria-label': 'Postcode', value: f.postcode,
    oninput: (e) => { f.postcode = e.target.value; if (!f.postcode || f.postcode.length === 4) load(); } });

  show(
    state.me ? null : h('section', { class: 'hero' },
      h('h1', {}, 'Get the job done.'),
      h('p', {}, 'Post a job, compare quotes from local workers and trades, and only release payment when the work is finished.'),
      h('a', { class: 'btn', href: '#/signup' }, 'Get started free')),
    h('h1', {}, 'Open jobs'), seg, h('div', { class: 'filters' }, cat, pc), list,
  );
  await load();
}

async function postView() {
  if (!state.me) return go('#/login');
  const kindNote = h('p', { class: 'muted' });
  const licNote = h('div', { class: 'notice', hidden: true }, 'This kind of work usually needs a licensed tradesperson in Australia. Check the worker’s licence number before you accept a quote.');
  const budgetHint = h('p', { class: 'muted' });
  const pricing = h('select', { id: 'pricing', name: 'pricing' }, h('option', { value: 'quote' }, 'Ask for quotes'), h('option', { value: 'fixed' }, 'Set a fixed price'));
  const budget = h('input', { id: 'budget', name: 'budget', inputmode: 'decimal', placeholder: 'e.g. 150' });
  const syncPricing = () => {
    budgetHint.textContent = pricing.value === 'fixed'
      ? 'Workers offer to do it for this price. Minimum $10.'
      : 'Optional rough budget, so workers know what you expect.';
    budget.required = pricing.value === 'fixed';
  };
  pricing.addEventListener('change', syncPricing);
  const syncKind = () => (kindNote.textContent = kind.value === 'trade'
    ? 'For businesses passing on overflow work to other trades or contractors.'
    : 'Everyday jobs around the home: handyman, cleaning, gardening and more.');
  const kind = h('select', { id: 'kind', name: 'kind', onchange: syncKind },
    h('option', { value: 'home' }, 'Home job'), h('option', { value: 'trade' }, 'Trade overflow (business)'));
  const category = h('select', { id: 'category', name: 'category', required: true,
    onchange: () => (licNote.hidden = !state.meta.licensedCategories.includes(category.value)) },
    h('option', { value: '' }, 'Choose…'), ...state.meta.categories.map((c) => h('option', { value: c }, c)));

  const form = h('form', { onsubmit: action(async () => {
    const { id } = await api('/jobs', { body: formData(form) });
    toast('Job posted');
    go(`#/jobs/${id}`);
  }) },
    field('Type of job', kind, null), kindNote,
    field('Category', category), licNote,
    field('Title', h('input', { id: 'title', name: 'title', required: true, minlength: 5, maxlength: 100, placeholder: 'e.g. Mow and edge front and back lawn' })),
    field('Details', h('textarea', { id: 'description', name: 'description', required: true, minlength: 20, maxlength: 4000,
      placeholder: 'What needs doing, how big, any access notes, when you need it done…' })),
    h('div', { class: 'filters' },
      field('Suburb', h('input', { id: 'suburb', name: 'suburb', required: true, value: state.me.suburb })),
      field('Postcode', h('input', { id: 'postcode', name: 'postcode', required: true, inputmode: 'numeric', pattern: '\\d{4}', maxlength: 4, value: state.me.postcode }))),
    field('Street address', h('input', { id: 'address', name: 'address', maxlength: 200, autocomplete: 'street-address' }),
      'Private. Only shown to the worker you hire, once payment is held.'),
    field('Pricing', pricing),
    field('Price (AUD)', budget), budgetHint,
    h('button', { class: 'block' }, 'Post job'),
  );
  syncKind();
  syncPricing();
  show(h('h1', {}, 'Post a job'), form);
}

async function jobView(id) {
  const data = await api(`/jobs/${id}`);
  const { job, poster, role, quotes, threads } = data;
  const me = state.me;
  const reload = () => jobView(id);
  const paidReturn = location.hash.includes('paid=1');

  const progress = ['open', 'awaiting_payment', 'funded', 'done', 'released'];
  const stepIdx = progress.indexOf(job.status);

  const sections = [
    h('div', { class: 'row wrap' }, statusBadge(job.status), h('span', { class: 'muted' }, `${job.category} · posted ${ago(job.createdAt)}`)),
    h('h1', {}, job.title),
    stepIdx >= 0 ? h('div', { class: 'steps', 'aria-hidden': 'true' }, progress.map((_, i) => h('span', { class: i <= stepIdx ? 'on' : '' }))) : null,
    h('div', { class: 'card' },
      h('p', { style: 'white-space:pre-wrap' }, job.description),
      h('p', { class: 'muted' }, `📍 ${job.suburb} ${job.postcode}`, job.address ? ` · ${job.address}` : ''),
      h('p', { class: 'price' }, job.amountCents ? `Agreed: ${money(job.amountCents)}` : job.pricing === 'fixed' ? `Fixed price: ${money(job.budgetCents)}` : job.budgetCents ? `Budget about ${money(job.budgetCents)}` : 'Open to quotes'),
      h('p', { class: 'muted' }, 'Posted by ', h('a', { href: `#/u/${poster.id}` }, poster.name), poster.rating?.count ? ` · ${stars(poster.rating.avg)} (${poster.rating.count})` : ''),
    ),
    job.licensedCategory ? h('div', { class: 'notice' }, 'Licensed work: in most states only a licensed tradesperson may do this. Check the licence number on their profile with your state’s licensing body before accepting.') : null,
    paidReturn && job.status === 'awaiting_payment' ? h('div', { class: 'notice info' }, 'Payment received. Confirming with the bank, this page updates in a moment.') : null,
  ];

  // ----- actions by role & status -----
  const act = h('div', { class: 'actions' });
  const post = (path, body = {}, msg) => action(async () => { await api(`/jobs/${id}/${path}`, { body }); if (msg) toast(msg); reload(); });

  if (role === 'poster') {
    if (job.status === 'awaiting_payment') {
      act.append(
        h('div', { class: 'notice info' }, `Pay ${money(job.amountCents)} to book the job. We hold the money safely and only release it to the worker when you confirm the job is done.`,
          state.meta.simulatedPayments ? ' (Test mode: no real payment is taken.)' : ''),
        h('button', { onclick: action(async () => {
          const r = await api(`/jobs/${id}/pay`, { body: {} });
          if (r.url) location.href = r.url; else { toast('Payment held (test mode)'); reload(); }
        }) }, `Pay ${money(job.amountCents)} & book`));
    }
    if (job.status === 'done') {
      act.append(
        h('div', { class: 'notice info' }, `The worker says it's done. Check the work, then release the payment. If you do nothing, it releases automatically after ${state.meta.autoReleaseDays} days.`),
        h('button', { onclick: post('confirm', {}, 'Payment released, thanks!') }, 'Confirm & release payment'));
    }
    if (['open', 'awaiting_payment'].includes(job.status)) {
      act.append(h('button', { class: 'danger', onclick: (e) => confirm('Cancel this job?') && post('cancel', {}, 'Job cancelled')(e) }, 'Cancel job'));
    }
  }
  if (role === 'worker') {
    if (job.status === 'awaiting_payment') act.append(h('div', { class: 'notice' }, 'You’ve been picked! Waiting for the poster to pay. Don’t start until the payment is held.'));
    if (job.status === 'funded') {
      act.append(h('div', { class: 'notice info' }, `Payment of ${money(job.amountCents)} is held. Do the job, then mark it done.`,
        job.feeCents != null ? ` You'll receive ${money(job.amountCents - job.feeCents)} after the ${money(job.feeCents)} service fee.` : ''),
        h('button', { onclick: post('done', {}, 'Marked done. The poster has been asked to confirm.') }, 'Mark job as done'));
    }
    if (job.status === 'done') act.append(h('div', { class: 'notice info' }, `Waiting for the poster to confirm. Payment releases automatically after ${state.meta.autoReleaseDays} days if they don't respond.`));
  }
  if ((role === 'poster' || role === 'worker') && ['funded', 'done'].includes(job.status)) {
    act.append(h('button', { class: 'secondary', onclick: action(async () => {
      const reason = prompt('What’s wrong? Our team will review it and the payment stays held meanwhile.');
      if (!reason) return;
      await api(`/jobs/${id}/dispute`, { body: { reason } });
      toast('Problem reported. We’ll be in touch.');
      reload();
    }) }, 'Report a problem'));
  }
  if ((role === 'poster' || role === 'worker') && job.status === 'released' && !data.reviewed) {
    const rating = h('select', { id: 'rating', name: 'rating' }, [5, 4, 3, 2, 1].map((n) => h('option', { value: n }, `${'★'.repeat(n)} ${n}`)));
    const rf = h('form', { class: 'card', onsubmit: action(async () => {
      const v = formData(rf);
      await api(`/jobs/${id}/reviews`, { body: { rating: Number(v.rating), body: v.body } });
      toast('Thanks for the review');
      reload();
    }) }, h('h2', {}, role === 'poster' ? 'Review the worker' : 'Review the customer'), field('Rating', rating),
      field('Comments (optional)', h('textarea', { id: 'rbody', name: 'body', maxlength: 1000 })), h('button', { class: 'block' }, 'Submit review'));
    act.append(rf);
  }
  sections.push(act);

  // ----- quotes -----
  if (role === 'poster' || role === 'admin') {
    sections.push(h('h2', {}, `Quotes (${quotes.length})`));
    if (!quotes.length) sections.push(h('p', { class: 'muted' }, 'No quotes yet. Workers nearby will see your job.'));
    for (const q of quotes) {
      const w = q.worker;
      sections.push(h('div', { class: 'card' },
        h('div', { class: 'row' }, h('a', { href: `#/u/${w.id}` }, h('strong', {}, w.businessName || w.name)), h('span', { class: 'price' }, money(q.amountCents))),
        h('p', { class: 'muted' }, [w.rating?.count ? `${stars(w.rating.avg)} (${w.rating.count})` : 'New member', w.trades, w.licenceNo ? `Licence ${w.licenceNo}` : null, w.insured ? 'Says insured' : null].filter(Boolean).join(' · ')),
        q.message ? h('p', {}, q.message) : null,
        h('div', { class: 'row wrap' }, h('span', {}, q.status !== 'pending' ? h('span', { class: 'badge grey' }, q.status) : ''),
          job.status === 'open' && q.status === 'pending'
            ? h('button', { onclick: (e) => confirm(`Accept ${w.name}'s quote of ${money(q.amountCents)}?`) && post('accept', { quoteId: q.id }, 'Quote accepted, now pay to book')(e) }, 'Accept')
            : null),
      ));
    }
  } else if (me && job.status === 'open') {
    const mine = quotes[0];
    const qf = h('form', { class: 'card', onsubmit: action(async () => {
      await api(`/jobs/${id}/quotes`, { body: formData(qf) });
      toast(mine ? 'Quote updated' : 'Quote sent');
      reload();
    }) },
      h('h2', {}, mine ? 'Your quote' : job.pricing === 'fixed' ? `Offer to do it for ${money(job.budgetCents)}` : 'Send a quote'),
      mine ? h('p', {}, h('span', { class: 'badge' }, mine.status), ' ', money(mine.amountCents)) : null,
      job.pricing === 'quote' ? field('Your price (AUD, incl. GST if registered)', h('input', { id: 'amount', name: 'amount', inputmode: 'decimal', required: true, value: mine ? mine.amountCents / 100 : '' }),
        `Service fee of ${state.meta.feeBps / 100}% comes out of your payout.`) : h('p', { class: 'muted' }, `Service fee of ${state.meta.feeBps / 100}% comes out of your payout.`),
      field('Message to the poster', h('textarea', { id: 'qmsg', name: 'message', maxlength: 1000, placeholder: 'When you can do it, experience, what’s included…' }, mine?.message ?? '')),
      h('button', { class: 'block' }, mine ? 'Update quote' : 'Send quote'),
      mine?.status === 'pending' ? h('button', { type: 'button', class: 'secondary block', onclick: post('quotes/withdraw', {}, 'Quote withdrawn') }, 'Withdraw quote') : null,
    );
    sections.push(qf);
  } else if (!me && job.status === 'open') {
    sections.push(h('a', { class: 'btn block', href: '#/login' }, 'Log in to quote'));
  }

  // ----- chat -----
  if (me) {
    const chatBox = h('div', { class: 'chat' });
    const chatWrap = h('section', {}, h('h2', {}, 'Messages'));
    let worker = role === 'poster' || role === 'admin' ? (job.workerId || threads[0]?.workerId) : me.id;
    if ((role === 'poster' || role === 'admin') && threads.length > 1) {
      chatWrap.append(h('select', { 'aria-label': 'Conversation', onchange: (e) => { worker = e.target.value; chatBox.replaceChildren(); last = 0; pull(); } },
        threads.map((t) => h('option', { value: t.workerId, selected: t.workerId === worker }, t.name))));
    }
    let last = 0;
    const pull = async () => {
      if (!worker) return;
      const { messages } = await api(`/jobs/${id}/messages?worker=${encodeURIComponent(worker)}&after=${last}`);
      for (const m of messages) {
        chatBox.append(h('div', { class: `msg ${m.senderId === me.id ? 'me' : ''}` }, h('small', {}, `${m.senderName} · ${ago(m.createdAt)}`), m.body));
        last = m.createdAt;
      }
      if (messages.length) chatBox.scrollTop = chatBox.scrollHeight;
    };
    if (worker && (role || job.status === 'open')) {
      const input = h('textarea', { name: 'body', 'aria-label': 'Message', maxlength: 2000, placeholder: 'Write a message…', required: true });
      const sf = h('form', { class: 'send', onsubmit: action(async () => {
        await api(`/jobs/${id}/messages`, { body: { body: input.value, worker } });
        input.value = '';
        await pull();
      }) }, input, h('button', {}, 'Send'));
      chatWrap.append(...clean([chatBox, sf,
        !['funded', 'done', 'released', 'disputed'].includes(job.status) ? h('p', { class: 'muted' }, 'Phone numbers and emails are hidden until the job is booked. Keep payment in the app so you’re covered.') : null]));
      sections.push(chatWrap);
      await pull();
      state.poll = setInterval(() => pull().catch(() => {}), 5000);
    } else if (role === 'poster') {
      sections.push(chatWrap, h('p', { class: 'muted' }, 'Workers who message or quote will show up here.'));
    }
  }

  show(...sections);
  if (paidReturn && job.status === 'awaiting_payment') setTimeout(() => location.hash.startsWith(`#/jobs/${id}`) && reload(), 3000);
}

async function mineView() {
  if (!state.me) return go('#/login');
  const { posted, working, quoted } = await api('/jobs/mine');
  const tab = sessionStorage.getItem('mineTab') || 'posted';
  const lists = { posted, working, quoted };
  const body = h('div', {});
  const showTab = (t) => {
    sessionStorage.setItem('mineTab', t);
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    const items = lists[t];
    body.replaceChildren(...(items.length
      ? items.map((j) => jobCard(j, t === 'quoted' ? h('span', { class: 'muted' }, `Your quote ${money(j.my_quote_cents)}`) : null))
      : [h('p', { class: 'empty' }, t === 'posted' ? 'You haven’t posted any jobs yet.' : t === 'working' ? 'No jobs won yet. Browse and send some quotes.' : 'No open quotes.')]));
  };
  const seg = h('div', { class: 'seg' }, ...[['posted', 'Posted'], ['working', 'Working on'], ['quoted', 'Quoted']].map(([t, label]) =>
    h('button', { type: 'button', 'data-t': t, onclick: () => showTab(t) }, label)));
  show(h('h1', {}, 'My jobs'), seg, body);
  showTab(tab);
}

async function profileView() {
  if (!state.me) return go('#/login');
  if (location.hash.includes('payouts=')) await api('/payouts/refresh', { body: {} }).catch(() => {});
  const { user: u } = await api('/me');
  state.me = u;
  const form = h('form', { onsubmit: action(async () => {
    const v = formData(form);
    await api('/me', { method: 'PUT', body: { ...v, isBusiness: v.isBusiness === 'on', insured: v.insured === 'on', notifyMessages: v.notifyMessages === 'on' } });
    toast('Profile saved');
    await loadMe();
  }) },
    field('Name', h('input', { id: 'name', name: 'name', required: true, value: u.name, autocomplete: 'name' })),
    h('div', { class: 'filters' },
      field('Suburb', h('input', { id: 'psuburb', name: 'suburb', value: u.suburb })),
      field('Postcode', h('input', { id: 'ppostcode', name: 'postcode', inputmode: 'numeric', maxlength: 4, value: u.postcode }))),
    field('About you', h('textarea', { id: 'bio', name: 'bio', maxlength: 1000, placeholder: 'Experience, the work you take on, areas you cover…' }, u.bio)),
    h('h2', {}, 'If you do jobs'),
    field('Trades / skills', h('input', { id: 'trades', name: 'trades', value: u.trades, placeholder: 'e.g. Handyman, painting' })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'isBusiness', checked: u.isBusiness }), 'I’m a business or sole trader'),
    field('Business name', h('input', { id: 'bname', name: 'businessName', value: u.businessName })),
    field('ABN', h('input', { id: 'abn', name: 'abn', inputmode: 'numeric', value: u.abn, placeholder: '11 digits' })),
    field('Licence number', h('input', { id: 'lic', name: 'licenceNo', value: u.licenceNo }), 'Needed for licensed trades like electrical and plumbing. Shown on your profile.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'insured', checked: u.insured }), 'I hold public liability insurance'),
    h('h2', {}, 'Emails'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'notifyMessages', checked: u.notifyMessages }), 'Email me when I get a new message'),
    h('p', { class: 'muted' }, 'Emails about your jobs and payments (quotes, bookings, payouts) always send.'),
    h('button', { class: 'block' }, 'Save profile'),
  );
  const pw = h('form', { class: 'card', onsubmit: action(async () => {
    const v = formData(pw);
    if (v.password !== v.confirm) throw new Error('The new passwords don’t match');
    await api('/auth/password', { body: { current: v.current, password: v.password } });
    pw.reset();
    toast('Password changed. Other devices have been logged out.');
  }) },
    h('h2', { style: 'margin-top:0' }, 'Change password'),
    field('Current password', h('input', { id: 'cpw', name: 'current', type: 'password', required: true, autocomplete: 'current-password' })),
    field('New password', h('input', { id: 'cnpw', name: 'password', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    field('Confirm new password', h('input', { id: 'cnpw2', name: 'confirm', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('button', { class: 'block' }, 'Change password'));
  const payouts = h('div', { class: 'card' },
    h('h2', { style: 'margin-top:0' }, 'Getting paid'),
    u.payoutsReady
      ? h('p', {}, h('span', { class: 'badge' }, 'Payouts set up'), ' You can quote on jobs and get paid.')
      : h('div', {}, h('p', {}, 'To quote on jobs, set up payouts. Payments are handled by Stripe, and we never see your bank details.'),
        h('button', { class: 'block', onclick: action(async () => {
          const r = await api('/payouts/onboard', { body: {} });
          if (r.url) location.href = r.url; else { toast('Payouts ready (test mode)'); profileView(); }
        }) }, 'Set up payouts')),
  );
  show(
    h('h1', {}, 'Profile'),
    h('p', { class: 'muted' }, u.email, ' · ', h('a', { href: `#/u/${u.id}` }, 'View public profile'),
      u.rating?.count ? ` · ${stars(u.rating.avg)} (${u.rating.count})` : ''),
    payouts, form, pw,
    u.isAdmin ? h('a', { class: 'btn secondary block', href: '#/admin' }, 'Admin: disputes') : null,
    h('button', { class: 'secondary block', onclick: action(async () => { await api('/auth/logout', { body: {} }); state.me = null; go('#/'); }) }, 'Log out'),
    h('p', { class: 'muted', style: 'margin-top:16px' }, h('a', { href: '/terms.html' }, 'Terms'), ' · ', h('a', { href: '/privacy.html' }, 'Privacy')),
  );
}

async function userView(id) {
  const { user: u, reviews } = await api(`/users/${id}`);
  show(
    h('h1', {}, u.businessName || u.name),
    h('p', { class: 'muted' }, [u.businessName ? u.name : null, u.suburb, `Member since ${new Date(u.memberSince).getFullYear()}`].filter(Boolean).join(' · ')),
    h('p', {}, u.rating?.count ? h('span', {}, h('span', { class: 'stars' }, stars(u.rating.avg)), ` ${u.rating.avg} from ${u.rating.count} review${u.rating.count > 1 ? 's' : ''}`) : 'No reviews yet'),
    u.bio ? h('p', { class: 'card', style: 'white-space:pre-wrap' }, u.bio) : null,
    h('div', { class: 'card' },
      u.trades ? h('p', {}, `Trades: ${u.trades}`) : null,
      u.abn ? h('p', {}, `ABN ${u.abn}`) : null,
      u.licenceNo ? h('p', {}, `Licence ${u.licenceNo}`) : null,
      h('p', {}, u.insured ? 'Says they hold public liability insurance' : 'No insurance declared'),
      h('p', { class: 'muted' }, 'Details are provided by the member and not yet verified by us.')),
    h('h2', {}, 'Reviews'),
    reviews.length ? reviews.map((r) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'stars' }, stars(r.rating)), h('span', { class: 'muted' }, ago(r.created_at))),
      r.body ? h('p', {}, r.body) : null, h('p', { class: 'muted' }, `by ${r.reviewer}`))) : h('p', { class: 'muted' }, 'None yet.'),
  );
}

function authView(mode) {
  const signup = mode === 'signup';
  const form = h('form', { onsubmit: action(async () => {
    const v = formData(form);
    await api(`/auth/${mode}`, { body: { ...v, acceptTerms: v.acceptTerms === 'on' } });
    await loadMe();
    toast(signup ? 'Welcome to Get It Done!' : 'Welcome back');
    go(sessionStorage.getItem('after') || '#/');
  }) },
    signup ? field('Your name', h('input', { id: 'sname', name: 'name', required: true, autocomplete: 'name' })) : null,
    field('Email', h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email' })),
    field('Password', h('input', { id: 'password', name: 'password', type: 'password', required: true, minlength: signup ? 10 : 1, autocomplete: signup ? 'new-password' : 'current-password' }),
      signup ? 'At least 10 characters.' : null),
    signup ? h('div', { class: 'filters' },
      field('Suburb', h('input', { id: 'ssuburb', name: 'suburb' })),
      field('Postcode', h('input', { id: 'spostcode', name: 'postcode', inputmode: 'numeric', maxlength: 4 }))) : null,
    signup ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'acceptTerms', required: true }),
      h('span', {}, 'I agree to the ', h('a', { href: '/terms.html', target: '_blank' }, 'terms'), ' and ', h('a', { href: '/privacy.html', target: '_blank' }, 'privacy policy'))) : null,
    h('button', { class: 'block' }, signup ? 'Create account' : 'Log in'),
    signup ? null : h('p', { style: 'margin-top:12px' }, h('a', { href: '#/forgot' }, 'Forgot password?')),
  );
  show(
    h('h1', {}, signup ? 'Create your account' : 'Log in'),
    h('p', { class: 'muted' }, 'One account to post jobs and to work on them.'),
    form,
    h('p', { style: 'margin-top:16px' }, signup ? 'Already have an account? ' : 'New here? ', h('a', { href: signup ? '#/login' : '#/signup' }, signup ? 'Log in' : 'Create an account')),
  );
}

function forgotView() {
  const form = h('form', { onsubmit: action(async () => {
    await api('/auth/forgot', { body: formData(form) });
    show(h('h1', {}, 'Check your email'),
      h('p', {}, 'If there’s an account with that email, we’ve sent a link to reset your password. It expires in 1 hour.'),
      h('p', { class: 'muted' }, 'Nothing arrived? Check your spam folder, or try again in a few minutes.'),
      h('a', { class: 'btn secondary block', href: '#/login' }, 'Back to log in'));
  }) },
    field('Email', h('input', { id: 'femail', name: 'email', type: 'email', required: true, autocomplete: 'email' })),
    h('button', { class: 'block' }, 'Send reset link'));
  show(h('h1', {}, 'Reset your password'), h('p', { class: 'muted' }, 'Enter your account email and we’ll send you a link.'), form,
    h('p', { style: 'margin-top:16px' }, h('a', { href: '#/login' }, 'Back to log in')));
}

function resetView() {
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('token') || '';
  // Keep the token out of the address bar and browser history once we've read it.
  history.replaceState(null, '', '#/reset');
  resetView.token = token || resetView.token;
  const form = h('form', { onsubmit: action(async () => {
    const v = formData(form);
    if (v.password !== v.confirm) throw new Error('The passwords don’t match');
    await api('/auth/reset', { body: { token: resetView.token, password: v.password } });
    resetView.token = '';
    await loadMe();
    toast('Password changed. You’re logged in.');
    go('#/');
  }) },
    field('New password', h('input', { id: 'npw', name: 'password', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' }), 'At least 10 characters.'),
    field('Confirm new password', h('input', { id: 'npw2', name: 'confirm', type: 'password', required: true, minlength: 10, autocomplete: 'new-password' })),
    h('button', { class: 'block' }, 'Set new password'));
  show(h('h1', {}, 'Choose a new password'),
    resetView.token ? form : h('p', {}, 'This link is incomplete. ', h('a', { href: '#/forgot' }, 'Ask for a new one.')));
}

async function adminView() {
  const { disputes } = await api('/admin/disputes');
  show(h('h1', {}, 'Open disputes'),
    disputes.length ? disputes.map((d) => {
      const note = h('input', { placeholder: 'Resolution note (kept on record)', 'aria-label': 'Resolution note' });
      const resolve = (outcome) => action(async () => {
        if (!confirm(outcome === 'refund' ? 'Refund the poster in full?' : 'Release the payment to the worker?')) return;
        await api(`/admin/disputes/${d.id}/resolve`, { body: { outcome, note: note.value } });
        toast('Resolved');
        adminView();
      });
      return h('div', { class: 'card' },
        h('div', { class: 'row' }, h('a', { href: `#/jobs/${d.jobId}` }, h('strong', {}, d.title)), h('span', { class: 'price' }, money(d.amountCents))),
        h('p', { class: 'muted' }, `Raised by ${d.raisedBy} · ${ago(d.createdAt)}`), h('p', {}, d.reason), note,
        h('div', { class: 'actions' }, h('button', { onclick: resolve('release') }, 'Release to worker'), h('button', { class: 'danger', onclick: resolve('refund') }, 'Refund poster')));
    }) : h('p', { class: 'empty' }, 'Nothing to review.'));
}

// ---------- router ----------

async function loadMe() {
  state.me = (await api('/me')).user;
}

async function render() {
  clearInterval(state.poll);
  // A message about the previous page shouldn't linger on the next one.
  // (Toasts raised just before navigating, like "Job posted", are kept.)
  if (Date.now() - (toast.at || 0) > 800) document.getElementById('toast').hidden = true;
  const [path] = location.hash.slice(1).split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  const tab = { '': 'browse', post: 'post', mine: 'mine', profile: 'profile' }[parts[0] ?? ''];
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (!['login', 'signup', 'forgot', 'reset'].includes(parts[0])) sessionStorage.setItem('after', location.hash || '#/');
  try {
    if (!parts.length) await browseView();
    else if (parts[0] === 'post') await postView();
    else if (parts[0] === 'jobs' && parts[1]) await jobView(parts[1]);
    else if (parts[0] === 'mine') await mineView();
    else if (parts[0] === 'profile') await profileView();
    else if (parts[0] === 'u' && parts[1]) await userView(parts[1]);
    else if (parts[0] === 'login' || parts[0] === 'signup') authView(parts[0]);
    else if (parts[0] === 'forgot') forgotView();
    else if (parts[0] === 'reset') resetView();
    else if (parts[0] === 'admin') await adminView();
    else show(h('p', { class: 'empty' }, 'Page not found.'));
  } catch (err) {
    if (err.status === 401) return go('#/login');
    show(h('p', { class: 'empty' }, err.message));
  }
  window.scrollTo(0, 0);
}

(async () => {
  [state.meta] = await Promise.all([api('/meta'), loadMe()]);
  document.getElementById('sim-badge').hidden = !state.meta.simulatedPayments;
  addEventListener('hashchange', render);
  render();
})();
