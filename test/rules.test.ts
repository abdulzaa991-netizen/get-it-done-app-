import { describe, expect, it } from 'vitest';
import { hashPassword, hmacSha256Hex, verifyPassword } from '../src/lib/crypto';
import { dollarsToCents, maskContactDetails, platformFee, transition } from '../src/lib/rules';
import { Stripe, verifyStripeWebhook } from '../src/stripe';

describe('job state machine', () => {
  it('follows the happy path', () => {
    expect(transition('open', 'accept_quote', 'poster')).toBe('awaiting_payment');
    expect(transition('awaiting_payment', 'pay', 'system')).toBe('funded');
    expect(transition('funded', 'mark_done', 'worker')).toBe('done');
    expect(transition('done', 'confirm', 'poster')).toBe('released');
  });
  it('blocks the wrong actor or status', () => {
    expect(transition('open', 'accept_quote', 'worker')).toBeNull();
    expect(transition('funded', 'confirm', 'poster')).toBeNull(); // can't release before the worker marks done
    expect(transition('funded', 'cancel', 'poster')).toBeNull(); // money held: needs a dispute instead
    expect(transition('done', 'mark_done', 'worker')).toBeNull();
    expect(transition('released', 'dispute', 'poster')).toBeNull();
    expect(transition('disputed', 'resolve_refund', 'poster')).toBeNull();
    expect(transition('disputed', 'resolve_refund', 'admin')).toBe('refunded');
  });
});

describe('money', () => {
  it('calculates the platform fee', () => {
    expect(platformFee(15_000, 1000)).toBe(1_500);
    expect(platformFee(12_345, 1000)).toBe(1_235);
  });
  it('parses dollar amounts', () => {
    expect(dollarsToCents('150')).toBe(15_000);
    expect(dollarsToCents('$1,200.50')).toBe(120_050);
    expect(dollarsToCents(99.99)).toBe(9_999);
    expect(dollarsToCents('9')).toBeNull(); // below $10
    expect(dollarsToCents('60000')).toBeNull(); // above cap
    expect(dollarsToCents('12.345')).toBeNull();
    expect(dollarsToCents('abc')).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
  });
});

describe('contact masking', () => {
  it('hides emails and AU phone numbers', () => {
    expect(maskContactDetails('call 0412 345 678 or bob@example.com')).toBe('call [phone hidden] or [email hidden]');
    expect(maskContactDetails('+61 412 345 678')).toBe('[phone hidden]');
    expect(maskContactDetails('(02) 9876 5432')).toContain('(02)'); // not caught: brackets; acceptable for MVP
    expect(maskContactDetails('Can do Tuesday for $150')).toBe('Can do Tuesday for $150');
  });
});

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('stripe', () => {
  it('refuses a live key unless live payments are approved', () => {
    expect(() => new Stripe('sk_live_abc')).toThrow(/not approved/);
    expect(() => new Stripe('rk_live_abc')).toThrow(/not approved/);
    expect(() => new Stripe('sk_test_abc')).not.toThrow();
    expect(() => new Stripe('sk_live_abc', true)).not.toThrow();
  });

  it('verifies webhook signatures', async () => {
    const secret = 'whsec_test';
    const payload = JSON.stringify({ id: 'evt_1', type: 'x' });
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacSha256Hex(secret, `${t}.${payload}`);
    expect(await verifyStripeWebhook(payload, `t=${t},v1=${sig}`, secret)).toEqual({ id: 'evt_1', type: 'x' });
    expect(await verifyStripeWebhook(payload, `t=${t},v1=${'0'.repeat(64)}`, secret)).toBeNull();
    expect(await verifyStripeWebhook(payload + ' ', `t=${t},v1=${sig}`, secret)).toBeNull();
    expect(await verifyStripeWebhook(payload, `t=${t - 600},v1=${await hmacSha256Hex(secret, `${t - 600}.${payload}`)}`, secret)).toBeNull();
    expect(await verifyStripeWebhook(payload, null, secret)).toBeNull();
  });
});
