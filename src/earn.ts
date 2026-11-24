// Spend assignment (spec section 13, step 3): which card earns what on each spend category.
//
// Each category's spend goes to the card rule with the highest value per dollar, up to that rule's cap;
// spend above a cap flows to the next-best rule, which may be on another card. Rules that share a
// `cap_group` share one cap. Stacking rules then add to the spend already assigned to their card, and
// boost rules scale a card's total. Categories are processed in order of their best available value,
// so the most valuable uses of a shared cap are filled first. The result is deterministic.
import type { Catalog, Condition, WalletCard } from './types.ts';
import type { ResolvedEarnRule, Terms } from './resolve.ts';
import { addMonths, daysBetween } from './dates.ts';

export interface EarnInput {
  catalog: Catalog;
  cards: WalletCard[];
  terms: Map<string, Terms>;
  asOf: string;
  horizonEnd: string;
  spend: Record<string, number>;
  /** Present value in cents of one unit of a currency earned today. */
  pointValue: (currency: string) => number;
}
export interface Assignment {
  category: string; wallet_card_id: string; rule_id: string; amount: number;
  currency: string; points: number; value: number; moved_from?: string;
}
export interface Lane { wc: WalletCard; rule: ResolvedEarnRule; currency: string; mult: number; value: number; fraction: number; capKey?: string }

const PERIODS_PER_YEAR: Record<string, number> = { calendar_year: 1, cardmember_year: 1, quarter: 4, month: 12, statement: 12 };

export function ancestors(catalog: Catalog, cat: string): string[] {
  const out = [cat];
  let cur = catalog.spend_categories.find(c => c.id === cat);
  while (cur?.parent) { out.push(cur.parent); cur = catalog.spend_categories.find(c => c.id === cur!.parent); }
  if (!out.includes('cat:all')) out.push('cat:all');
  return out;
}

/** Card year (1-based) of a holder on a date. */
export function cardYear(wc: WalletCard, date: string): number {
  let y = 1;
  while (addMonths(wc.opened_on, 12 * y) <= date) y++;
  return y;
}

/**
 * Whether a condition holds for this wallet card. Conditions the user layer can't decide are assumed met
 * (enrollment, payment method unless the holder recorded one), except min_transaction, which a spend
 * profile of category totals can never show, so it is assumed not met.
 */
export function conditionMet(c: Condition, wc: WalletCard, asOf: string, horizonEnd: string): boolean {
  const sel = wc.selections ?? {};
  switch (c.type) {
    case 'selection_is': {
      const chosen = sel[String(c.name)];
      if (c.value === undefined) return chosen !== undefined;
      return Array.isArray(chosen) ? chosen.includes(c.value) : chosen === c.value;
    }
    case 'card_year': {
      const y = cardYear(wc, asOf);
      if (c.years) return (c.years as number[]).includes(y);
      return y >= Number(c.min ?? 1) && (c.max == null || y <= Number(c.max));
    }
    case 'date_window': return (!c.from || String(c.from) <= horizonEnd) && (!c.to || String(c.to) >= asOf);
    case 'payment_method': return sel.payment_method === undefined || sel.payment_method === c.method;
    case 'min_transaction': return false;
    case 'any_of': return ((c.conditions as Condition[]) ?? []).some(x => conditionMet(x, wc, asOf, horizonEnd));
    default: return true;
  }
}

