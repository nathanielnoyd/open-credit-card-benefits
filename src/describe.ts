// Plain-language text generated from structured records, so descriptions can never drift from the data.
// Benefits carry an authored `summary`; earn rules and fees are described here.
import type { Catalog, Money } from './types.ts';
import type { ResolvedEarnRule } from './resolve.ts';

const PERIOD: Record<string, string> = { calendar_year: 'a calendar year', cardmember_year: 'a card year', semiannual: 'every six months', quarter: 'a quarter', month: 'a month', statement: 'a billing cycle' };

export function money(m: Money | undefined | null): string {
  if (!m) return '';
  const v = m.amount / 100;
  const s = Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return m.currency === 'USD' ? `$${s}` : `${s} ${m.currency}`;
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}

/** "4x points on dining, on up to $50,000 a calendar year" or "5% back on ...". */
export function describeEarnRule(catalog: Catalog, cardEarns: string, r: ResolvedEarnRule): string {
  const catName = (id: string) => (catalog.spend_categories.find(c => c.id === id)?.name ?? id.replace(/^cat:/, '')).replace(/^All purchases$/, 'everything else');
  const currency = catalog.currencies.find(c => c.id === (r.currency ?? cardEarns));
  const cashlike = currency?.kind === 'cashback';
  if (r.boost) return `${Math.round(Number(r.boost) * 100)}% more on all earning${r.conditions?.length ? ' when its conditions are met' : ''}`;
  const rate = cashlike ? `${r.multiplier}% back` : `${r.multiplier}x ${r.currency && r.currency !== cardEarns ? currency?.name ?? r.currency : 'points'}`;
  const choice = r.choice;
  let where: string;
  if (choice?.groups) where = `${choice.mode === 'top_spend' ? `your top ${choice.pick ?? 1} of` : choice.mode === 'holder_selects' ? `${choice.pick ?? 1} you choose from` : 'rotating categories from'} ${list(choice.groups.map(g => g.name ?? list(g.categories.map(catName))))}`;
  else if (choice?.mode === 'top_spend') where = `your top ${choice.pick ?? 1} eligible ${choice.pick && choice.pick > 1 ? 'categories' : 'category'} (${list(r.categories.map(catName))})`;
  else if (choice?.mode === 'holder_selects') where = `${choice.pick ?? 1} ${choice.pick && choice.pick > 1 ? 'categories' : 'category'} you choose (${list(r.categories.map(catName))})`;
  else if (choice?.mode === 'rotating') where = 'quarterly rotating categories';
  else where = list(r.categories.map(catName));
  let s = `${r.stacks ? 'An extra ' : ''}${rate} on ${where}`;
  if (r.exclude_categories?.length) s += `, excluding ${list(r.exclude_categories.map(catName))}`;
  if (r.cap) s += `, on up to ${money(r.cap)} ${PERIOD[r.cap_period ?? 'calendar_year'] ?? r.cap_period}${r.cap_group ? ' (shared with other bonus categories)' : ''}`;
  const yr = r.conditions?.find(c => c.type === 'card_year');
  if (yr) s += yr.years ? ` in card year ${list((yr.years as number[]).map(String))}` : ` from card year ${yr.min}`;
  if (r.conditions?.some(c => c.type === 'enrollment_required')) s += ', after activation';
  if (r.effective_to) s += ` until ${r.effective_to}`;
  return s;
}
