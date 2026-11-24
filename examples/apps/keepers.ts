// Which cards are keepers? A worked example of an app built on OCCB.
//
// Spreadsheets that help people decide which premium cards to keep list each card's perks, ask the user what
// each perk is worth to them, and compare the total with the annual fee. Their standing advice is to value a
// perk only for what it adds beyond the cards you keep anyway: if a card you keep already reimburses Global
// Entry, a second card's Global Entry credit is worth nothing to you. This app does that from catalog data:
//
// 1. Start with the cards the user says they keep no matter what (--keep).
// 2. Value every other held card by what it adds to that set (valueAdded), perk by perk, and keep the
//    card that adds the most net of its fee. Repeat until no remaining card pays for itself.
// 3. Print one sheet per card: each perk's value on its own, what it adds given the keepers, and why.
// 4. Perk values are personal and come from a value set the app chooses (here, examples/value-sets), each with a range (low, high). Value each card again with its perks
//    the user hasn't valued at the low and at the high end. A card that pays for itself either way is a keeper;
//    one that never does is a cancel; the rest depend on the user, and the sheet lists the perks to ask about.
//
// Run: node examples/apps/keepers.ts examples/keepers.json [--keep <wallet card id>]... [--as-of YYYY-MM-DD] [--values <value set folder>]
import fs from 'node:fs';
import { valueAdded, resolveTerms, describeEarnRule, money } from '../../src/index.ts';
import type { Catalog, Wallet, WalletCard, ValueSet } from '../../src/index.ts';
import { loadCatalog, loadValueSet } from '../../tools/load.mjs';

export interface Sheet {
  wallet_card_id: string; card_id: string; name: string; fee: number; added: number; verdict: 'keep' | 'cancel' | 'depends on you'; forced: boolean;
  /** What the card adds after its fee if the perks the user hasn't valued are worth their low or their high end. */
  range: { low: number; high: number };
  /** The perks whose value most decides the verdict, widest range first: what to ask the user. */
  questions: { id: string; label: string; entitlement?: string; low: number; high: number }[];
  rows: { id: string; label: string; standalone: number; added: number; note?: string }[];
  /** Earn given up by putting its credits' spend on this card instead of the best card for it (already deducted). */
  opportunity_cost: number;
  /** How adding this card changes the other cards' perk values, such as making their credits costlier to use. */
  other_cards: number;
  unlocks: string[];
}

/** Choose keepers greedily, then describe each held card against the final keeper set. */
export function keepers(catalog: Catalog, wallet: Wallet, opts: { asOf: string; keep?: string[]; values?: ValueSet }) {
  const held = wallet.cards.filter(c => c.status !== 'closed');
  const kept = new Set(opts.keep ?? []);
  const base = (ids: Set<string>): Wallet => ({ ...wallet, cards: held.filter(c => ids.has(c.id)) });
  for (;;) {
    const rest = held.filter(c => !kept.has(c.id));
    if (!rest.length) break;
    const best = valueAdded(catalog, base(kept), rest, opts).sort((a, b) => b.added - a.added)[0];
    if (best.added <= 0) break;
    kept.add(best.wallet_card_id);
  }
  // Each card's sheet: what it adds to the other keepers (for a keeper) or to all keepers (for the rest).
  const sheets: Sheet[] = held.map(wc => {
    const others = new Set([...kept].filter(id => id !== wc.id));
    const r = valueAdded(catalog, base(others), [wc], opts)[0];
    const s = sheet(catalog, wallet, wc, r, kept.has(wc.id), (opts.keep ?? []).includes(wc.id), opts.asOf, opts.values);
    // The same card with its unvalued perks at the low end, then at the high end of their ranges.
    const ranged = unvalued(catalog, wallet, wc, opts);
    const at = (end: 'low' | 'high') => {
      const benefit_values = { ...wallet.benefit_values, ...Object.fromEntries(ranged.map(p => [p.id, { personal_value: { amount: p[end], currency: 'USD' } }])) };
      return valueAdded(catalog, { ...base(others), benefit_values }, [wc], opts)[0].added;
    };
    s.range = ranged.length ? { low: at('low'), high: at('high') } : { low: r.added, high: r.added };
    if (!s.forced) s.verdict = s.range.low > 0 ? 'keep' : s.range.high <= 0 ? 'cancel' : 'depends on you';
    s.questions = ranged.filter(p => p.high > p.low).sort((a, b) => (b.high - b.low) - (a.high - a.low)).slice(0, 5)
      .map(p => ({ id: p.id, label: s.rows.find(x => x.id === p.id)?.label ?? p.id, entitlement: p.entitlement, low: p.low, high: p.high }));
    return s;
  });
  return { kept: [...kept], sheets };
}

