// Date helpers. All dates are ISO strings compared lexically; arithmetic is done in UTC days.
const DAY = 86_400_000;
export const toMs = (d: string): number => Date.parse(d + 'T00:00:00Z');
export const fromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number): string => fromMs(toMs(d) + n * DAY);
export const addMonths = (d: string, n: number): string => {
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return fromMs(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(day, last)));
};
export const daysBetween = (a: string, b: string): number => (toMs(b) - toMs(a)) / DAY;

/** First renewal date on or after `d`: the holder's recorded fee dates, else anniversaries of the open date. */
export function nextRenewal(h: { opened_on: string; fee_post_dates?: string[] }, d: string): string {
  const recorded = (h.fee_post_dates ?? []).filter(x => x >= d).sort();
  if (recorded.length) return recorded[0];
  let years = Math.max(1, Number(d.slice(0, 4)) - Number(h.opened_on.slice(0, 4)) - 1);
  let candidate = addMonths(h.opened_on, 12 * years);
  while (candidate < d) candidate = addMonths(h.opened_on, 12 * ++years);
  return candidate;
}
