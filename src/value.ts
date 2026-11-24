// Wallet valuation (spec sections 6, 11, 12, 13). Pure: takes a catalog bundle and a wallet, returns numbers in cents.
import type { Catalog, Wallet, WalletCard, Currency, CombineRule, ValueSet } from './types.ts';
import { resolveTerms, findCard, type ResolvedBenefit, type Terms } from './resolve.ts';
import { assignSpend, totalEarn, type Assignment } from './earn.ts';
import { addMonths, daysBetween, nextRenewal } from './dates.ts';

/**
 * Valuation options. `values` is a value set (spec section 11): what perks and points are worth, from whoever the app
 * trusts, such as a publisher or the app's own defaults. The catalog carries facts only, so without values a credit
 * counts at face value, a perk without one at zero and points at their fixed rate or 1 cent, and the result lists
 * each of those as unvalued so the app knows what to ask the user.
 */
export interface Options { asOf: string; horizonMonths?: number; values?: ValueSet }
interface Part { entitlement: string; rule: CombineRule; value: number; benefit_id: string; wallet_card_id: string; counted?: boolean }

const PERIODS: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2 };
const num = (s: string | undefined, d: number) => (s == null ? d : Number(s));

/** Whether a path requirement holds for the cards in this wallet: wallet_holds by card or family, and any_of groups. */
export function holds(catalog: Catalog, heldCardIds: Set<string>, cond: { type: string; card_id?: unknown; family?: unknown; tier?: unknown; segment?: unknown; conditions?: unknown }): boolean {
  if (cond.type === 'any_of') return ((cond.conditions as any[]) ?? []).some(c => holds(catalog, heldCardIds, c));
  if (cond.type !== 'wallet_holds') return true;
  if (cond.card_id) return heldCardIds.has(String(cond.card_id));
  // A family, optionally narrowed to tiers: a rule for "any ultra-premium Sapphire" covers the personal and business Reserve.
  const tiers = cond.tier == null ? null : ([] as unknown[]).concat(cond.tier).map(String);
  // A segment narrows it further: "a personal United card" excludes the business card that carries the condition.
  if (cond.family) return catalog.cards.some(c => c.family === cond.family && (!tiers || tiers.includes(String(c.tier)))
    && (!cond.segment || c.segment === cond.segment) && heldCardIds.has(c.id));
  return true;
}
/** Best transfer ratio (partner units per point) to `partner` available on `date` for this wallet. */
export function bestRatio(catalog: Catalog, cur: Currency, partner: string, held: Set<string>, date: string): number {
  const ratios = cur.paths
    .filter(p => p.kind === 'transfer' && p.to === partner && p.ratio)
    .filter(p => (!p.effective_from || p.effective_from <= date) && (!p.effective_to || date <= p.effective_to))
    .filter(p => (p.requires ?? []).every(c => holds(catalog, held, c as any)))
    .map(p => { const [a, b] = p.ratio!.split(':').map(Number); return b / a; });
  return ratios.length ? Math.max(...ratios) : 0;
}

/** Intro earn from the holder's offers, as earn rules that end when the offer does. */
function withOfferEarn(t: Terms, wc: WalletCard, include: boolean): Terms {
  if (!include || !wc.offers?.length) return t;
  const extra = wc.offers.flatMap(o => o.components).filter(c => c.type === 'intro_earn').map((c, i) => ({
    id: `${t.card_id}/offer-${wc.id}-${i + 1}`, categories: c.categories ?? ['cat:all'], version: 1, release: '', applied_on: wc.opened_on,
    multiplier: c.multiplier, boost: c.boost, stacks: c.stacks, cap: c.cap, cap_period: 'calendar_year',
    effective_from: wc.opened_on, effective_to: addMonths(wc.opened_on, c.months ?? 12)
  }));
  return { ...t, earn_rules: [...t.earn_rules, ...extra] };
}

/**
 * The user's custom benefits (section 10): targeted offers and anything else the user values that the catalog
 * doesn't list. One attaches to the wallet card named by `wallet_card_id`, or else to every wallet card of its `card_id`.
 * The newest version in force on the evaluation date applies.
 */
