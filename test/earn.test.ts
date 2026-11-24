// Spend assignment and fee cases on a small synthetic catalog, so they don't move when real card terms change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueWallet, resolveTerms } from '../src/index.ts';

const USD = (amount: number) => ({ amount, currency: 'USD' });
const src = [{ url: 'https://example.com' }];
function card(id: string, rules: any[], opts: { fee?: number; earns?: string } = {}) {
  const rel = `${id}@2026-01-01`;
  return {
    id, issuer_id: 'us.example', name: id, earns: opts.earns ?? 'pts:cash', benefits: [],
    earn_rules: rules.map(r => ({ id: `${id}/${r.slug}`, categories: r.categories, exclude_categories: r.exclude_categories, choice: r.choice, versions: [{ version: 1, release: rel, ...r.v }] })),
    releases: [{
      id: rel, card_id: id, kind: 'baseline', effective_for_new: '2026-01-01', sources: src,
      changes: [
        { target: 'fee:annual', to: USD(opts.fee ?? 0) },
        ...rules.map(r => ({ target: `earn_rule:${id}/${r.slug}`, version: 1 }))
      ]
    }]
  };
}
const base = { slug: 'base', categories: ['cat:all'], v: { multiplier: '1' } };
const catalog: any = {
  occb: '0.3',
  currencies: [
    { id: 'pts:cash', name: 'Cash', kind: 'cashback', cents_per_point: '1.0', paths: [] },
    { id: 'pts:status', name: 'Status credit', kind: 'status_credit', paths: [] }
  ],
  entitlement_types: [],
  spend_categories: [
    { id: 'cat:all', name: 'All' },
    { id: 'cat:dining', name: 'Dining', parent: 'cat:all' },
    { id: 'cat:groceries', name: 'Groceries', parent: 'cat:all' },
    { id: 'cat:gas', name: 'Gas', parent: 'cat:all' },
    { id: 'cat:travel', name: 'Travel', parent: 'cat:all' },
    { id: 'cat:rent', name: 'Rent', parent: 'cat:all', explicit_only: true }
  ],
  cards: [
    card('us.example.capped', [base, { slug: 'dining-5', categories: ['cat:dining'], v: { multiplier: '5', cap: USD(100000), cap_period: 'calendar_year' } }]),
    card('us.example.flat2', [{ slug: 'base', categories: ['cat:all'], v: { multiplier: '2' } }]),
    card('us.example.shared', [base,
      { slug: 'choice-3', categories: ['cat:dining', 'cat:gas', 'cat:travel'], choice: { mode: 'holder_selects', pick: 1, selection: 'category' }, v: { multiplier: '3', cap: USD(250000), cap_period: 'quarter', cap_group: 'q' } },
      { slug: 'groceries-2', categories: ['cat:groceries'], v: { multiplier: '2', cap: USD(250000), cap_period: 'quarter', cap_group: 'q' } }]),
    card('us.example.top', [base, { slug: 'top-5', categories: ['cat:dining', 'cat:gas', 'cat:groceries'], choice: { mode: 'top_spend', pick: 1, period: 'statement' }, v: { multiplier: '5', cap: USD(50000), cap_period: 'statement' } }]),
    card('us.example.rotating', [base, { slug: 'rotating-5', categories: ['cat:gas', 'cat:dining'], choice: { mode: 'rotating', period: 'quarter' }, v: {
      multiplier: '5', cap: USD(150000), cap_period: 'quarter', conditions: [{ type: 'enrollment_required' }],
      schedule: [{ from: '2027-01-01', to: '2027-03-31', categories: ['cat:gas'] }, { from: '2027-04-01', to: '2027-06-30', categories: ['cat:dining'] }] } }]),
    card('us.example.intro', [{ slug: 'base', categories: ['cat:all'], v: { multiplier: '1.5' } },
      { slug: 'intro', categories: ['cat:all'], v: { multiplier: '1.5', stacks: true, cap: USD(2000000), conditions: [{ type: 'card_year', years: [1] }] } }]),
    card('us.example.boosted', [base,
      { slug: 'gold', categories: ['cat:all'], v: { boost: '0.25', conditions: [{ type: 'selection_is', name: 'tier', value: 'gold' }] } },
      { slug: 'platinum', categories: ['cat:all'], v: { boost: '0.5', conditions: [{ type: 'selection_is', name: 'tier', value: 'platinum' }] } }]),
    card('us.example.rent', [{ slug: 'base', categories: ['cat:all'], exclude_categories: ['cat:gas'], v: { multiplier: '2' } }, { slug: 'rent', categories: ['cat:rent'], v: { multiplier: '1' } }]),
    card('us.example.cobrand', [base, { slug: 'status', categories: ['cat:all'], v: { multiplier: '0.1', currency: 'pts:status', stacks: true } }], { fee: 15000 })
  ]
};
const asOf = '2027-01-01';
const flat = { discount_rate: '0', devaluation: { 'pts:cash': '0' }, holding_period_months: 0 };
function run(cards: any[], amounts: Record<string, number>, extra: any = {}) {
  return valueWallet(catalog, { occb: '0.3', people: [{ id: 'p' }], cards: cards.map((c, i) => ({ id: `w${i}`, holder: 'p', opened_on: '2026-01-01', ...c })), spend_profile: { amounts }, finance: flat, ...extra }, { asOf });
}

