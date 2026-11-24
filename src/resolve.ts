// Terms resolution (spec section 8): which fees, benefit versions and earn rules one holder has on one date.
import type { Card, Catalog, Holder, Release, ReleaseChange, BenefitVersion, Money, EarnRuleVersion, EarnChoice } from './types.ts';
import { nextRenewal } from './dates.ts';

export interface ResolvedBenefit extends BenefitVersion { id: string; kind: string; name: string; card_id: string; applied_on: string; based_on?: string }
export interface ResolvedEarnRule extends EarnRuleVersion { id: string; categories: string[]; exclude_categories?: string[]; choice?: EarnChoice; applied_on: string }
export interface Terms {
  card_id: string; as_of: string;
  /** Fixed fees; `free_count` says how many are free before the fee applies, such as a first authorized user. */
  fees: Record<string, Money & { free_count?: number }>;
  /** Percentage fees as fractions, such as foreign_transaction: "0.03". */
  fee_rates: Record<string, string>;
  benefits: ResolvedBenefit[];
  earn_rules: ResolvedEarnRule[];
  legacy: NonNullable<Release['legacy']>;
  history: { date: string; release: string; target: string; version?: number; change_type?: string }[];
}

const CATEGORY: Record<string, string> = { benefit: 'benefits', earn_rule: 'earn_rules', fee: 'fees', path: 'paths' };

/** The date a release change reaches this holder, per spec section 8. */
export function reachDate(r: Release, target: string, h: Holder): string {
  if (r.kind === 'baseline') return h.opened_on;
  if (h.opened_on >= r.effective_for_new) return h.opened_on;
  const cat = CATEGORY[target.split(':')[0]];
  const rules = r.transition ?? [];
  const rule = rules.find(t => t.applies_to.includes(target))
    ?? rules.find(t => t.applies_to.includes(cat))
    ?? rules.find(t => t.applies_to.includes('all'));
  if (!rule) return r.effective_for_new;
  // Grandfathered: existing holders keep their old terms indefinitely.
  if (rule.never) return '9999-12-31';
  if (rule.on) return rule.on;
  return nextRenewal(h, rule.next_renewal_on_or_after!);
}

export function findCard(catalog: Catalog, cardId: string): Card {
  const card = catalog.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  return card;
}

export function resolveTerms(catalog: Catalog, cardId: string, holder: Holder, asOf: string): Terms {
  const card = findCard(catalog, cardId);
  const releases = [...card.releases].sort((a, b) => (a.kind === 'baseline' ? -1 : b.kind === 'baseline' ? 1 : a.effective_for_new.localeCompare(b.effective_for_new)));
  const events: { date: string; order: number; r: Release; ch: ReleaseChange }[] = [];
  releases.forEach((r, ri) => r.changes.forEach((ch, ci) => {
    const date = reachDate(r, ch.target, holder);
    if (date <= asOf) events.push({ date, order: ri * 1000 + ci, r, ch });
  }));
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const fees: Terms['fees'] = {};
  const rates: Record<string, string> = {};
  const benefits = new Map<string, ResolvedBenefit>();
  const earn = new Map<string, ResolvedEarnRule>();
  for (const { date, r, ch } of events) {
    const [kind, ...rest] = ch.target.split(':');
    const id = rest.join(':');
    if (kind === 'fee' && ch.rate != null) rates[id] = ch.rate;
    else if (kind === 'fee' && ch.to) fees[id] = ch.free_count != null ? { ...ch.to, free_count: ch.free_count } : ch.to;
    else if (kind === 'benefit') {
      if (ch.change_type === 'retired') { benefits.delete(id); continue; }
      const b = card.benefits.find(x => x.id === id)!;
      const v = b.versions.find(x => x.version === ch.version)!;
      benefits.set(id, { ...v, id, kind: b.kind, name: b.name, card_id: b.card_id, applied_on: date, ...(b.based_on ? { based_on: b.based_on } : {}) });
    } else if (kind === 'earn_rule') {
      if (ch.change_type === 'retired') { earn.delete(id); continue; }
      const rule = card.earn_rules.find(x => x.id === id)!;
      const v = rule.versions.find(x => x.version === ch.version)!;
      earn.set(id, { ...v, id, categories: rule.categories, exclude_categories: rule.exclude_categories, choice: rule.choice, applied_on: date });
    }
  }
  const legacy = releases
    .filter(r => r.kind !== 'baseline' && holder.opened_on < r.effective_for_new)
    .flatMap(r => r.legacy ?? [])
    .filter(l => l.effective_to >= asOf);
  return {
    card_id: cardId, as_of: asOf, fees, fee_rates: rates,
    // Versions whose terms ended before the evaluation date are no longer in force.
    benefits: [...benefits.values()].filter(b => !b.effective_to || b.effective_to >= asOf),
    earn_rules: [...earn.values()].filter(e => !e.effective_to || e.effective_to >= asOf),
    legacy,
    history: events.map(e => ({ date: e.date, release: e.r.id, target: e.ch.target, version: e.ch.version, change_type: e.ch.change_type }))
  };
}

/** Releases that will reach this holder after `asOf` (announced future changes, delayed transitions). */
export function upcomingChanges(catalog: Catalog, cardId: string, holder: Holder, asOf: string) {
  const card = findCard(catalog, cardId);
  return card.releases.flatMap(r => r.changes.map(ch => ({ release: r.id, target: ch.target, version: ch.version, change_type: ch.change_type, to: ch.to, date: reachDate(r, ch.target, holder) })))
    .filter(x => x.date > asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
}
