# Status: paused 25 Oct 2026

Paused so the owner can work on Salam Solutions. Pick up from here.

## Where it stands

- **MVP built and tested locally, not deployed.** Covers posting jobs (home jobs + trade overflow), quotes or a fixed price, accepting, chat, payment held until the job's done, auto-release, disputes, two-way reviews, password reset, email notifications and email verification.
- **Tests:** 8 unit tests and a 104-check end-to-end test pass (`npm test`, `npm run dev` then `npm run e2e`). Phone-sized browser click-throughs pass.
- **Payments:** simulated only. Live Stripe keys are refused unless `ALLOW_LIVE_PAYMENTS=true`, which needs the owner's approval.
- **Email:** nothing is sent until `RESEND_API_KEY` is set.
- **Clickable preview (private):** https://claude.ai/artifact/8TwpkQNRZx1Kzaj4GDPZxM. Rebuild it with `node preview/build.mjs <out.html>`.
- **Work branch:** `claude/optimistic-lamport-7fnujc` (no pull request opened).

## Decisions made

- Its own business and brand, run through a **separate Pty Ltd**, not Salam Solutions.
- Stack: Cloudflare Workers + D1 + Stripe Connect Express (separate charges and transfers). Email via Resend.
- Platform fee: 10% taken from the worker's payout (`PLATFORM_FEE_BPS`).

## Owner to-do (these cost money or need you, so they haven't been done)

1. **Make the GitHub repo private.** It was public at last check.
2. Check the name is available (ASIC, IP Australia, domain). Have a backup name.
3. Register the Pty Ltd, get its ABN, and open a business bank account.
4. Open Stripe, Cloudflare, Resend, the domain and insurance in the company's name.
5. Lawyer: terms, privacy policy, contractor model, payment holding ([LEGAL.md](LEGAL.md)).
6. Insurance broker: platform public liability, professional indemnity and cyber.

## Next build steps (in order)

1. **Security review** (`/security-review` plus a manual check of payments and authorisation). Required before launch.
2. Account deletion and data export (privacy).
3. Licence number required for licensed categories (electrical, plumbing, roofing), then checking it against state registers.
4. ABN lookup (ABR, free) and insurance certificate upload.
5. ATO sharing economy reporting (collect what's needed from workers).
6. Photos on jobs (Cloudflare R2).
7. Then the rest of "Can wait" in [PLAN.md](PLAN.md).

## Going live

Follow the checklist in [PLAN.md](PLAN.md#going-live-checklist). Nothing goes public, and no real money moves, until the owner approves.
