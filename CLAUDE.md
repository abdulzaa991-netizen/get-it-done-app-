# Get It Done: working rules

A two-sided local jobs marketplace (trade overflow + home jobs). Cloudflare Workers + D1 + Stripe Connect. See `docs/PLAN.md` and `docs/LEGAL.md`.

## Rules (from the owner)

- **Payments need owner approval.** Never take, make or switch on real payments without explicit approval. Live Stripe keys are refused in code unless `ALLOW_LIVE_PAYMENTS=true`; don't set it, or work around it, without approval.
- **Ask before spending money** on any service, plan, domain or tool.
- **Never commit secrets** or share API keys or personal info publicly. Secrets go in `wrangler secret put` or a git-ignored `.dev.vars`.
- **Business:** Get It Done is its own business and brand, run through a separate Pty Ltd, **not** Salam Solutions. Never use Salam Solutions' name, accounts or keys for it.
- **Nothing goes public** (deploy, domain, store listing, marketing) until the owner approves launch. That needs the company registered and the checklist in `docs/PLAN.md` done.
- **Honesty:** report test results as they are, mark estimates as estimates, and never claim workers are "verified" when they aren't.
- **Mobile-native:** design phone-first; every screen must work one-handed on a small phone.
- **Security review before launch** (`/security-review`, plus a manual check of payments and authorisation).

## Code

- `src/app.ts`: API routes. `src/payments.ts`: release/refund/funding (the only place money moves). `src/lib/rules.ts`: pure rules (job state machine, fees, parsing).
- Every job status change goes through `transition()` in `rules.ts` and `moveJob()` (an optimistic `WHERE status = ?` guard).
- Money is integer cents (AUD). Times are unix ms.
- Front end: `public/`, no build step. Build DOM with `h()` (textContent only); never `innerHTML` with user data.
- Public user data goes through `publicUser()`; email, address and payout details are never public.
- Emails: add them to `src/notify.ts` and send with `defer(c, ...)`. They must never throw or block the action. No `RESEND_API_KEY` = nothing is sent.
- Never log email bodies (they contain reset links).

## Commands

```bash
npm install
npm run db:migrate:local
npm run dev         # simulated payments + captured emails, http://localhost:8787
npm test            # unit tests
npm run typecheck
npm run e2e         # full lifecycle against the running dev server
npm run db:clear-limits:local   # if repeated local runs hit rate limits
```
