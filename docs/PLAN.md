# Get It Done: plan

A two-sided local jobs marketplace for Australia.

1. **Trade overflow:** businesses with more work than they can handle post jobs for other trades or contractors to take on.
2. **Home jobs:** everyday people post jobs (handyman, cleaning, gardening, removals, etc.) and local workers take them.

One account can post jobs and also work on them. Get It Done takes a cut of each completed job.

## Stack (same approach as the Salam portal)

| Part | Choice | Why |
|---|---|---|
| Hosting + API | Cloudflare Workers (Hono router) | Free tier covers launch; global; no servers |
| Database | Cloudflare D1 (SQLite) | Free tier generous; simple SQL migrations |
| Front end | Plain HTML/CSS/JS served as Worker static assets, installable PWA | No build step; phone-first; can be wrapped as an app store app later |
| Payments | Stripe Connect Express, "separate charges and transfers" | The poster pays the platform, the funds are held, and the worker is paid (minus the fee) on completion |
| Auth | Email + password (PBKDF2), HttpOnly session cookie | No third-party cost; magic links can come later with an email provider |

I didn't find anything better for this stage. One option to consider later is Durable Objects for real-time chat; polling every 5 seconds is fine at MVP volume.

## MVP (built in this repo)

- [x] Sign up / log in, profile (suburb, trades, ABN, licence number, insurance declared)
- [x] Post a job: home job or trade overflow, category, suburb/postcode, private street address
- [x] Pricing: **ask for quotes** or **fixed price**
- [x] Browse open jobs, filter by type, category and postcode area
- [x] Quote (or offer at the fixed price), update or withdraw a quote
- [x] Poster compares quotes (rating, licence, insurance) and accepts one
- [x] Chat per job, one thread per worker. Phone numbers and emails are masked until the job is paid for (keeps deals and protection on-platform)
- [x] **Payment held until done:** poster pays → funds held → worker marks done → poster confirms → worker paid (amount − fee). Auto-release after 5 days if the poster does nothing
- [x] "Report a problem" → dispute → admin decides: release to worker or refund poster
- [x] Two-way reviews after completion, rating on public profiles
- [x] Street address only revealed to the hired worker once payment is held
- [x] Licensed-trade warning on electrical/plumbing/roofing jobs
- [x] Simulated payments mode (no Stripe key = no money moves) for building and testing
- [x] **Live payments locked:** a live Stripe key is refused unless `ALLOW_LIVE_PAYMENTS=true` is set, which needs owner approval
- [x] Rate limits on signup, login, posting and messages; CSRF protection; CSP and security headers
- [x] Unit tests (state machine, money, crypto, webhook signatures) + a 56-check end-to-end test

## Can wait (after MVP)

1. Email notifications (new quote, accepted, paid, done), via Resend or Cloudflare Email
2. Password reset (needs email, so it goes with 1). **Must ship before public launch.**
3. Photo uploads on jobs and on completion (Cloudflare R2)
4. Verification: ABN lookup (ABR web services, free), licence checks per state register, insurance certificate upload
5. Push notifications, and an app-store wrapper (Capacitor) if the PWA isn't enough
6. Real-time chat (Durable Objects)
7. Map/radius search instead of postcode area
8. Business features for trade overflow: repeat subcontractors, invoices with GST, job templates, team accounts
9. Deposits / milestone payments for big jobs (currently one payment per job, max $50k)
10. Admin dashboard beyond disputes: user suspension, job moderation, refunds outside disputes
11. Cancellation after payment by mutual agreement (today it goes through a dispute)
12. Account deletion and data export (privacy). **Should ship before public launch.**

## Costs

Estimates as at October 2026. **Check each on the provider's pricing page before committing.** Nothing here has been bought or signed up for.

| Item | Cost | When |
|---|---|---|
| Cloudflare Workers + D1 | Free tier (100k requests/day). Paid plan about US$5/month when needed | Free to start |
| Domain name (.com.au or .com) | About A$15–30/year | Before launch, after the brand decision |
| Stripe card fees | About 1.7% + A$0.30 per domestic card payment (more for international cards) | Per transaction, when live |
| Stripe Connect (Express) | About A$2–3 per active worker per month + about 0.25% + A$0.25 per payout | When live |
| Email (Resend etc.) | Free tier around 3,000 emails/month | When notifications ship |
| Lawyer: terms, privacy, contractor model review | Rough guess A$2,000–8,000 one-off | Before launch |
| Platform insurance (public liability, professional indemnity, cyber) | Rough guess A$1,500–5,000/year; get broker quotes | Before launch |
| Company registration (Pty Ltd, decided) | ASIC fee about A$600, plus accountant setup if used | Before launch |
| Trade mark (optional, recommended) | About A$250–400 per class with IP Australia | Before launch, after a name check |

**Fee maths at the default 10%:** on a A$200 job the poster pays A$200 and the worker receives A$180. From the A$20 fee, Stripe takes about A$3.70 (card) plus payout and active-account costs, which leaves roughly A$15–16 before GST on the fee. The fee is set by `PLATFORM_FEE_BPS` in `wrangler.jsonc`.

## Going live checklist

1. ~~Brand/ownership decision~~ **Decided: its own business, separate Pty Ltd.** Name check, company registration and accounts in the company's name are still to do (see [LEGAL.md §7](LEGAL.md#7-business-structure))
2. Legal items in [LEGAL.md](LEGAL.md) done and terms/privacy pages replaced
3. Password reset + email notifications shipped
4. Security review (run `/security-review`, plus manual review of payments and authorisation)
5. Stripe account in **test mode** first: run the full flow with test cards
6. **Owner approves live payments** → set the live key as a secret, set `ALLOW_LIVE_PAYMENTS=true`
7. Soft launch in one area with known tradies before opening up

## Setup (when approved)

```bash
npm install
npx wrangler d1 create get-it-done          # paste the id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put STRIPE_SECRET_KEY    # test key (sk_test_...) first
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npm run deploy
```

Stripe webhook endpoint: `https://<your-domain>/api/stripe/webhook`, events `checkout.session.completed` and `account.updated`. Enable Connect (Express) in the Stripe dashboard.