/** This card's perks that have a default range and no value from the user, by benefit or by entitlement. */
function unvalued(catalog: Catalog, wallet: Wallet, wc: WalletCard, opts: { asOf: string; values?: ValueSet }) {
  const defaults = opts.values?.benefit_values?.values ?? {};
  return resolveTerms(catalog, wc.card_id, wc, opts.asOf).benefits.flatMap(b => {
    const def = defaults[b.id] ?? (b.based_on ? defaults[b.based_on] : undefined);
    if (!def?.low || !def.high || wallet.benefit_values?.[b.id] || b.grants.some(g => wallet.entitlement_values?.[g.entitlement])) return [];
    return [{ id: b.id, entitlement: b.grants[0]?.entitlement, low: def.low.amount, high: def.high.amount }];
  });
}

function sheet(catalog: Catalog, wallet: Wallet, wc: WalletCard, r: ReturnType<typeof valueAdded>[number], keep: boolean, forced: boolean, asOf: string, values?: ValueSet): Sheet {
  const card = catalog.cards.find(c => c.id === wc.card_id)!;
  const terms = resolveTerms(catalog, wc.card_id, wc, asOf);
  const name = (id: string) => terms.benefits.find(b => b.id === id)?.name ?? wallet.custom_benefits?.find(b => b.id === id)?.name ?? id;
  const note = (id: string) => wallet.benefit_values?.[id]?.note ?? values?.benefit_values?.values[id]?.note;
  const rows: Sheet['rows'] = Object.keys(r.standalone).map(id => ({ id, label: name(id), standalone: r.standalone[id], added: r.added_by_benefit[id], note: note(id) }));
  for (const [id, v] of Object.entries(r.earn_valued)) {
    const rule = terms.earn_rules.find(e => e.id === id);
    rows.push({ id, label: rule ? describeEarnRule(catalog, card.earns, rule) : id, standalone: v, added: v, note: wallet.earn_values?.[id]?.note });
  }
  // Earn from the spend profile, net of what the keepers would have earned on the same spend.
  const earnFromSpend = r.earn - Object.values(r.earn_valued).reduce((s, v) => s + v, 0);
  if (earnFromSpend) rows.push({ id: `${wc.card_id}#earn`, label: 'Points: earn on your spend, and what its points options add to your balances', standalone: earnFromSpend, added: earnFromSpend });
  rows.sort((a, b) => b.added - a.added || b.standalone - a.standalone);
  const unlocks = ((catalogCurrent(catalog, wc.card_id)) ?? []).map((u: any) => `${u.currency} ${u.kind}${u.partners ? ` to ${u.partners.length} partners` : ''}`);
  const opportunity_cost = Object.values(r.opportunity_cost ?? {}).reduce((s, v) => s + v, 0);
  return { wallet_card_id: wc.id, card_id: wc.card_id, name: card.name ?? wc.card_id, fee: -r.fees, added: r.added, verdict: keep ? 'keep' : 'cancel', forced, range: { low: r.added, high: r.added }, questions: [], rows, opportunity_cost, other_cards: r.other_cards, unlocks };
}

