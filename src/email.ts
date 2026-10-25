// Sending email. With RESEND_API_KEY set, mail goes out through Resend. Without it nothing is
// sent: messages are logged (subject only), and captured in dev_outbox when DEV_OUTBOX is "true"
// (local development only, so the e2e test can read reset links).

import type { Env } from './env';
import { newId } from './lib/crypto';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

const FOOTER = '\n\n—\nGet It Done\nYou’re getting this because you have a Get It Done account.';

export async function sendEmail(env: Env, email: Email): Promise<void> {
  const subject = email.subject.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = email.text + FOOTER;
  if (!env.RESEND_API_KEY) {
    console.log(`[email not sent: no provider] to=${email.to.replace(/(.).*@/, '$1***@')} subject="${subject}"`);
    if (env.DEV_OUTBOX === 'true') {
      await env.DB.prepare(`INSERT INTO dev_outbox (id, to_email, subject, body, created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(newId(), email.to, subject, text, Date.now())
        .run();
    }
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject, text }),
  });
  if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
}

/** Sends without ever throwing: a failed email must not undo or fail the action that caused it. */
export async function trySend(env: Env, email: Email): Promise<void> {
  try {
    await sendEmail(env, email);
  } catch (e) {
    console.error('email failed', e);
  }
}
