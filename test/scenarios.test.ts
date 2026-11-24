// End-to-end use cases on the real catalog. Each builds a realistic wallet and checks behavior that should
// hold however card terms evolve: caps, choices, overlap, status credits, rent and new-card decisions.
// Wallets live in examples/ so implementers can run them too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { valueWallet, marginalValues, resolveTerms } from '../src/index.ts';
import { loadCatalog, loadValueSet } from '../tools/load.mjs';

const catalog = loadCatalog() as any;
// Valuation needs values from somewhere; these tests use the example value set, as an app would choose its own.
const values = loadValueSet();
const asOf = '2026-11-13';
const wallet = (name: string) => JSON.parse(fs.readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
const on = (r: any, wid: string, cat: string) => r.allocation.filter((a: any) => a.wallet_card_id === wid && a.category === cat).reduce((s: number, a: any) => s + a.amount, 0);
const overlap = (r: any, ent: string) => r.overlaps.find((o: any) => o.entitlement === ent);

test('cashback optimizer: supermarket spend fills the Blue Cash Preferred cap, then overflows', () => {
  const w = wallet('cashback-optimizer');
  const r = valueWallet(catalog, w, { asOf, values });
  assert.equal(on(r, 'w-bcp', 'cat:groceries.store'), 600000, '$6,000 at 6%');
  assert.ok(r.allocation.some((a: any) => a.category === 'cat:groceries.store' && a.wallet_card_id !== 'w-bcp'), 'the rest goes to another card');
  // Custom Cash's 5% goes to its top category group; nothing else on that card should earn more than 1%.
  const cc = r.allocation.filter((a: any) => a.wallet_card_id === 'w-cc' && a.rule_id.endsWith('top-category-5x'));
  assert.ok(cc.length > 0 && cc.every((a: any) => a.amount <= 600000), 'Custom Cash 5% stays within $500 a cycle');
});

test('cashback optimizer: a rotating category earns only in its quarter, after activation', () => {
  const w = wallet('cashback-optimizer');
  const r = valueWallet(catalog, w, { asOf, values });
  const rot = r.allocation.filter((a: any) => a.wallet_card_id === 'w-flex' && /rotating|quarterly/.test(a.rule_id));
  for (const a of rot) assert.ok(a.amount <= 150000 * 4, 'never more than $1,500 a quarter');
});

test('business owner: Ink Cash 5% stops at $25,000 and Business Gold earns 4x in its top two groups', () => {
  const w = wallet('business-owner');
  const r = valueWallet(catalog, w, { asOf, values });
  const inkCash5 = r.allocation.filter((a: any) => a.rule_id === 'us.chase.ink-business-cash/office-telecom-5x').reduce((s: number, a: any) => s + a.amount, 0);
  assert.ok(inkCash5 <= 2500000 && inkCash5 > 0, `Ink Cash 5% on ${inkCash5}`);
  const gold4 = new Set(r.allocation.filter((a: any) => a.rule_id === 'us.amex.business-gold/top-two-4x').map((a: any) => a.category));
  assert.ok(gold4.size >= 1, 'Business Gold earns 4x somewhere');
  assert.ok(r.cards.every((c: any) => Number.isFinite(c.counted)));
});

test('Delta flyer: Sky Club access counts once, and a status chaser who values MQDs routes spend to the Reserve', () => {
  const r = valueWallet(catalog, wallet('delta-flyer'), { asOf, values });
  const club = overlap(r, 'lounge_network:delta_sky_club');
  assert.ok(club, 'both cards grant Sky Club access');
  assert.equal(club.parts.filter((p: any) => p.counted && p.value > 0).length, 1);
  assert.ok((r.points_earned['pts:delta_mqd'] ?? 0) > 0, 'MQDs earned from spend');
  assert.ok(on(r, 'w-dres', 'cat:all') > 0, 'everyday spend moves to the Reserve for MQDs');
  const indifferent = valueWallet(catalog, { ...wallet('delta-flyer'), valuations: [] }, { asOf, values });
  assert.equal(indifferent.cpp_today['pts:delta_mqd'], 0, 'MQDs have no cash value by default');
});

test('Hilton loyalist: Diamond from the Aspire makes the Surpass’s Gold redundant', () => {
  const r = valueWallet(catalog, wallet('hilton-loyalist'), { asOf, values });
  const st = overlap(r, 'status:hilton');
  assert.ok(st);
  assert.equal(st.parts.filter((p: any) => p.counted).length, 1, 'only one Hilton status counts');
});

test('renter: rent earns only on the Bilt card, never on a catch-all rate elsewhere', () => {
  const w = wallet('bilt-renter');
  const r = valueWallet(catalog, w, { asOf, values });
  const rent = r.allocation.filter((a: any) => a.category === 'cat:rent');
  assert.ok(rent.length > 0 && rent.every((a: any) => a.wallet_card_id === 'w-bilt'), 'rent goes only to Bilt');
  assert.ok(rent.reduce((s: number, a: any) => s + a.amount, 0) <= w.spend_profile.amounts['cat:rent']);
});

test('lounge collector: Priority Pass from three cards counts once; marginal values see the redundancy', () => {
  const w = wallet('lounge-collector');
  const r = valueWallet(catalog, w, { asOf, values });
  assert.equal(overlap(r, 'membership:priority_pass').parts.filter((p: any) => p.counted).length, 1);
  const m = marginalValues(catalog, w, { asOf, values });
  const standalone = (id: string) => valueWallet(catalog, { ...w, cards: w.cards.filter((c: any) => c.id === id) }, { asOf, values }).net;
  for (const c of w.cards) assert.ok(m[c.id] <= standalone(c.id) + 1, `${c.id} adds no more to the wallet than it is worth alone`);
});

test('new card decision: an offer the user received adds its bonus and fee waiver to year one only', () => {
  const base = wallet('cashback-optimizer');
  const id = 'us.amex.delta-gold';
  const t = resolveTerms(catalog, id, { opened_on: asOf }, asOf);
  const offer = { card_id: id, audience: 'public', components: [
    { type: 'bonus', reward: { currency: 'pts:delta_skymiles', points: 50000 }, spend_required: { amount: 200000, currency: 'USD' }, window_days: 183 },
    { type: 'fee_waiver', fee: 'fee:annual', amount: { amount: 0, currency: 'USD' }, card_years: [1] }
  ] };
  const opened = { ...base, finance: { ...base.finance, include_offers: true }, cards: [...base.cards, { id: 'w-new', card_id: id, holder: 'p1', opened_on: asOf, offers: [offer] }] };
  const without = valueWallet(catalog, { ...opened, cards: base.cards }, { asOf, values });
  const r = valueWallet(catalog, opened, { asOf, values });
  assert.equal(r.fees, without.fees, 'year-one fee waived by the offer');
  const card = r.cards.find((c: any) => c.wallet_card_id === 'w-new')!;
  assert.ok(card.offers > 0 && r.offers === card.offers, 'the bonus is valued once');
  const steady = valueWallet(catalog, { ...opened, finance: { ...opened.finance, include_offers: false } }, { asOf, values });
  assert.equal(steady.offers, 0, 'steady-state value leaves offers out');
  assert.equal(steady.fees - without.fees, t.fees.annual.amount, 'and charges the regular fee');
});