// The published card file carries `unlocks` in `current`; the YAML-loaded catalog doesn't, so derive it lazily.
function catalogCurrent(catalog: Catalog, cardId: string) {
  try { return JSON.parse(fs.readFileSync(new URL(`../../dist/cards/${cardId}.json`, import.meta.url), 'utf8')).current?.unlocks; } catch { return undefined; }
}

const dollars = (cents: number) => money({ amount: Math.round(cents), currency: 'USD' });

export function render(result: ReturnType<typeof keepers>): string {
  // Break-even: how much the perks the user hasn't valued must be worth to them for the card to pay for itself,
  // next to what a typical holder gets from those perks.
  const needs = (s: Sheet) => Math.max(0, -s.range.low), typical = (s: Sheet) => s.added - s.range.low;
  const out = ['# Which cards are keepers?', '', 'Perk values are personal. "Adds" uses typical values. "Needs" is how much the card\'s perks that you haven\'t valued yet must be worth to you for it to pay for itself.', '',
    '| Card | Annual fee | Adds (after fee) | Needs from its perks | Verdict |', '| --- | ---: | ---: | --- | --- |'];
  for (const s of [...result.sheets].sort((a, b) => b.added - a.added)) {
    const need = s.range.low === s.range.high ? 'no ranges yet' : `${dollars(needs(s))} (typical ${dollars(typical(s))})`;
    out.push(`| ${s.name} | ${dollars(-s.fee)} | ${dollars(s.added)} | ${need} | ${s.verdict}${s.forced ? ' (your pick)' : ''} |`);
  }
  for (const s of result.sheets) {
    out.push('', `## ${s.name}`, '', `Annual fee ${dollars(-s.fee)}. Adds ${dollars(s.added)} a year after its fee with typical values, beyond your other keepers.`);
    if (s.opportunity_cost) out.push(`Perk values are what you'd prepay for them on the fee date, after ${dollars(s.opportunity_cost)} of points you'd give up by paying with this card instead of your best card for each credit's purchases.`);
    if (Math.abs(s.other_cards) >= 100) out.push(`Holding it changes your other cards' perks by ${dollars(s.other_cards)}.`);
    if (s.range.low !== s.range.high) out.push(needs(s) ? `It pays for itself if the perks below that you haven't valued are worth at least ${dollars(needs(s))} a year to you; a typical holder gets ${dollars(typical(s))} from them.` : 'It pays for itself even if the perks you haven\'t valued are worth nothing to you.');
    if (s.verdict === 'depends on you' && s.questions.length) {
      out.push('', 'It depends most on what these are worth to you (one answer per perk type covers every card that has it):', '');
      for (const q of s.questions) out.push(`- ${q.label}: anywhere from ${dollars(q.low)} to ${dollars(q.high)}${q.entitlement ? ` (\`${q.entitlement}\`)` : ''}`);
    }
    out.push('', '| Perk | On its own | Adds | Note |', '| --- | ---: | ---: | --- |');
    for (const r of s.rows.filter(r => r.standalone || r.added)) out.push(`| ${r.label} | ${dollars(r.standalone)} | ${dollars(r.added)} | ${r.note ?? ''} |`);
    if (s.unlocks.length) out.push('', `Opens: ${s.unlocks.join('; ')} (counted in points values).`);
  }
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const keep = args.flatMap((a, i) => a === '--keep' ? [args[i + 1]] : []);
  const asOf = args[args.indexOf('--as-of') + 1] && args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : new Date().toISOString().slice(0, 10);
  const wallet = JSON.parse(fs.readFileSync(file!, 'utf8'));
  // The app chooses whose values to start from; this example uses the example value set unless told otherwise.
  const values = loadValueSet(args.includes('--values') ? args[args.indexOf('--values') + 1] : undefined);
  process.stdout.write(render(keepers(loadCatalog() as any, wallet, { asOf, keep, values })));
}
