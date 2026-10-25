// Business rules kept free of I/O so they can be unit-tested.

export type JobStatus =
  | 'open'
  | 'awaiting_payment'
  | 'funded'
  | 'done'
  | 'released'
  | 'refunded'
  | 'cancelled'
  | 'disputed';

export type Actor = 'poster' | 'worker' | 'admin' | 'system';

export type JobAction =
  | 'accept_quote'
  | 'pay'
  | 'cancel'
  | 'mark_done'
  | 'confirm'
  | 'dispute'
  | 'auto_release'
  | 'resolve_release'
  | 'resolve_refund';

const TRANSITIONS: Record<JobAction, { from: JobStatus[]; to: JobStatus; by: Actor[] }> = {
  accept_quote: { from: ['open'], to: 'awaiting_payment', by: ['poster'] },
  pay: { from: ['awaiting_payment'], to: 'funded', by: ['system'] },
  cancel: { from: ['open', 'awaiting_payment'], to: 'cancelled', by: ['poster'] },
  mark_done: { from: ['funded'], to: 'done', by: ['worker'] },
  confirm: { from: ['done'], to: 'released', by: ['poster'] },
  dispute: { from: ['funded', 'done'], to: 'disputed', by: ['poster', 'worker'] },
  auto_release: { from: ['done'], to: 'released', by: ['system'] },
  resolve_release: { from: ['disputed'], to: 'released', by: ['admin'] },
  resolve_refund: { from: ['disputed'], to: 'refunded', by: ['admin'] },
};

/** Returns the next status, or null if the action isn't allowed. */
export function transition(status: JobStatus, action: JobAction, actor: Actor): JobStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(status) && t.by.includes(actor) ? t.to : null;
}

/** Platform cut on a job amount, rounded to the nearest cent. */
export function platformFee(amountCents: number, feeBps: number): number {
  return Math.round((amountCents * feeBps) / 10_000);
}

/** Parses "120", "120.5" or "$1,200.50" into cents. Returns null if not a sensible amount. */
export function dollarsToCents(input: unknown): number | null {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  // $10 minimum keeps card fees sane; $50k cap until there's fraud review for big jobs.
  return cents >= 1_000 && cents <= 5_000_000 ? cents : null;
}

export const CATEGORIES = [
  'Handyman',
  'Cleaning',
  'Gardening',
  'Removals',
  'Painting',
  'Assembly',
  'Electrical',
  'Plumbing',
  'Carpentry',
  'Tiling',
  'Roofing',
  'Concreting',
  'Labour hire',
  'Other',
] as const;

/** Categories where Australian states commonly require a licence for the work itself. */
export const LICENSED_CATEGORIES = new Set(['Electrical', 'Plumbing', 'Roofing']);

/** Strips obvious phone numbers and emails from chat before a job is funded (keeps payments on-platform). */
export function maskContactDetails(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email hidden]')
    .replace(/(\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}/g, '[phone hidden]');
}
