// Checks that run over every card in the catalog, so a new card can't silently break resolution or valuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTerms, valueWallet, marginalValues } from '../src/index.ts';
import { loadCatalog, loadValueSet } from '../tools/load.mjs';

const catalog = loadCatalog() as any;
// Valuation needs values from somewhere; these tests use the example value set, as an app would choose its own.
const values = loadValueSet();
const asOf = '2026-11-13';
const spend = {
  'cat:dining': 600000, 'cat:groceries.store': 700000, 'cat:gas_ev.gas': 250000, 'cat:streaming': 30000,
  'cat:travel.flights.direct': 300000, 'cat:travel.hotels.direct': 200000, 'cat:drugstores': 50000,
  'cat:merchant.amazon': 150000, 'cat:telecom': 120000, 'cat:all': 1500000
};
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

for (const card of catalog.cards) {
  // A card closed to applicants is checked as of the day before it closed.
  const when = card.closed_to_applicants_on ? new Date(Date.parse(card.closed_to_applicants_on) - 86400000).toISOString().slice(0, 10) : asOf;
  test(`${card.id}: resolves for a new applicant and values without errors`, () => {
    const t = resolveTerms(catalog, card.id, { opened_on: when }, when);
    assert.ok(t.fees.annual, 'has an annual fee (possibly $0)');
    assert.ok(t.earn_rules.length > 0, 'has at least one earn rule');
    assert.ok(t.earn_rules.some(e => e.categories.includes('cat:all') && !e.choice), 'has a base rule on cat:all');
    const wallet = { occb: '0.3', people: [{ id: 'p' }], cards: [{ id: 'w', card_id: card.id, holder: 'p', opened_on: when < '2025-01-15' ? when : '2025-01-15' }], spend_profile: { amounts: spend } };
    const r = valueWallet(catalog, wallet as any, { asOf: when, values });
    for (const k of ['net', 'benefits', 'earn', 'fees'] as const) assert.ok(finite(r[k]), `${k} is a number`);
    assert.ok(r.earn > 0, 'earns something on everyday spend');
    for (const [id, v] of Object.entries(r.cards[0].benefits)) assert.ok(finite(v) && v >= 0, `${id} has a valid value`);
  });
}

test('the catalog holds no acquisition offers: no welcome bonuses, intro APRs, first-year fee waivers or promotions', () => {
  assert.ok(!catalog.cards.some((c: any) => c.releases.some((r: any) => r.changes.some((ch: any) => 'first_year' in ch))), 'no first-year fees');
  const offers = catalog.cards.flatMap((c: any) => c.benefits.filter((b: any) => b.kind === 'welcome_offer').map((b: any) => b.id));
  assert.deepEqual(offers, []);
  const text = catalog.cards.flatMap((c: any) => [c.summary, c.notes, ...c.benefits.flatMap((b: any) => b.versions.map((v: any) => v.summary))]).filter(Boolean);
  assert.ok(!text.some((t: string) => /intro(ductory)? apr|welcome (offer|bonus) of|sign-up bonus|\$0 (the|for the) first year/i.test(t)), 'no offer text in summaries or notes');
});

test('a mixed household wallet of every catalog card values without errors and resolves overlap', () => {
  const ids = catalog.cards.map((c: any) => c.id);
  const wallet = { occb: '0.3', people: [{ id: 'p1' }, { id: 'p2' }], cards: ids.map((id: string, i: number) => ({ id: `w${i}`, card_id: id, holder: i % 2 ? 'p2' : 'p1', opened_on: '2025-01-15' })), spend_profile: { amounts: spend } };
  const r = valueWallet(catalog, wallet as any, { asOf, values });
  assert.ok(finite(r.net));
  assert.ok(r.double_count_removed > 0, 'duplicate perks across cards are not all counted');
  const pp = r.overlaps.find(o => o.entitlement === 'membership:priority_pass');
  if (pp) assert.equal(pp.parts.filter(p => p.counted).length, 1, 'Priority Pass counts once');
});

test('marginal values add up to something sensible for a small wallet', () => {
  const pick = ['us.chase.sapphire-preferred', 'us.chase.freedom-unlimited', 'us.amex.gold'].filter(id => catalog.cards.some((c: any) => c.id === id));
  const wallet = { occb: '0.3', people: [{ id: 'p' }], cards: pick.map((id, i) => ({ id: `w${i}`, card_id: id, holder: 'p', opened_on: '2025-01-15' })), spend_profile: { amounts: spend } };
  const m = marginalValues(catalog, wallet as any, { asOf, values });
  for (const v of Object.values(m)) assert.ok(finite(v));
});
