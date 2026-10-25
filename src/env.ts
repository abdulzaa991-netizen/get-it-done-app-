export interface Env {
  DB: D1Database;
  APP_URL: string;
  PLATFORM_FEE_BPS: string;
  AUTO_RELEASE_DAYS: string;
  ADMIN_EMAILS: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** Must be exactly "true" for a live-mode Stripe key to be used. Owner approval required. */
  ALLOW_LIVE_PAYMENTS?: string;
  /** Secret. Without it no email is sent (logged only). */
  RESEND_API_KEY?: string;
  /** e.g. "Get It Done <hello@yourdomain.com.au>"; the domain must be verified with the provider. */
  EMAIL_FROM: string;
  /** Local development only: capture unsent emails in the dev_outbox table and expose /api/dev/outbox. */
  DEV_OUTBOX?: string;
}

/** Without a Stripe key the app runs end-to-end with simulated payments (no money moves). */
export const isSimulated = (env: Env) => !env.STRIPE_SECRET_KEY;

export const feeBps = (env: Env) => Number(env.PLATFORM_FEE_BPS || 1000);

export const isAdmin = (env: Env, email: string) =>
  (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