export function assignSpend(input: EarnInput) {
  const { catalog, cards, terms, asOf, horizonEnd, spend, pointValue } = input;
  const horizonDays = daysBetween(asOf, horizonEnd);
  const years = horizonDays / 365;
  const anc = new Map(Object.keys(spend).map(c => [c, ancestors(catalog, c)]));
  const explicitOnly = new Set(catalog.spend_categories.filter(c => (c as any).explicit_only).map(c => c.id));

  const active = (r: ResolvedEarnRule) => (!r.effective_to || r.effective_to >= asOf) && (!r.effective_from || r.effective_from <= horizonEnd);
  const rulesOf = (wc: WalletCard) => terms.get(wc.id)!.earn_rules
    .filter(active)
    .filter(r => (r.conditions ?? []).every(c => conditionMet(c, wc, asOf, horizonEnd)));

  // top_spend choices: rank a rule's categories by the wallet's spend that falls under each.
  const spendUnder = (cat: string) => Object.entries(spend).reduce((s, [c, a]) => s + (anc.get(c)!.includes(cat) ? a : 0), 0);
  const topCategories = (r: ResolvedEarnRule) =>
    [...r.categories].sort((a, b) => spendUnder(b) - spendUnder(a) || a.localeCompare(b)).slice(0, r.choice?.pick ?? 1);
  // With groups, options are sets of categories; a group's spend is all spend that falls under any of them.
  const groupSpend = (cats: string[]) => Object.entries(spend).reduce((s, [c, a]) => s + (anc.get(c)!.some(x => cats.includes(x)) ? a : 0), 0);
  const topGroups = (r: ResolvedEarnRule) =>
    [...(r.choice?.groups ?? [])].sort((a, b) => groupSpend(b.categories) - groupSpend(a.categories) || a.id.localeCompare(b.id)).slice(0, r.choice?.pick ?? 1).map(g => g.id);

  /** Share of the horizon (0–1) in which rule r applies to spend category `cat`, or 0. */
  function fraction(wc: WalletCard, r: ResolvedEarnRule, cat: string): number {
    const chain = anc.get(cat) ?? (anc.set(cat, ancestors(catalog, cat)), anc.get(cat)!);
    if ((r.exclude_categories ?? []).some(c => chain.includes(c))) return 0;
    // An explicit_only category (rent, mortgage) earns only on rules that name it or a category below it.
    let explicitAt = -1;
    chain.forEach((c, i) => { if (explicitOnly.has(c)) explicitAt = i; });
    const hit = r.categories.find(c => { const i = chain.indexOf(c); return i >= 0 && (explicitAt < 0 || i <= explicitAt); });
    if (!hit) return 0;
    const choice = r.choice;
    if (!choice) return 1;
    if (choice.groups && choice.mode !== 'rotating') {
      const group = choice.groups.find(g => g.categories.some(c => chain.includes(c)));
      if (!group) return 0;
      if (choice.mode === 'top_spend') return topGroups(r).includes(group.id) ? 1 : 0;
      const picked = wc.selections?.[choice.selection ?? ''];
      const list = Array.isArray(picked) ? picked : picked === undefined ? [] : [picked];
      return list.includes(group.id) ? 1 : 0;
    }
    if (choice.mode === 'holder_selects') {
      const chosen = wc.selections?.[choice.selection ?? ''];
      const list = Array.isArray(chosen) ? chosen : chosen === undefined ? [] : [chosen];
      return list.includes(hit) ? 1 : 0;
    }
    if (choice.mode === 'top_spend') return topCategories(r).includes(hit) ? 1 : 0;
    // rotating: days in the horizon when the schedule lists a category this spend falls under
    let days = 0;
    for (const s of r.schedule ?? []) {
      if (!s.categories.some(c => chain.includes(c))) continue;
      const from = s.from > asOf ? s.from : asOf, to = s.to < horizonEnd ? s.to : horizonEnd;
      days += Math.max(0, daysBetween(from, to) + 1);
    }
    return Math.min(1, days / horizonDays);
  }

  const capLeft = new Map<string, number>();
  const capKeyOf = (wc: WalletCard, r: ResolvedEarnRule) => {
    if (!r.cap) return undefined;
    const key = `${wc.id}|${r.cap_group ?? r.id}`;
    if (!capLeft.has(key)) capLeft.set(key, r.cap.amount * (PERIODS_PER_YEAR[r.cap_period ?? 'calendar_year'] ?? 1) * years);
    return key;
  };
  const currencyOf = (wc: WalletCard, r: ResolvedEarnRule) => r.currency ?? catalog.cards.find(c => c.id === wc.card_id)!.earns;
  // Stacking rules, and rules that earn a second currency (such as status credits), add to the spend's main earn instead of competing for it.
  const additive = (wc: WalletCard, r: ResolvedEarnRule) => !!r.stacks || currencyOf(wc, r) !== catalog.cards.find(c => c.id === wc.card_id)!.earns;

  function lanes(cat: string): Lane[] {
    const out: Lane[] = [];
    for (const wc of cards) for (const r of rulesOf(wc)) {
      if (r.boost || r.multiplier == null || additive(wc, r)) continue;
      const f = fraction(wc, r, cat);
      if (!f) continue;
      const currency = currencyOf(wc, r), mult = Number(r.multiplier);
      // A card's stacking and second-currency rules ride along with whatever spend it wins, so they count toward its rank.
      const extra = rulesOf(wc).filter(x => x.multiplier && additive(wc, x) && fraction(wc, x, cat) === 1)
        .reduce((s, x) => s + Number(x.multiplier) * pointValue(currencyOf(wc, x)), 0);
      out.push({ wc, rule: r, currency, mult, fraction: f, value: (mult * pointValue(currency) + extra) / 100 });
    }
    return out.sort((a, b) => b.value - a.value || cards.indexOf(a.wc) - cards.indexOf(b.wc) || a.rule.id.localeCompare(b.rule.id));
  }

  /** Best value per cent of spend this card can earn on a category, ignoring caps. */
  const bestRate = (wc: WalletCard, cat: string) => Math.max(0, ...lanes(cat).filter(l => l.wc.id === wc.id && l.fraction === 1).map(l => l.value));

  const rows: Assignment[] = [];
  const order = Object.keys(spend).filter(c => spend[c] > 0)
    .map(c => ({ c, v: lanes(c)[0]?.value ?? 0 }))
    .sort((a, b) => b.v - a.v || a.c.localeCompare(b.c));
  for (const { c: cat } of order) {
    let remaining = spend[cat];
    for (const l of lanes(cat)) {
      if (remaining <= 0) break;
      const key = capKeyOf(l.wc, l.rule);
      // A rule that applies only part of the horizon (rotating) reaches only that share of the spend.
      let take = Math.min(remaining, Math.floor(spend[cat] * l.fraction));
      if (key) take = Math.min(take, Math.max(0, Math.floor(capLeft.get(key)!)));
      if (key && l.rule.choice?.mode === 'rotating') {
        // A rotating cap resets each scheduled period, and this category only uses the periods that list it.
        const chain = anc.get(cat) ?? (anc.set(cat, ancestors(catalog, cat)), anc.get(cat)!);
        const periods = (l.rule.schedule ?? []).filter(s => s.to >= asOf && s.from <= horizonEnd && s.categories.some(c => chain.includes(c))).length;
        take = Math.min(take, periods * l.rule.cap!.amount);
      }
      if (take <= 0) continue;
      if (key) capLeft.set(key, capLeft.get(key)! - take);
      remaining -= take;
      const points = (take / 100) * l.mult;
      rows.push({ category: cat, wallet_card_id: l.wc.id, rule_id: l.rule.id, amount: take, currency: l.currency, points, value: points * pointValue(l.currency) });
    }
  }
  return { rows, lanes, bestRate, rulesOf, fraction, capKeyOf, capLeft, currencyOf, additive };
}