function withCustomBenefits(t: Terms, wc: WalletCard, wallet: Wallet): Terms {
  const mine = (wallet.custom_benefits ?? []).filter(b => b.wallet_card_id ? b.wallet_card_id === wc.id : b.card_id === wc.card_id);
  if (!mine.length) return t;
  const extra: ResolvedBenefit[] = mine.flatMap(b => {
    const v = [...b.versions].sort((x, y) => y.version - x.version).find(x => !x.effective_from || x.effective_from <= t.as_of);
    return v ? [{ ...v, id: b.id, kind: b.kind, name: b.name, card_id: b.card_id, applied_on: wc.opened_on, period: v.period ?? { cadence: 'ongoing' }, grants: v.grants?.length ? v.grants : [{ entitlement: `custom:${b.id}`, combine: 'sum' as const }] }] : [];
  });
  return { ...t, benefits: [...t.benefits, ...extra] };
}

export function valueWallet(catalog: Catalog, wallet: Wallet, opts: Options, onlyCards?: string[]) {
  const asOf = opts.asOf;
  const horizonEnd = addMonths(asOf, opts.horizonMonths ?? wallet.finance?.horizon_months ?? 12);
  const cards = wallet.cards.filter(c => c.status !== 'closed' && (!onlyCards || onlyCards.includes(c.id)));
  const held = new Set(cards.map(c => c.card_id));
  const terms = new Map<string, Terms>(cards.map(c => [c.id, withCustomBenefits(withOfferEarn(resolveTerms(catalog, c.card_id, c, asOf), c, !!wallet.finance?.include_offers), c, wallet)]));
  // Finance assumptions (section 12) are inputs too: the user's own, then the app's value set. Without them the
  // engine applies no discounting, no devaluation and no holding period, and reports each one as missing.
  const f = wallet.finance ?? {}, vf = opts.values?.finance ?? {};
  const missingFinance = new Set<string>();
  const rIn = f.discount_rate ?? vf.discount_rate, holdIn = f.holding_period_months ?? vf.holding_period_months;
  if (rIn == null) missingFinance.add('discount_rate');
  if (holdIn == null) missingFinance.add('holding_period_months');
  const r = num(rIn, 0), years = (holdIn ?? 0) / 12;

  // Earn rules the user valued directly (section 10, earn_values) leave spend assignment; their value is the user's.
  const earnValues = wallet.earn_values ?? {};
  const directEarn: Record<string, Record<string, number>> = {};
  for (const wc of cards) {
    const t = terms.get(wc.id)!;
    directEarn[wc.id] = {};
    for (const rule of t.earn_rules) {
      const v = earnValues[rule.id];
      // Like a perk's personal value, an earn value is what the holder would prepay for the earn rate: not discounted again.
      if (v) directEarn[wc.id][rule.id] = v.personal_value.amount * (v.basis === 'annual' ? Math.pow(1 + r, -0.5) : 1);
    }
    terms.set(wc.id, { ...t, earn_rules: t.earn_rules.filter(rule => !earnValues[rule.id]) });
  }

  // Points: target cpp, adjusted for transfer ratios this wallet can reach, then discounted for devaluation and time.
  const cpp: Record<string, number> = {}, pv: Record<string, number> = {};
  const unvaluedCurrencies = new Set<string>();
  for (const cur of catalog.currencies) {
    // The user's own value wins; otherwise the newest catalog snapshot, preferring a benchmark over a floor on the same date.
    const rank: Record<string, number> = { realized: 0, target: 1, benchmark: 2, floor: 3 };
    const newest = (xs: { currency: string; cpp: string; as_of: string; method: string }[]) => xs.filter(v => v.currency === cur.id)
      .sort((a, b) => b.as_of.localeCompare(a.as_of) || (rank[a.method] ?? 9) - (rank[b.method] ?? 9))[0];
    // The user's own value wins; then the value set the app passed in; then the currency's fixed rate, if it has one.
    const snap = newest(wallet.valuations ?? []) ?? newest(opts.values?.valuations ?? []);
    const fallback = cur.kind === 'status_credit' ? 0 : num(cur.cents_per_point, 1);
    if (!snap && cur.cents_per_point == null && cur.kind !== 'status_credit') unvaluedCurrencies.add(cur.id);
    let c = num(snap?.cpp, fallback);
    for (const [key, share] of Object.entries(wallet.redemption_mix?.[cur.id] ?? {})) {
      const partner = key.replace(/^transfer:/, '');
      c *= 1 - Number(share) * (1 - Math.min(1, bestRatio(catalog, cur, partner, held, asOf)));
    }
    cpp[cur.id] = c;
    // Cash back and fixed-value points don't devalue by default; transferable and loyalty currencies lose 6% a year unless the user says otherwise.
    // Cash back and fixed-value points can't devalue; for other currencies the expected devaluation is an input.
    const fixed = cur.kind === 'cashback' || cur.kind === 'fixed_value';
    const dIn = f.devaluation?.[cur.id] ?? vf.devaluation?.[cur.id];
    if (dIn == null && !fixed) missingFinance.add(`devaluation:${cur.id}`);
    pv[cur.id] = Math.pow(1 - (fixed ? 0 : num(dIn, 0)), years) / Math.pow(1 + r, years);
  }

  // Earn: assign each category's spend to the best rule, honoring caps (section 13, step 3).
  const pointValue = (c: string) => (cpp[c] ?? 0) * (pv[c] ?? 1);
  const earnInput = { catalog, cards, terms, asOf, horizonEnd, spend: wallet.spend_profile?.amounts ?? {}, pointValue };
  const ctx = assignSpend(earnInput);
  const alloc: Assignment[] = ctx.rows;
  const earnBase = totalEarn(earnInput, alloc, ctx).value;

  // Then move spend onto cards whose spend thresholds the user wants, where the move costs least.
  const met: Record<string, boolean> = {}, shortfall: Record<string, number> = {};
  const wanted = cards.filter(c => wallet.goals?.spend_thresholds?.includes(c.id));
  for (const wc of wanted) {
    const t = terms.get(wc.id)!;
    const threshold = Math.max(0, ...t.benefits.filter(b => b.unlocked_only).flatMap(b => (b.conditions ?? []).filter(c => c.type === 'spend_gte').map(c => Number(c.amount))));
    let need = threshold - alloc.filter(a => a.wallet_card_id === wc.id).reduce((s, a) => s + a.amount, 0);
    const cands = alloc.filter(a => a.wallet_card_id !== wc.id && !wanted.some(w => w.id === a.wallet_card_id) && a.amount > 0)
      .map(a => ({ a, loss: a.value / a.amount - ctx.bestRate(wc, a.category) }))
      .sort((x, y) => x.loss - y.loss);
    const available = cands.reduce((sum, c) => sum + c.a.amount, 0);
    if (need > available) { met[wc.id] = false; shortfall[wc.id] = need - available; continue; }
    for (const { a } of cands) {
      if (need <= 0) break;
      const mv = Math.min(a.amount, need);
      const keep = (a.amount - mv) / a.amount;
      a.points *= keep; a.value *= keep; a.amount -= mv; need -= mv;
      const lane = ctx.lanes(a.category).find(l => l.wc.id === wc.id && l.fraction === 1);
      const currency = lane?.currency ?? findCard(catalog, wc.card_id).earns, points = (mv / 100) * (lane?.mult ?? 0);
      alloc.push({ category: a.category, wallet_card_id: wc.id, rule_id: lane?.rule.id ?? '', amount: mv, currency, points, value: points * pointValue(currency), moved_from: a.wallet_card_id });
    }
    met[wc.id] = need <= 0; shortfall[wc.id] = Math.max(0, need);
  }
  const earned = totalEarn(earnInput, alloc, assignSpend(earnInput));
  const directEarnTotal = Object.values(directEarn).flatMap(Object.values).reduce((s, x) => s + x, 0);
  const earn = earned.value + directEarnTotal;
  const earnBaseTotal = earnBase + directEarnTotal;

  // Benefits: expected present value over the horizon (section 12).
  const tvm = (cadence: string) => {
    const n = PERIODS[cadence] ?? 1;
    let s = 0;
    for (let k = 1; k <= n; k++) s += Math.pow(1 + r, -(k - 0.5) / n);
    return s / n;
  };
  const activeFraction = (b: ResolvedBenefit) => {
    if (b.enroll_by && b.enroll_by < asOf) return 0;
    const from = [b.effective_from ?? asOf, b.applied_on].sort().at(-1)!;
    const to = b.effective_to ?? '9999-12-31';
    if (b.period.cadence === 'once') return to >= asOf && from <= horizonEnd ? 1 : 0;
    const s = from > asOf ? from : asOf, e = to < horizonEnd ? to : horizonEnd;
    return Math.max(0, daysBetween(s, e) + (e === to ? 1 : 0)) / daysBetween(asOf, horizonEnd);
  };
  const defaults = opts.values?.benefit_values?.values ?? {};
  // Perks no one valued: counted at face value, or at zero when they have none (and reported).
  const unvalued: Record<string, 'face' | 'zero'> = {};
  // A credit's spend category comes from the entitlement registry (the purchases that use it).
  const spendCategory = (b: ResolvedBenefit) => b.grants.map(g => catalog.entitlement_types.find(t => t.id === g.entitlement)?.spend_category).find(Boolean);
  /**
   * Opportunity cost of using a credit (section 12): the purchase goes on this card instead of the wallet's best card
   * for its category, so the user gives up the difference in earn on the spend the credit covers. A credit whose
   * reimbursed purchases earn nothing (credited_spend_earns: false) gives up the best card's whole earn.
   */
  const opportunityCost = (wc: WalletCard, b: ResolvedBenefit, used: number) => {
    const cat = spendCategory(b);
    if (!cat) return 0;
    const best = ctx.lanes(cat).filter(l => l.fraction === 1)[0]?.value ?? 0;
    const mine = b.credited_spend_earns === false ? 0 : ctx.bestRate(wc, cat);
    return used * Math.max(0, best - mine);
  };
  const costs: Record<string, Record<string, number>> = {};
  const valueOf = (wc: WalletCard, b: ResolvedBenefit): number => {
    if (b.unlocked_only && !met[wc.id]) return 0;
    // The user's value for this benefit wins; then their answer for what it grants (one answer for every card's Resy
    // credit, say); then the default, which an inherited benefit takes from its base benefit (card-variants.md).
    const user = wallet.benefit_values?.[b.id] ?? b.grants.map(g => wallet.entitlement_values?.[g.entitlement]).find(Boolean);
    const def = defaults[b.id] ?? (b.based_on ? defaults[b.based_on] : undefined);
    if (b.kind === 'redemption_modifier' && !user?.personal_value) return 0;
    const frac = activeFraction(b);
    if (!frac) return 0;
    // A personal value is what the holder would prepay for the perk on the fee date (section 11): already a present
    // value that reflects their own effort and trade-offs, so it is used as is, unless given as an annual amount.
    const prepay = (v: { personal_value?: { amount: number }; basis?: string }) => v.personal_value!.amount * frac * (v.basis === 'annual' ? tvm(b.period.cadence) : 1);
    if (user?.personal_value) return prepay(user);
    if (def?.personal_value && !user?.usage_probability) return prepay(def);
    let base: number;
    if (!user && !def && b.kind !== 'anniversary') unvalued[b.id] = b.face_value ? 'face' : 'zero';
    if (b.face_value) {
      // Derived from the terms: face value times the share used, less the earn given up on the spend it takes.
      const annual = b.period.cadence === 'every_n_years' ? b.face_value.amount / (b.period.n ?? 1) : b.face_value.amount;
      const used = annual * num(user?.usage_probability ?? def?.usage_probability, 1);
      const cost = opportunityCost(wc, b, used);
      (costs[wc.id] ??= {})[b.id] = cost * frac * tvm(b.period.cadence);
      base = Math.max(0, used - cost);
    }
    // A reward paid in points each card year (anniversary miles, bonus points) is worth those points at this
    // wallet's value for the currency, like points earned on spend, times the chance it's used.
    else if (b.kind === 'anniversary' && b.reward?.points) base = b.reward.points * pointValue(b.reward.currency) * num(user?.usage_probability ?? def?.usage_probability, 1);
    else base = 0;
    return base * frac * tvm(b.period.cadence);
  };
  const parts: Part[] = [];
  const benefitValues: Record<string, Record<string, number>> = {};
  for (const wc of cards) {
    benefitValues[wc.id] = {};
    for (const b of terms.get(wc.id)!.benefits) {
      const v = valueOf(wc, b);
      benefitValues[wc.id][b.id] = v;
      for (const g of b.grants) parts.push({ entitlement: g.entitlement, rule: g.combine, value: v * num(g.value_share, 1 / b.grants.length), benefit_id: b.id, wallet_card_id: wc.id });
    }
  }
  const groups = new Map<string, Part[]>();
  for (const p of parts) groups.set(p.entitlement, [...(groups.get(p.entitlement) ?? []), p]);
  let benefits = 0, naive = 0;
  for (const g of groups.values()) {
    g.sort((a, b) => b.value - a.value);
    const keep = g[0].rule === 'sum' ? g.length : g[0].rule === 'once_per_beneficiary' ? wallet.people.length : 1;
    g.forEach((p, i) => { p.counted = i < keep; naive += p.value; if (p.counted) benefits += p.value; });
  }

  // Fees: the annual fee that posts in the horizon, under the terms in force on that date.
  // Offers (Appendix F): only those the user recorded on a wallet card, and only when year-one value is asked for.
  const welcome: Record<string, number> = {};
  if (f.include_offers) for (const wc of cards) for (const o of wc.offers ?? []) for (const c of o.components) {
    if (c.type !== 'bonus' || o.earned_on && o.earned_on < asOf || wc.opened_on > horizonEnd || addMonths(wc.opened_on, 12) < asOf) continue;
    const reward = c.reward ?? c.reward_max;
    welcome[wc.id] = (welcome[wc.id] ?? 0) + (reward?.points ? reward.points * (cpp[reward.currency] ?? 0) * (pv[reward.currency] ?? 1) : 0) + (c.reward_cash?.amount ?? 0);
  }
  const welcomeTotal = Object.values(welcome).reduce((s, x) => s + x, 0);

  const fees = cards.reduce((s, wc) => {
    const due = wc.opened_on >= asOf ? wc.opened_on : nextRenewal(wc, asOf);
    if (due > horizonEnd) return s;
    const t = resolveTerms(catalog, wc.card_id, wc, due);
    // What the user recorded paying on that date wins over the catalog fee (a waiver, a retention offer).
    const paid = wc.fee_paid?.find(x => x.date === due);
    if (paid) return s + paid.amount.amount;
    // A fee waiver from the holder's offer covers the fee that starts a waived card year.
    const year = Math.round(daysBetween(wc.opened_on, due) / 365.25) + 1;
    const waiver = f.include_offers ? (wc.offers ?? []).flatMap(o => o.components).find(c => c.type === 'fee_waiver' && c.fee === 'fee:annual' && c.card_years?.includes(year)) : undefined;
    return s + (waiver?.amount ? waiver.amount.amount : t.fees.annual?.amount ?? 0);
  }, 0);

  const round = (x: number) => Math.round(x);
  return {
    as_of: asOf, horizon_end: horizonEnd,
    net: round(benefits + earn + welcomeTotal - fees),
    offers: round(welcomeTotal),
    benefits: round(benefits), earn: round(earn), fees: round(fees),
    double_count_removed: round(naive - benefits),
    threshold_cost: round(earnBaseTotal - earn), thresholds_met: met, threshold_shortfall: shortfall,
    cpp_today: Object.fromEntries(Object.entries(cpp).map(([k, v]) => [k, Number((v * pv[k]).toFixed(4))])),
    cards: cards.map(wc => ({
      wallet_card_id: wc.id, card_id: wc.card_id,
      counted: round(parts.filter(p => p.wallet_card_id === wc.id && p.counted).reduce((s, p) => s + p.value, 0)),
      offers: round(welcome[wc.id] ?? 0),
      benefits: Object.fromEntries(Object.entries(benefitValues[wc.id]).map(([k, v]) => [k, round(v)])),
      earn_valued: Object.fromEntries(Object.entries(directEarn[wc.id]).map(([k, v]) => [k, round(v)])),
      // Earn given up by putting each credit's spend on this card instead of the wallet's best card for it.
      opportunity_cost: Object.fromEntries(Object.entries(costs[wc.id] ?? {}).filter(([, v]) => v > 0).map(([k, v]) => [k, round(v)]))
    })),
    // What no one valued, so an app can ask: perks counted at face value or at zero, and currencies at 1 cent.
    unvalued: {
      benefits: Object.entries(unvalued).filter(([id]) => cards.some(wc => terms.get(wc.id)!.benefits.some(b => b.id === id))).map(([id, as]) => ({ id, counted_at: as })),
      currencies: [...unvaluedCurrencies].filter(c => (earned.points[c] ?? 0) > 0),
      // Finance assumptions no one supplied; devaluation only for currencies this wallet earns.
      finance: [...missingFinance].filter(m => !m.startsWith('devaluation:') || (earned.points[m.slice(12)] ?? 0) > 0)
    },
    // Per-entitlement totals after combining, so callers can see what each overlap group is worth (used by valueAdded).
    entitlements: Object.fromEntries([...groups.entries()].map(([k, g]) => [k, g.filter(p => p.counted).reduce((s, p) => s + p.value, 0)])),
    parts: parts.map(p => ({ ...p })),
    overlaps: [...groups.entries()].filter(([, g]) => g.filter(p => p.value > 0).length > 1)
      .map(([entitlement, g]) => ({ entitlement, rule: g[0].rule, parts: g.map(p => ({ benefit_id: p.benefit_id, value: round(p.value), counted: p.counted })) })),
    points_earned: Object.fromEntries(Object.entries(earned.points).map(([k, v]) => [k, Math.round(v)])),
    allocation: alloc.filter(a => a.amount > 0).map(a => ({ ...a, points: Math.round(a.points), value: round(a.value) }))
  };
}

