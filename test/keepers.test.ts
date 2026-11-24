// The keepers use case (docs/pressure-tests/keepers.md): what a card adds beyond the cards a user keeps anyway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { valueWallet, valueAdded } from '../src/index.ts';
import { loadCatalog, loadValueSet } from '../tools/load.mjs';
import { keepers, render } from '../examples/apps/keepers.ts';

const catalog = loadCatalog() as any;
// Valuation needs values from somewhere; these tests use the example value set, as an app would choose its own.
const values = loadValueSet();
const asOf = '2026-11-13';
const wc = (id: string, card_id: string) => ({ id, card_id, holder: 'p1', opened_on: '2024-01-15', status: 'open' as const });
const wallet = (cards: ReturnType<typeof wc>[], extra: object = {}): any => ({ occb: '0.3', people: [{ id: 'p1' }], cards, ...extra });

test('a perk the kept cards already give adds nothing; the rest adds its full value', () => {
  const [plat] = valueAdded(catalog, wallet([wc('csr', 'us.chase.sapphire-reserve')]), [wc('plat', 'us.amex.platinum')], { asOf, values });
  assert.equal(plat.added_by_benefit['us.amex.platinum/priority-pass'], 0);
  assert.equal(plat.added_by_benefit['us.amex.platinum/trusted-traveler'], 0);
  assert.equal(plat.added_by_benefit['us.amex.platinum/hotel-credit'], plat.standalone['us.amex.platinum/hotel-credit']);
  assert.ok(plat.standalone['us.amex.platinum/priority-pass'] > 0);
});

test('per-benefit added values and the effect on other cards sum to the change in wallet benefits', () => {
  const base = wallet([wc('csr', 'us.chase.sapphire-reserve'), wc('quest', 'us.chase.united-quest')]);
  for (const r of valueAdded(catalog, base, [wc('plat', 'us.amex.platinum'), wc('explorer', 'us.chase.united-explorer')], { asOf, values })) {
    const sum = Object.values(r.added_by_benefit).reduce((s, v) => s + v, 0) + r.other_cards;
    assert.ok(Math.abs(sum - r.benefits) <= Object.keys(r.added_by_benefit).length + 1, `${r.card_id}: ${sum} vs ${r.benefits}`);
  }
});

test('valueAdded on an empty base equals the card on its own', () => {
  const [r] = valueAdded(catalog, wallet([]), [wc('gold', 'us.amex.gold')], { asOf, values });
  assert.equal(r.added, valueWallet(catalog, wallet([wc('gold', 'us.amex.gold')]), { asOf, values }).net);
});

test('United cardmember perks count once across Quest and Explorer, and stay separate from Delta TakeOff 15', () => {
  const r = valueWallet(catalog, wallet([wc('q', 'us.chase.united-quest'), wc('e', 'us.chase.united-explorer'), wc('d', 'us.amex.delta-gold')]), { asOf, values });
  const parts = (e: string) => r.parts.filter(p => p.entitlement === e);
  assert.equal(parts('program:reduced_award_pricing_united').length, 2);
  assert.equal(parts('program:reduced_award_pricing_united').filter(p => p.counted).length, 1);
  assert.equal(parts('program:reduced_award_pricing_delta').filter(p => p.counted).length, 1);
});

test('a card that waives the first and second Delta bag counts both', () => {
  const r = valueWallet(catalog, wallet([wc('d', 'us.amex.delta-reserve')]), { asOf, values });
  const b = r.cards[0].benefits;
  assert.ok(r.cards[0].counted >= b['us.amex.delta-reserve/first-checked-bag'] + b['us.amex.delta-reserve/second-checked-bag']);
  assert.equal(r.overlaps.find(o => o.entitlement.startsWith('fee_waiver:checked_bag_delta')), undefined);
});

