# Get It Done

Post a job, get quotes from local workers and trades, and pay safely: the money is held until the job's done.

- **Home jobs:** everyday people get handyman, cleaning, gardening and similar jobs done by local workers.
- **Trade overflow:** businesses pass extra work to other trades and contractors.

Built on Cloudflare Workers + D1 with Stripe Connect. It runs fully in **test mode** (simulated payments) with no keys at all.

```bash
npm install
npm run db:migrate:local
npx wrangler dev        # open http://localhost:8787
```

- [docs/PLAN.md](docs/PLAN.md): MVP scope, what's next, costs, go-live checklist
- [docs/LEGAL.md](docs/LEGAL.md): legal issues to clear before launch
- [CLAUDE.md](CLAUDE.md): working rules and code conventions

Status: MVP built and tested locally. **Not deployed, and live payments are switched off.**
