// Job lifecycle emails. Each function loads what it needs and never throws (see trySend).

import { trySend } from './email';
import type { Env } from './env';

interface JobPeople {
  id: string;
  title: string;
  amount_cents: number | null;
  fee_cents: number | null;
  poster_email: string;
  poster_name: string;
  worker_email: string | null;
  worker_name: string | null;
}

const aud = (cents: number | null) => `$${((cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
const jobLink = (env: Env, id: string) => `${env.APP_URL}/#/jobs/${id}`;

async function load(env: Env, jobId: string): Promise<JobPeople | null> {
  return env.DB.prepare(
    `SELECT j.id, j.title, j.amount_cents, j.fee_cents, p.email AS poster_email, p.name AS poster_name, w.email AS worker_email, w.name AS worker_name
     FROM jobs j JOIN users p ON p.id = j.poster_id LEFT JOIN users w ON w.id = j.worker_id WHERE j.id = ?`,
  ).bind(jobId).first<JobPeople>();
}

/** Runs the notification without letting any error escape. */
async function safely(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error('notify failed', e);
  }
}

export const notify = {
  welcome: (env: Env, to: string, name: string) =>
    trySend(env, {
      to,
      subject: 'Welcome to Get It Done',
      text: `Hi ${name},\n\nYour account is ready. Post a job, or set up payouts in your profile to start quoting on jobs near you.\n\n${env.APP_URL}`,
    }),

  passwordReset: (env: Env, to: string, name: string, link: string) =>
    trySend(env, {
      to,
      subject: 'Reset your Get It Done password',
      text: `Hi ${name},\n\nUse this link to set a new password. It works once and expires in 1 hour:\n\n${link}\n\nIf you didn’t ask for this, ignore this email. Your password won’t change.`,
    }),

  passwordChanged: (env: Env, to: string, name: string) =>
    trySend(env, {
      to,
      subject: 'Your Get It Done password was changed',
      text: `Hi ${name},\n\nYour password was just changed, and you’ve been logged out on other devices.\n\nIf this wasn’t you, reset your password now: ${env.APP_URL}/#/forgot`,
    }),

  newQuote: (env: Env, jobId: string, workerName: string, amountCents: number) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      await trySend(env, {
        to: j.poster_email,
        subject: `New quote: ${aud(amountCents)} for “${j.title}”`,
        text: `Hi ${j.poster_name},\n\n${workerName} quoted ${aud(amountCents)} for your job “${j.title}”.\n\nCompare quotes: ${jobLink(env, jobId)}`,
      });
    }),

  quoteAccepted: (env: Env, jobId: string) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j?.worker_email) return;
      await trySend(env, {
        to: j.worker_email,
        subject: `You got the job: “${j.title}”`,
        text: `Hi ${j.worker_name},\n\n${j.poster_name} accepted your quote of ${aud(j.amount_cents)}. We’ll email you once their payment is held. Please don’t start before then.\n\n${jobLink(env, jobId)}`,
      });
    }),

  funded: (env: Env, jobId: string) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      await Promise.all([
        j.worker_email &&
          trySend(env, {
            to: j.worker_email,
            subject: `Payment held, you can start: “${j.title}”`,
            text: `Hi ${j.worker_name},\n\n${aud(j.amount_cents)} is now held for “${j.title}”. The job address is on the job page. When you’ve finished, mark the job as done.\n\n${jobLink(env, jobId)}`,
          }),
        trySend(env, {
          to: j.poster_email,
          subject: `Booked: “${j.title}”`,
          text: `Hi ${j.poster_name},\n\nYour payment of ${aud(j.amount_cents)} is held safely. ${j.worker_name} has been told to go ahead. We only pay them once you confirm the job is done.\n\n${jobLink(env, jobId)}`,
        }),
      ]);
    }),

  markedDone: (env: Env, jobId: string, autoReleaseDays: number) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      await trySend(env, {
        to: j.poster_email,
        subject: `Please confirm: “${j.title}” is done`,
        text: `Hi ${j.poster_name},\n\n${j.worker_name} has marked “${j.title}” as done. Please check the work and confirm, or report a problem.\n\nIf we don’t hear from you within ${autoReleaseDays} days, the payment releases to ${j.worker_name} automatically.\n\n${jobLink(env, jobId)}`,
      });
    }),

  released: (env: Env, jobId: string) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      await Promise.all([
        j.worker_email &&
          trySend(env, {
            to: j.worker_email,
            subject: `You’ve been paid for “${j.title}”`,
            text: `Hi ${j.worker_name},\n\n${aud((j.amount_cents ?? 0) - (j.fee_cents ?? 0))} is on its way to your bank account (${aud(j.amount_cents)} less the ${aud(j.fee_cents)} service fee). Payouts usually arrive within a few business days.\n\nLeave a review for ${j.poster_name}: ${jobLink(env, jobId)}`,
          }),
        trySend(env, {
          to: j.poster_email,
          subject: `Job complete: “${j.title}”`,
          text: `Hi ${j.poster_name},\n\n“${j.title}” is complete and ${j.worker_name} has been paid. How did it go? Leave a review: ${jobLink(env, jobId)}`,
        }),
      ]);
    }),

  disputed: (env: Env, jobId: string, raisedByPoster: boolean, admins: string[]) =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      const other = raisedByPoster ? { email: j.worker_email, name: j.worker_name } : { email: j.poster_email, name: j.poster_name };
      const by = raisedByPoster ? j.poster_name : j.worker_name;
      await Promise.all([
        other.email &&
          trySend(env, {
            to: other.email,
            subject: `A problem was reported on “${j.title}”`,
            text: `Hi ${other.name},\n\n${by} reported a problem with “${j.title}”. The payment stays held while our team reviews it, and we may contact you for details.\n\n${jobLink(env, jobId)}`,
          }),
        ...admins.map((to) =>
          trySend(env, { to, subject: `[Admin] New dispute: “${j.title}”`, text: `${by} raised a dispute on “${j.title}” (${aud(j.amount_cents)}).\n\n${env.APP_URL}/#/admin` }),
        ),
      ]);
    }),

  resolved: (env: Env, jobId: string, outcome: 'release' | 'refund') =>
    safely(async () => {
      const j = await load(env, jobId);
      if (!j) return;
      const result = outcome === 'release' ? `the payment has been released to ${j.worker_name}` : `${j.poster_name} has been refunded in full`;
      await Promise.all(
        [[j.poster_email, j.poster_name], [j.worker_email, j.worker_name]].map(([to, name]) =>
          to ? trySend(env, { to, subject: `Problem resolved: “${j.title}”`, text: `Hi ${name},\n\nWe’ve reviewed the problem on “${j.title}”: ${result}.\n\n${jobLink(env, jobId)}` }) : null,
        ),
      );
    }),

  newMessage: (env: Env, o: { jobId: string; to: string; toName: string; fromName: string; body: string; link: string }) =>
    safely(async () => {
      const j = await load(env, o.jobId);
      if (!j) return;
      const snippet = o.body.length > 200 ? `${o.body.slice(0, 200)}…` : o.body;
      await trySend(env, {
        to: o.to,
        subject: `New message from ${o.fromName} about “${j.title}”`,
        text: `Hi ${o.toName},\n\n${o.fromName} wrote:\n\n“${snippet}”\n\nReply: ${o.link}\n\nYou can turn off message emails in your profile.`,
      });
    }),
};