test('a benefit that grants two entitlements is not counted twice', () => {
  const r = valueWallet(catalog, wallet([wc('vx', 'us.capitalone.venture-x')]), { asOf, values });
  const lounges = r.cards[0].benefits['us.capitalone.venture-x/capital-one-lounges'];
  const counted = r.parts.filter(p => p.benefit_id === 'us.capitalone.venture-x/capital-one-lounges').reduce((s, p) => s + p.value, 0);
  assert.ok(Math.abs(counted - lounges) < 1);
});

test('an earn rule valued directly leaves spend assignment and counts the user value', () => {
  const spend = { spend_profile: { amounts: { 'cat:dining': 1000000 } } };
  const valued = { earn_values: { 'us.amex.gold/dining-4x': { personal_value: { amount: 15000, currency: 'USD' }, basis: 'present_value' } } };
  const a = valueWallet(catalog, wallet([wc('g', 'us.amex.gold')], spend), { asOf, values });
  const b = valueWallet(catalog, wallet([wc('g', 'us.amex.gold')], { ...spend, ...valued }), { asOf, values });
  assert.equal(b.cards[0].earn_valued['us.amex.gold/dining-4x'], 15000);
  assert.ok(!b.allocation.some(x => x.rule_id === 'us.amex.gold/dining-4x'));
  assert.notEqual(a.earn, b.earn);
});

test('a personal value is what the holder would prepay: used as is, and discounted only when given as annual', () => {
  const v = (basis?: string) => valueWallet(catalog, wallet([wc('g', 'us.amex.gold')], { benefit_values: { 'us.amex.gold/resy-credit': { personal_value: { amount: 10000, currency: 'USD' }, ...(basis ? { basis } : {}) } } }), { asOf, values }).cards[0].benefits['us.amex.gold/resy-credit'];
  assert.equal(v(), 10000);
  assert.equal(v('present_value'), 10000);
  assert.ok(v('annual') < 10000 && v('annual') > 9700);
});

test('using a credit costs the earn given up by putting its spend on that card', () => {
  // The Platinum earns 1x at restaurants; with a Gold (4x) in the wallet, Resy spend on the Platinum gives up 3x.
  const alone = valueWallet(catalog, wallet([wc('p', 'us.amex.platinum')]), { asOf, values }).cards[0];
  const withGold = valueWallet(catalog, wallet([wc('p', 'us.amex.platinum'), wc('g', 'us.amex.gold')]), { asOf, values }).cards[0];
  assert.ok(withGold.opportunity_cost['us.amex.platinum/resy-credit'] > (alone.opportunity_cost['us.amex.platinum/resy-credit'] ?? 0));
  assert.ok(withGold.benefits['us.amex.platinum/resy-credit'] < alone.benefits['us.amex.platinum/resy-credit']);
  // The Reserve's travel credit covers purchases that earn nothing, so it gives up the card's own travel earn too.
  const csr = valueWallet(catalog, wallet([wc('r', 'us.chase.sapphire-reserve')]), { asOf, values }).cards[0];
  assert.ok(csr.opportunity_cost['us.chase.sapphire-reserve/travel-credit'] > 0);
});

test('custom benefits are valued on the wallet card they name', () => {
  const custom = { custom_benefits: [{ id: 'us.amex.gold/user-extra', card_id: 'us.amex.gold', wallet_card_id: 'g', scope: 'user', kind: 'other', name: 'Extra', versions: [{ version: 1, change_type: 'added', face_value: { amount: 5000, currency: 'USD' }, period: { cadence: 'annual' } }] }] };
  const r = valueWallet(catalog, wallet([wc('g', 'us.amex.gold'), wc('g2', 'us.amex.gold')], custom), { asOf, values });
  assert.ok(r.cards[0].benefits['us.amex.gold/user-extra'] > 4800);
  assert.equal(r.cards[1].benefits['us.amex.gold/user-extra'], undefined);
});

