// Builds a single-file clickable preview: the real front end (public/) running against the
// in-browser mock API (preview/mock-api.js), plus a bar to switch between sample people.
// Usage: node preview/build.mjs <output.html>
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const out = process.argv[2] || 'preview.html';

const index = read('public/index.html');
const body = index.slice(index.indexOf('<body>') + 6, index.indexOf('<script type="module"'));
const icon = `data:image/svg+xml;base64,${Buffer.from(read('public/icon.svg')).toString('base64')}`;
// Inline scripts must not contain a literal closing script tag.
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const bar = `
<section class="pv" aria-label="Preview controls">
  <div class="pv-row">
    <strong>Preview</strong>
    <span class="pv-note">Sample data · nothing is saved, sent or charged</span>
    <button type="button" class="pv-reset" id="pv-reset">Start over</button>
  </div>
  <div class="pv-people" role="group" aria-label="View the app as">
    <button type="button" data-user="priya" data-start="#/mine">Priya<small>Customer</small></button>
    <button type="button" data-user="sam" data-start="#/">Sam<small>Handyman</small></button>
    <button type="button" data-user="dana" data-start="#/mine">Dana<small>Painting business</small></button>
    <button type="button" data-user="" data-start="#/">Visitor<small>Not signed up</small></button>
  </div>
  <p class="pv-hint" id="pv-hint"></p>
</section>`;

const barCss = `
.pv { background: var(--brand-soft); border-bottom: 1px solid var(--line); padding-block: 10px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.pv > * { max-width: 680px; margin-inline: auto; }
.pv-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: .85rem; }
.pv-row strong { color: var(--brand); text-transform: uppercase; letter-spacing: .06em; font-size: .75rem; }
.pv-note { color: var(--muted); flex: 1; min-width: 0; }
.pv-reset { min-height: 32px; padding: 0 12px; font-size: .82rem; background: transparent; color: var(--brand); }
.pv-people { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
.pv-people button { flex-direction: column; gap: 0; min-height: 50px; padding: 4px; background: var(--card); color: var(--text); border: 1px solid var(--line); font-size: .9rem; line-height: 1.2; }
.pv-people button small { color: var(--muted); font-weight: 500; font-size: .7rem; }
.pv-people button[aria-pressed="true"] { border: 2px solid var(--brand); background: var(--card); }
.pv-hint { font-size: .85rem; margin: 8px auto 0; color: var(--text); }
.top { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--card); }
main { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
@media (max-width: 380px) { .pv-people button small { display: none; } }
`;

const barJs = `
(() => {
  const hints = {
    priya: 'Priya posted a wardrobe job and has two quotes. Open it to compare them, chat, accept one and pay. Her lawn job is in progress, held until she confirms.',
    sam: 'Sam is a handyman. Browse open jobs and send a quote. On "My jobs", the lawn job is paid and held, so he can mark it done.',
    dana: 'Dana runs a painting business and posted overflow work for other trades. She has a quote from Ferris Painting.',
    '': 'What a new visitor sees. Try signing up: any email works in the preview.',
  };
  const buttons = [...document.querySelectorAll('.pv-people button')];
  const mark = (id) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.user === (id || ''))));
    const known = Object.prototype.hasOwnProperty.call(hints, id || '');
    const hint = document.getElementById('pv-hint');
    if (known) return void (hint.textContent = hints[id || '']);
    hint.textContent = 'You’re signed in as your new account. In the real app we’d now email you a link to confirm your address. ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pv-reset';
    btn.textContent = 'Pretend I clicked the email link';
    btn.addEventListener('click', () => {
      window.gidPreview.verifyMe();
      hint.textContent = 'Email confirmed. Try posting a job.';
      window.dispatchEvent(new Event('gid:refresh'));
    });
    hint.append(btn);
  };
  const switchTo = (id, start) => {
    window.gidPreview.setUser(id || null);
    history.replaceState(null, '', start);
    mark(id);
    window.dispatchEvent(new Event('gid:refresh'));
  };
  buttons.forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.user, b.dataset.start)));
  addEventListener('gid:preview-user', (e) => mark(e.detail));
  document.getElementById('pv-reset').addEventListener('click', () => location.reload());
  // Terms and privacy are separate pages in the real app; here, explain instead of navigating away.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="/terms.html"], a[href="/privacy.html"]');
    if (!a) return;
    e.preventDefault();
    const t = document.getElementById('toast');
    t.textContent = 'Terms and privacy are draft placeholders until a lawyer writes them.';
    t.hidden = false;
    setTimeout(() => (t.hidden = true), 3200);
  });
  history.replaceState(null, '', '#/mine');
  mark('priya');
})();
`;

const html = `<title>Get It Done</title>
<meta name="description" content="Clickable preview of the Get It Done jobs marketplace.">
<meta name="theme-color" content="#0f766e">
<style>
${read('public/styles.css')}
${barCss}
</style>
${bar}
${body.replaceAll('/icon.svg', icon)}
<script>
${safe(read('preview/mock-api.js'))}
</script>
<script>
${safe(barJs)}
</script>
<script type="module">
${safe(read('public/app.js'))}
</script>
`;

writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