test('spend above a cap flows to the next-best card', () => {
  const r = run([{ card_id: 'us.example.capped' }, { card_id: 'us.example.flat2' }], { 'cat:dining': 300000 });
  // $1,000 at 5% on the capped card, the other $2,000 at 2% elsewhere.
  assert.equal(r.earn, 5000 + 4000);
  assert.deepEqual(r.allocation.map(a => [a.wallet_card_id, a.amount]), [['w0', 100000], ['w1', 200000]]);
});

test('rules in one cap_group share a single cap', () => {
  const r = run([{ card_id: 'us.example.shared', selections: { category: 'cat:dining' } }], { 'cat:dining': 1000000, 'cat:groceries': 1000000 });
  // $10,000 a year of combined bonus spend ($2,500 a quarter) goes first to 3% dining; everything else earns 1%.
  assert.equal(r.earn, 30000 + 10000);
});

test('a holder-selected category earns only when chosen', () => {
  const gas = run([{ card_id: 'us.example.shared', selections: { category: 'cat:gas' } }], { 'cat:dining': 100000 });
  const dining = run([{ card_id: 'us.example.shared', selections: { category: 'cat:dining' } }], { 'cat:dining': 100000 });
  assert.equal(gas.earn, 1000);
  assert.equal(dining.earn, 3000);
});

test('a top-spend rule applies to the eligible category with the most spend', () => {
  const r = run([{ card_id: 'us.example.top' }], { 'cat:dining': 200000, 'cat:gas': 300000 });
  // Gas wins the 5% slot; dining earns 1%.
  assert.equal(r.earn, 15000 + 2000);
});

test('rotating categories earn only in their scheduled quarters', () => {
  const r = run([{ card_id: 'us.example.rotating' }], { 'cat:gas': 400000 });
  // Gas is a bonus category for one quarter: a quarter of the year's spend, $1,000, earns 5%; the rest 1%.
  assert.ok(Math.abs(r.earn - (5000 + 3000)) <= 100, `earn ${r.earn}`);
});

test('a stacking first-year bonus adds to the base rate, only in card year one', () => {
  const y1 = run([{ card_id: 'us.example.intro', opened_on: '2026-06-01' }], { 'cat:all': 1000000 });
  const y2 = run([{ card_id: 'us.example.intro', opened_on: '2025-06-01' }], { 'cat:all': 1000000 });
  assert.equal(y1.earn, 30000);
  assert.equal(y2.earn, 15000);
});

test('relationship boosts scale the card’s earn for the selected tier only', () => {
  const none = run([{ card_id: 'us.example.boosted' }], { 'cat:all': 1000000 });
  const plat = run([{ card_id: 'us.example.boosted', selections: { tier: 'platinum' } }], { 'cat:all': 1000000 });
  assert.equal(none.earn, 10000);
  assert.equal(plat.earn, 15000);
});

test('status-credit earn is counted in points but has no cash value', () => {
  const r = run([{ card_id: 'us.example.cobrand' }], { 'cat:all': 1000000 });
  assert.equal(r.points_earned['pts:status'], 1000);
  assert.equal(r.earn, 10000);
});

test('a card opened in the horizon pays its fee at opening, and a recorded fee_paid replaces the catalog fee', () => {
  const newCard = run([{ card_id: 'us.example.cobrand', opened_on: '2027-01-01' }], {});
  const waived = run([{ card_id: 'us.example.cobrand', opened_on: '2027-01-01', fee_paid: [{ date: '2027-01-01', amount: USD(0) }] }], {});
  const renewing = run([{ card_id: 'us.example.cobrand', opened_on: '2026-03-01' }], {});
  assert.equal(newCard.fees, 15000);
  assert.equal(waived.fees, 0);
  assert.equal(renewing.fees, 15000);
});
test('rent earns only on rules that name it, and excluded categories earn nothing on a rule', () => {
  const r = run([{ card_id: 'us.example.rent' }, { card_id: 'us.example.flat2' }], { 'cat:rent': 1000000, 'cat:gas': 100000 });
  // Rent: 1x on the rent rule, never the 2x catch-alls. Gas: excluded from the rent card's 2x, so it goes to flat2 at 2x.
  assert.equal(r.earn, 10000 + 2000);
  assert.deepEqual(r.allocation.map(a => [a.category, a.wallet_card_id]).sort(), [['cat:gas', 'w1'], ['cat:rent', 'w0']]);
});

test('an intro earn offer applies only for its months and only when offers are counted', () => {
  const offer = { card_id: 'us.example.capped', components: [{ type: 'intro_earn', categories: ['cat:all'], multiplier: '2', stacks: true, months: 6 }, { type: 'intro_apr', applies_to: 'purchases', rate: '0', months: 15 }] };
  const opened = (date: string, include: boolean) => run([{ card_id: 'us.example.capped', opened_on: date, offers: [offer] }], { 'cat:all': 1200000 }, { finance: { ...flat, include_offers: include } });
  // Opened today: the extra 2% applies (the engine counts rules active at any point in the horizon).
  assert.equal(opened('2027-01-01', true).earn, 12000 + 24000);
  assert.equal(opened('2027-01-01', false).earn, 12000, 'steady state ignores the offer');
  assert.equal(opened('2025-01-01', true).earn, 12000, 'an intro rate that ended long ago adds nothing');
});
