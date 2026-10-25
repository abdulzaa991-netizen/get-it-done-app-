// Minimal Stripe REST client over fetch. Model: Connect Express accounts for workers,
// "separate charges and transfers": the poster pays the platform, the platform holds the
// funds, and on completion transfers (amount - fee) to the worker's connected account.

import type { Env } from './env';
import { hmacSha256Hex, timingSafeEqual } from './lib/crypto';

/**
 * Real money only moves with the owner's explicit approval: a live key (sk_live_/rk_live_) is
 * refused unless ALLOW_LIVE_PAYMENTS is exactly "true". Test keys (sk_test_) never move real money.
 */
export const stripeFor = (env: Env) => new Stripe(env.STRIPE_SECRET_KEY!, env.ALLOW_LIVE_PAYMENTS === 'true');

type Params = Record<string, string | number | boolean | undefined>;

export class Stripe {
  constructor(private key: string, allowLive = false) {
    if (/^(sk|rk)_live_/.test(key) && !allowLive) throw new Error('Live Stripe key refused: live payments not approved.');
  }

  private async call<T = any>(method: 'GET' | 'POST', path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key}` };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const url = `https://api.stripe.com/v1${path}${method === 'GET' && body.size ? `?${body}` : ''}`;
    const res = await fetch(url, { method, headers, body: method === 'POST' ? body : undefined });
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message ?? res.status}`);
    return json as T;
  }

  createExpressAccount(email: string, userId: string) {
    return this.call<{ id: string }>('POST', '/accounts', {
      type: 'express',
      country: 'AU',
      email,
      'capabilities[transfers][requested]': true,
      'metadata[user_id]': userId,
    }, `acct-${userId}`);
  }

  createAccountLink(account: string, refreshUrl: string, returnUrl: string) {
    return this.call<{ url: string }>('POST', '/account_links', {
      account,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  }

  getAccount(id: string) {
    return this.call<{ id: string; payouts_enabled: boolean; capabilities?: { transfers?: string } }>('GET', `/accounts/${id}`);
  }

  createCheckout(o: { jobId: string; paymentId: string; title: string; amountCents: number; email: string; successUrl: string; cancelUrl: string }) {
    return this.call<{ id: string; url: string }>('POST', '/checkout/sessions', {
      mode: 'payment',
      customer_email: o.email,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': 'aud',
      'line_items[0][price_data][unit_amount]': o.amountCents,
      'line_items[0][price_data][product_data][name]': o.title.slice(0, 200),
      'payment_intent_data[transfer_group]': o.jobId,
      'payment_intent_data[metadata][job_id]': o.jobId,
      'metadata[job_id]': o.jobId,
      'metadata[payment_id]': o.paymentId,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
    }, `checkout-${o.paymentId}`);
  }

  getPaymentIntent(id: string) {
    return this.call<{ id: string; latest_charge: string | null }>('GET', `/payment_intents/${id}`);
  }

  createTransfer(o: { amountCents: number; destination: string; jobId: string; sourceCharge: string | null; paymentId: string }) {
    return this.call<{ id: string }>('POST', '/transfers', {
      amount: o.amountCents,
      currency: 'aud',
      destination: o.destination,
      transfer_group: o.jobId,
      // Ties the transfer to the charge so it works before the charge's funds settle.
      source_transaction: o.sourceCharge ?? undefined,
    }, `transfer-${o.paymentId}`);
  }

  refund(paymentIntent: string, paymentId: string) {
    return this.call<{ id: string }>('POST', '/refunds', { payment_intent: paymentIntent }, `refund-${paymentId}`);
  }
}

/** Verifies a Stripe-Signature header. Returns the parsed event or null. */
export async function verifyStripeWebhook(payload: string, header: string | null, secret: string, nowMs = Date.now()): Promise<any | null> {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return null;
  if (Math.abs(nowMs / 1000 - t) > 300) return null; // 5 minute replay window
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`);
  if (!sigs.some((s) => timingSafeEqual(s, expected))) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
