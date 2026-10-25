// Moving held money: release to the worker, or refund the poster. Each claims the payment row
// with a conditional UPDATE first so two callers (e.g. the poster confirming while the cron runs)
// can never both move the same money; Stripe idempotency keys back that up.

import { Env, isSimulated } from './env';
import { notify } from './notify';
import { stripeFor } from './stripe';

interface PaymentRow {
  id: string;
  job_id: string;
  amount_cents: number;
  fee_cents: number;
  simulated: number;
  payment_intent_id: string | null;
}

async function claimHeldPayment(env: Env, jobId: string, as: 'releasing' | 'refunding'): Promise<PaymentRow | null> {
  const p = await env.DB.prepare(`SELECT * FROM payments WHERE job_id = ? AND status = 'held'`).bind(jobId).first<PaymentRow>();
  if (!p) return null;
  const r = await env.DB.prepare(`UPDATE payments SET status = ?, updated_at = ? WHERE id = ? AND status = 'held'`)
    .bind(as, Date.now(), p.id)
    .run();
  return r.meta.changes === 1 ? p : null;
}

async function unclaim(env: Env, paymentId: string) {
  await env.DB.prepare(`UPDATE payments SET status = 'held', updated_at = ? WHERE id = ?`).bind(Date.now(), paymentId).run();
}

/** Pays the worker (amount minus platform fee) and marks the job released. */
export async function releasePayment(env: Env, jobId: string, fromStatuses: string[]): Promise<boolean> {
  const job = await env.DB.prepare(
    `SELECT j.id, j.status, u.stripe_account_id FROM jobs j JOIN users u ON u.id = j.worker_id WHERE j.id = ?`,
  ).bind(jobId).first<{ id: string; status: string; stripe_account_id: string | null }>();
  if (!job || !fromStatuses.includes(job.status)) return false;
  const p = await claimHeldPayment(env, jobId, 'releasing');
  if (!p) return false;

  let transferId: string | null = null;
  if (!p.simulated) {
    try {
      if (!job.stripe_account_id) throw new Error('worker has no payout account');
      const stripe = stripeFor(env);
      const pi = await stripe.getPaymentIntent(p.payment_intent_id!);
      const t = await stripe.createTransfer({
        amountCents: p.amount_cents - p.fee_cents,
        destination: job.stripe_account_id,
        jobId,
        sourceCharge: pi.latest_charge,
        paymentId: p.id,
      });
      transferId = t.id;
    } catch (e) {
      await unclaim(env, p.id);
      throw e;
    }
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE payments SET status = 'released', transfer_id = ?, updated_at = ? WHERE id = ?`).bind(transferId, now, p.id),
    env.DB.prepare(`UPDATE jobs SET status = 'released', updated_at = ? WHERE id = ?`).bind(now, jobId),
  ]);
  return true;
}

/** Refunds the poster in full and marks the job refunded. */
export async function refundPayment(env: Env, jobId: string): Promise<boolean> {
  const p = await claimHeldPayment(env, jobId, 'refunding');
  if (!p) return false;
  let refundId: string | null = null;
  if (!p.simulated) {
    try {
      refundId = (await stripeFor(env).refund(p.payment_intent_id!, p.id)).id;
    } catch (e) {
      await unclaim(env, p.id);
      throw e;
    }
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE payments SET status = 'refunded', refund_id = ?, updated_at = ? WHERE id = ?`).bind(refundId, now, p.id),
    env.DB.prepare(`UPDATE jobs SET status = 'refunded', updated_at = ? WHERE id = ?`).bind(now, jobId),
  ]);
  return true;
}

/** Marks a payment as held and the job as funded (after Stripe confirms, or straight away when simulated). */
export async function markFunded(env: Env, paymentId: string, paymentIntentId: string | null): Promise<'funded' | 'refund' | 'noop'> {
  const p = await env.DB.prepare(`SELECT p.id, p.job_id, p.status, j.status AS job_status FROM payments p JOIN jobs j ON j.id = p.job_id WHERE p.id = ?`)
    .bind(paymentId)
    .first<{ id: string; job_id: string; status: string; job_status: string }>();
  if (!p || p.status !== 'pending') return 'noop';
  const now = Date.now();
  const claimed = await env.DB.prepare(`UPDATE payments SET status = 'held', payment_intent_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(paymentIntentId, now, p.id)
    .run();
  if (claimed.meta.changes !== 1) return 'noop';
  if (p.job_status !== 'awaiting_payment') {
    // Paid for a job that was cancelled meanwhile: give the money straight back.
    if (!isSimulated(env) && paymentIntentId) {
      const r = await stripeFor(env).refund(paymentIntentId, p.id);
      await env.DB.prepare(`UPDATE payments SET status = 'refunded', refund_id = ?, updated_at = ? WHERE id = ?`).bind(r.id, now, p.id).run();
    }
    return 'refund';
  }
  await env.DB.prepare(`UPDATE jobs SET status = 'funded', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'`).bind(now, p.job_id).run();
  return 'funded';
}

/** Cron: release payments where the worker marked the job done and the poster neither confirmed nor disputed in time. */
export async function autoRelease(env: Env): Promise<number> {
  const cutoff = Date.now() - Number(env.AUTO_RELEASE_DAYS || 5) * 86_400_000;
  const { results } = await env.DB.prepare(`SELECT id FROM jobs WHERE status = 'done' AND done_at < ? LIMIT 50`).bind(cutoff).all<{ id: string }>();
  let n = 0;
  for (const j of results) {
    try {
      if (await releasePayment(env, j.id, ['done'])) {
        n++;
        await notify.released(env, j.id);
      }
    } catch (e) {
      console.error('auto-release failed', j.id, e);
    }
  }
  return n;
}
