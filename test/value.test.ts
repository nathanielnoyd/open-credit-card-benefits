import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { valueWallet, marginalValues } from '../src/index.ts';
import { loadCatalog, loadValueSet } from '../tools/load.mjs';

const catalog = loadCatalog() as any;
const read = (p: string) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const wallet = read('../examples/three-cards.json');
const expected = read('../conformance/valuation/three-cards.expected.json');
// Conformance checks the math against fixed inputs: its own frozen value set, not the example one.
const values = loadValueSet(new URL('../conformance/valuation/three-cards.values', import.meta.url).pathname);
const opts = { asOf: expected.as_of, values };

test('three-card wallet matches the expected values to the cent', () => {
  const r = valueWallet(catalog, wallet, opts);
  for (const k of ['net', 'benefits', 'earn', 'fees', 'double_count_removed'] as const) assert.equal(r[k], expected[k], k);
  assert.deepEqual(marginalValues(catalog, wallet, opts), expected.marginal);
});

test('duplicate Priority Pass memberships count once', () => {
  const g = valueWallet(catalog, wallet, opts).overlaps.find(o => o.entitlement === 'membership:priority_pass')!;
  assert.equal(g.parts.filter(p => p.counted).length, 1);
});

test('trusted traveler credits count once per person in the household', () => {
  const g = valueWallet(catalog, wallet, opts).overlaps.find(o => o.entitlement === 'credit:trusted_traveler')!;
  assert.equal(g.parts.length, 3);
  assert.equal(g.parts.filter(p => p.counted).length, wallet.people.length);
});

test('dropping the Reserve lowers Chase points value through the Hyatt transfer ratio', () => {
  const without = { ...wallet, cards: wallet.cards.filter((c: any) => c.card_id !== 'us.chase.sapphire-reserve') };
  assert.ok(valueWallet(catalog, without, opts).cpp_today['pts:chase_ur'] < valueWallet(catalog, wallet, opts).cpp_today['pts:chase_ur']);
});

test('an unreachable spend threshold unlocks nothing and moves no spend', () => {
  const r = valueWallet(catalog, { ...wallet, goals: { spend_thresholds: ['w-csr'] } }, opts);
  assert.equal(r.thresholds_met['w-csr'], false);
  assert.equal(r.threshold_cost, 0);
});

test('a reachable spend threshold unlocks its benefits and reports the points given up', () => {
  const big = { ...wallet, spend_profile: { amounts: { ...wallet.spend_profile.amounts, 'cat:all': 6000000 } }, goals: { spend_thresholds: ['w-csr'] } };
  const r = valueWallet(catalog, big, opts);
  assert.equal(r.thresholds_met['w-csr'], true);
  const csr = r.cards.find(c => c.wallet_card_id === 'w-csr')!;
  assert.ok(csr.benefits['us.chase.sapphire-reserve/southwest-credit'] > 0);
});

test('the fee charged is the one in force at the next renewal', () => {
  const r = valueWallet(catalog, wallet, { asOf: '2025-11-01', values });
  // Reserve renews 2026-03-01 at $795; Platinum renews 2026-05-10 at $895; Preferred renews 2026-01-15 at $95.
  assert.equal(r.fees, 79500 + 89500 + 9500);
});

test('with no values, credits count at face value and everything unvalued is reported for the app to ask about', () => {
  const r = valueWallet(catalog, wallet, { asOf: expected.as_of });
  const csr = r.cards.find(c => c.card_id === 'us.chase.sapphire-reserve')!;
  // The travel credit counts at its face value, less the earn its purchases give up, discounted across the year.
  assert.ok(csr.benefits['us.chase.sapphire-reserve/travel-credit'] > 28000);
  const unvalued = new Map(r.unvalued.benefits.map(u => [u.id, u.counted_at]));
  assert.equal(unvalued.get('us.chase.sapphire-reserve/travel-credit'), 'face');
  assert.equal(unvalued.get('us.chase.sapphire-reserve/priority-pass'), 'zero');
  assert.equal(csr.benefits['us.chase.sapphire-reserve/priority-pass'], 0);
  // Transferable points with no valuation count at 1 cent and are reported; fixed-value currencies are not.
  assert.ok(r.unvalued.currencies.includes('pts:chase_ur'));
  assert.equal(valueWallet(catalog, wallet, opts).unvalued.benefits.length, 0);
});

test('finance assumptions are inputs: without them nothing is discounted, and each missing one is reported', () => {
  const bare = { ...wallet, finance: { horizon_months: 12 } };
  const r = valueWallet(catalog, bare, { asOf: expected.as_of, values: { ...values, finance: undefined } });
  assert.ok(r.unvalued.finance.includes('discount_rate'));
  assert.ok(r.unvalued.finance.includes('holding_period_months'));
  assert.ok(r.unvalued.finance.includes('devaluation:pts:chase_ur'));
  // Points are worth their full cents-per-point today with no discounting or devaluation.
  const ur = (values.valuations as any[]).filter((v: any) => v.currency === 'pts:chase_ur').sort((a: any, b: any) => b.as_of.localeCompare(a.as_of))[0];
  assert.equal(r.cpp_today['pts:chase_ur'], Number(ur.cpp));
  // The user's own finance parameters win over the value set's.
  const mine = valueWallet(catalog, { ...bare, finance: { discount_rate: '0.10', holding_period_months: 24, devaluation: { 'pts:chase_ur': '0.2' } } }, opts);
  assert.ok(mine.cpp_today['pts:chase_ur'] < valueWallet(catalog, wallet, opts).cpp_today['pts:chase_ur']);
  assert.ok(!mine.unvalued.finance.length);
});