test('the example keepers app runs on the example document', () => {
  const doc = JSON.parse(fs.readFileSync(new URL('../examples/keepers.json', import.meta.url), 'utf8'));
  const result = keepers(catalog, doc, { asOf, keep: ['w-csr'], values });
  assert.ok(result.kept.includes('w-csr'));
  assert.equal(result.sheets.length, doc.cards.length);
  assert.match(render(result), /Which cards are keepers/);
});

test('anniversary points are worth the points at the currency value unless a value is given', () => {
  const r = valueWallet(catalog, wallet([wc('vx', 'us.capitalone.venture-x')]), { asOf, values });
  const miles = r.cards[0].benefits['us.capitalone.venture-x/anniversary-miles'];
  // 10,000 miles at the wallet's present value per mile, discounted across the year.
  const perMile = r.cpp_today['pts:capital_one_miles'];
  assert.ok(Math.abs(miles - 10000 * perMile * Math.pow(1.045, -0.5)) < 2, `${miles}`);
  const typed = valueWallet(catalog, wallet([wc('vx', 'us.capitalone.venture-x')], { benefit_values: { 'us.capitalone.venture-x/anniversary-miles': { personal_value: { amount: 5000, currency: 'USD' }, basis: 'present_value' } } }), { asOf, values });
  assert.equal(typed.cards[0].benefits['us.capitalone.venture-x/anniversary-miles'], 5000);
});

test('one answer per entitlement values that perk on every card', () => {
  const answers = { entitlement_values: { 'credit:resy': { usage_probability: '0' }, 'credit:uber_cash': { usage_probability: '1' } } };
  const r = valueWallet(catalog, wallet([wc('p', 'us.amex.platinum'), wc('g', 'us.amex.gold')], answers), { asOf, values });
  assert.equal(r.cards[0].benefits['us.amex.platinum/resy-credit'], 0);
  assert.equal(r.cards[1].benefits['us.amex.gold/resy-credit'], 0);
  const plain = valueWallet(catalog, wallet([wc('g', 'us.amex.gold')]), { asOf, values });
  assert.ok(r.cards[1].benefits['us.amex.gold/uber-cash'] > plain.cards[0].benefits['us.amex.gold/uber-cash']);
  // A value for the specific benefit still wins over the entitlement answer.
  const both = valueWallet(catalog, wallet([wc('g', 'us.amex.gold')], { ...answers, benefit_values: { 'us.amex.gold/resy-credit': { personal_value: { amount: 5000, currency: 'USD' }, basis: 'present_value' } } }), { asOf, values });
  assert.equal(both.cards[0].benefits['us.amex.gold/resy-credit'], 5000);
});

test('reviewed defaults carry a range and a reason', () => {
  for (const [id, v] of Object.entries(values.benefit_values!.values as Record<string, any>)) {
    if (!id.startsWith('us.amex.platinum/') && !id.startsWith('us.chase.sapphire-reserve/') && !id.startsWith('us.chase.ihg-premier/')) continue;
    if (v.low || v.high) { assert.ok(v.low && v.high && v.note, id); assert.ok(v.low.amount <= v.high.amount, id); }
  }
});

test('the app says a card depends on the user when its verdict flips within its perks\' ranges', () => {
  const doc = { occb: '0.3', people: [{ id: 'p1' }], cards: [wc('csr', 'us.chase.sapphire-reserve')] } as any;
  const s = keepers(catalog, doc, { asOf, values }).sheets[0];
  assert.ok(s.range.low < s.added && s.added < s.range.high);
  assert.equal(s.verdict, s.range.low > 0 ? 'keep' : s.range.high <= 0 ? 'cancel' : 'depends on you');
  assert.ok(s.questions.length > 0);
  // Answering that lounges are worth nothing and the credits are used fully narrows the range to a verdict.
  const answered = { ...doc, entitlement_values: Object.fromEntries(s.questions.map(q => [q.entitlement!, { personal_value: { amount: 0, currency: 'USD' } }])) };
  const t = keepers(catalog, answered, { asOf, values }).sheets[0];
  assert.ok(t.range.high - t.range.low < s.range.high - s.range.low);
});

