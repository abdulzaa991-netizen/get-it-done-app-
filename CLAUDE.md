# Get It Done: working rules

A two-sided local jobs marketplace (trade overflow + home jobs). Cloudflare Workers + D1 + Stripe Connect. See `docs/PLAN.md` and `docs/LEGAL.md`.

## Rules (from the owner)

- **Payments need owner approval.** Never take, make or switch on real payments without explicit approval. Live Stripe keys are refused in code unless `ALLOW_LIVE_PAYMENTS=true`; don't set it, or work around it, without approval.
- **Ask before spending money** on any service, plan, domain or tool.
- **Never commit secrets** or share API keys or personal info publicly. Secrets go in `wrangler secret put` or a git-ignored `.dev.vars`.
- **Nothing goes public** (deploy, domain, store listing, marketing) until the owner decides the brand: under Salam Solutions or its own business.
- **Honesty:** report test results as they are, mark estimates as estimates, and never claim workers are "verified" when they aren't.
- **Mobile-native:** design phone-first; every screen must work one-handed on a small phone.
- **Security review before launch** (`/security-review`, plus a manual check of payments and authorisation).

## Code

- `src/app.ts`: API routes. `src/payments.ts`: release/refund/funding (the only place money moves). `src/lib/rules.ts`: pure rules (job state machine, fees, parsing).
- Every job status change goes through `transition()` in `rules.ts` and `moveJob()` (an optimistic `WHERE status = ?` guard).
- Money is integer cents (AUD). Times are unix ms.
- Front end: `public/`, no build step. Build DOM with `h()` (textContent only); never `innerHTML` with user data.
- Public user data goes through `publicUser()`; email, address and payout details are never public.

## Commands

```bash
npm install
npm run db:migrate:local
npx wrangler dev --var ADMIN_EMAILS:admin@test.local   # simulated payments, http://localhost:8787
npm test            # unit tests
npm run typecheck
npm run e2e         # full lifecycle against the running dev server
```