/**
 * What adding each candidate card to a wallet is worth: W(wallet + card) − W(wallet) (section 13).
 * The wallet is the set of cards the user will keep anyway; candidates are cards held or considered.
 * Each benefit's `added` value is its share of the change in its overlap groups, so a perk the kept
 * cards already provide shows as zero, and a better version of it shows only the improvement.
 */
export function valueAdded(catalog: Catalog, wallet: Wallet, candidates: WalletCard[], opts: Options) {
  const base = valueWallet(catalog, wallet, opts);
  return candidates.map(c => {
    const withCard = { ...wallet, cards: [...wallet.cards.filter(x => x.id !== c.id), c] };
    const w = valueWallet(catalog, withCard, opts);
    const mine = w.cards.find(x => x.wallet_card_id === c.id)!;
    // Adding a card can change what the other cards' perks are worth, such as raising the earn a credit gives up.
    // So each overlap group's change splits in two: the other cards re-valued in the new wallet, combined as if this
    // card weren't there, against the base (their change); and this card's addition on top of that (its own).
    const added: Record<string, number> = {};
    let others = 0;
    for (const [ent, total] of Object.entries(w.entitlements)) {
      const group = w.parts.filter(p => p.entitlement === ent);
      const theirs = group.filter(p => p.wallet_card_id !== c.id).map(p => p.value).sort((a, b) => b - a);
      const rule = group[0]?.rule;
      const keep = rule === 'sum' ? theirs.length : rule === 'once_per_beneficiary' ? wallet.people.length : 1;
      const without = theirs.slice(0, keep).reduce((s, v) => s + v, 0);
      others += without - (base.entitlements[ent] ?? 0);
      const delta = total - without;
      const parts = group.filter(p => p.wallet_card_id === c.id);
      const sum = parts.reduce((s, p) => s + p.value, 0);
      for (const p of parts) added[p.benefit_id] = (added[p.benefit_id] ?? 0) + (sum ? delta * p.value / sum : delta / parts.length);
    }
    // Groups only the base had (none here, since adding a card removes nothing) would also count toward others.
    for (const [ent, t] of Object.entries(base.entitlements)) if (!(ent in w.entitlements)) others -= t;
    const round = (x: number) => Math.round(x);
    return {
      wallet_card_id: c.id, card_id: c.card_id,
      added: w.net - base.net, benefits: w.benefits - base.benefits, earn: w.earn - base.earn, fees: w.fees - base.fees,
      standalone: mine.benefits,
      added_by_benefit: Object.fromEntries(Object.keys(mine.benefits).map(id => [id, round(added[id] ?? 0)])),
      /** The change in the other cards' perk values from adding this card (usually negative: costlier credits). */
      other_cards: round(others),
      opportunity_cost: mine.opportunity_cost,
      earn_valued: mine.earn_valued
    };
  });
}
/** W(wallet) − W(wallet without each card): what each card adds (section 13). */
export function marginalValues(catalog: Catalog, wallet: Wallet, opts: Options) {
  const all = wallet.cards.filter(c => c.status !== 'closed').map(c => c.id);
  const full = valueWallet(catalog, wallet, opts).net;
  return Object.fromEntries(all.map(id => [id, full - valueWallet(catalog, wallet, opts, all.filter(x => x !== id)).net]));
}
