# Legal flags before launch

**This is not legal advice.** It's a list of the issues an Australian lawyer needs to sign off on before Get It Done goes public, with what the app already does to reduce each risk. Laws are summarised as I understand them at October 2026. Confirm each one.

## 1. Contractor vs employee (the biggest risk)

- Since August 2024 the Fair Work Act again decides "employee or contractor?" on the **whole of the relationship** in practice, not just the written contract. Sham contracting penalties are significant.
- The same 2024 changes created **"employee-like" workers on digital labour platforms**. The Fair Work Commission can set minimum standards (pay, insurance, deactivation rules) for them. A jobs marketplace like this could fall within that regime. Get specific advice.
- **What keeps workers as genuine contractors:** they set their own price (quotes), choose which jobs to take, decide how and when to do the work, use their own tools, and can work for anyone. The app is built this way: no assigned jobs, no set rates, no rostering, no control over methods.
- **Don't add later:** forced acceptance rates, platform-set pay for home jobs, uniforms, or penalties for declining work, without legal review.
- **Trade overflow side:** a business passing work to a subcontractor has its own obligations (contracts, WHS, possibly payroll tax "relevant contracts" rules in some states). The terms should say the posting business is responsible for these.

## 2. Holding payments (Stripe Connect)

- Holding a customer's money until a job is done can count as a **non-cash payment facility** under the Corporations Act, which may need an AFS licence or an exemption. Using Stripe Connect (Stripe holds the money; the platform instructs releases) is the usual way marketplaces handle this, but get confirmation for this model.
- Stripe limits how long funds can sit before transfer (about 90 days in most countries). The app auto-releases 5 days after "done".
- Stripe's Connected Account Agreement must be shown to workers during onboarding (Stripe's Express flow does this).
- **ATO Sharing Economy Reporting Regime:** since 1 July 2024, platforms that facilitate services must report sellers' transactions to the ATO twice a year. This app will need to collect workers' ABN (or legal name, DOB and address) and report. *Not built yet.*
- **GST:** the platform fee is a taxable supply once turnover passes A$75k. Workers handle their own GST.

## 3. Insurance and licences for trades

- **Licences are state-based.** Electrical, plumbing/gas and (in some states) roofing need a licence at any job value. General residential building work needs a licence above a dollar threshold that varies by state (e.g. NSW about A$5,000, QLD about A$3,300). Check each state the app operates in.
- **App today:** shows a warning on licensed categories and displays the self-declared licence number. All profile details are labelled "not yet verified".
- **Before launch, decide:** require a licence number to quote on licensed categories, and verify it against state registers (NSW Fair Trading, QBCC, VBA/BPC etc.).
- **Insurance:** require workers to hold public liability for trade jobs (currently self-declared). The platform needs its own public liability, professional indemnity and cyber cover; talk to a broker.
- **Work health and safety:** a platform may have WHS duties as a "person conducting a business or undertaking". Get advice on what that means for this model.

## 4. Australian Consumer Law

- Consumer guarantees (due care and skill, fit for purpose, reasonable time) apply to workers' services, **and to the platform's own service**. Terms can't exclude them, and the terms must say so.
- **Unfair contract terms:** since November 2023 these carry penalties. Standard-form terms with consumers and small businesses must be fair (no one-sided cancellation, unlimited liability shifts etc.).
- **Misleading conduct:** don't call workers "verified", "licensed" or "insured" unless they really are checked. The app currently says "says insured" and "not yet verified" for this reason.
- **Reviews:** never suppress or edit genuine negative reviews; follow ACCC guidance on online reviews. Only people on a completed job can leave a review (already enforced).
- **Pricing:** show the full price the customer pays. The app shows the poster the total; the fee comes out of the worker's side.

## 5. Platform terms

Needs (drafts in `public/terms.html` are placeholders only):

- Marketplace role: Get It Done introduces customers and independent workers, and isn't a party to the work contract
- Payment holding, release, auto-release after 5 days, refunds, cancellation and the fee
- Dispute process and who decides
- Worker obligations: licences, insurance, tax, WHS
- Prohibited jobs (unlicensed regulated work, illegal work) and conduct; suspension
- Keeping payment on-platform (the app masks contact details in chat until a job is paid for)
- Liability limits that comply with the ACL

## 6. Privacy

- The Privacy Act has a small-business exemption (under A$3M turnover), but it **doesn't apply to businesses that disclose personal information for a benefit**, which a marketplace arguably does. Plan to comply with the Australian Privacy Principles from day one.
- The 2024 amendments added a statutory tort for serious invasions of privacy, with more changes still coming.
- **App today:** only collects what it needs; emails are never shown publicly; the street address is only given to the hired worker once payment is held; card and bank details stay with Stripe; passwords are hashed with PBKDF2.
- **Still to build:** privacy policy, account deletion and data export, a data-breach response plan (Notifiable Data Breaches scheme), and Spam Act consent for marketing emails.
- Data is stored on Cloudflare (global). The privacy policy must disclose overseas storage.

## 7. Business structure

Undecided: under Salam Solutions or its own business. Because the platform handles other people's money and disputes, a **separate Pty Ltd** (possibly owned by Salam Solutions) would keep that liability away from Salam's other work. Discuss with an accountant or lawyer.