/** Earn from stacking and boost rules on top of the assigned rows, and the total value of everything. */
export function totalEarn(input: EarnInput, rows: Assignment[], ctx: ReturnType<typeof assignSpend>) {
  const { cards, pointValue } = input;
  let value = rows.reduce((s, r) => s + r.value, 0);
  const points: Record<string, number> = {};
  for (const r of rows) points[r.currency] = (points[r.currency] ?? 0) + r.points;
  for (const wc of cards) {
    const mine = rows.filter(r => r.wallet_card_id === wc.id);
    for (const rule of ctx.rulesOf(wc).filter(r => r.multiplier && ctx.additive(wc, r))) {
      const key = ctx.capKeyOf(wc, rule);
      for (const row of mine) {
        const f = ctx.fraction(wc, rule, row.category);
        if (!f) continue;
        let amt = Math.floor(row.amount * f);
        if (key) { amt = Math.min(amt, Math.max(0, Math.floor(ctx.capLeft.get(key)!))); ctx.capLeft.set(key, ctx.capLeft.get(key)! - amt); }
        const cur = ctx.currencyOf(wc, rule), pts = (amt / 100) * Number(rule.multiplier);
        points[cur] = (points[cur] ?? 0) + pts;
        value += pts * pointValue(cur);
      }
    }
    const boost = ctx.rulesOf(wc).filter(r => r.boost).reduce((s, r) => s + Number(r.boost), 0);
    if (boost) {
      const cur = input.catalog.cards.find(c => c.id === wc.card_id)!.earns;
      const base = mine.filter(r => r.currency === cur).reduce((s, r) => s + r.points, 0);
      points[cur] = (points[cur] ?? 0) + base * boost;
      value += base * boost * pointValue(cur);
    }
  }
  return { value, points };
}
