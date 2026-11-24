// Card variants (docs/design/card-variants.md, tools/variants.mjs): expansion rules on a small synthetic card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandVariant } from '../tools/variants.mjs';
import { loadCatalog, loadValueSet } from '../tools/load.mjs';
import { resolveTerms, valueWallet } from '../src/index.ts';

// Valuation needs values from somewhere; these tests use the example value set, as an app would choose its own.
const values = loadValueSet();

const usd = (amount: number) => ({ amount, currency: 'USD' });
const base = () => ({
  id: 'us.x.card', issuer_id: 'us.x', name: 'Card', network: 'visa', segment: 'personal', earns: 'pts:x', family: 'x', tier: 'premium',
  benefits: [
    { id: 'us.x.card/credit', card_id: 'us.x.card', kind: 'statement_credit', name: 'Credit', versions: [
      { version: 1, change_type: 'added', release: 'us.x.card@2024-01-01', effective_from: '2024-01-01', face_value: usd(10000), grants: [{ entitlement: 'credit:x' }] },
      { version: 2, supersedes: 1, change_type: 'amount_changed', release: 'us.x.card@2025-01-01', effective_from: '2025-01-01', face_value: usd(20000), grants: [{ entitlement: 'credit:x' }] },
      { version: 3, supersedes: 2, change_type: 'amount_changed', release: 'us.x.card@2026-01-01', effective_from: '2026-01-01', face_value: usd(30000), grants: [{ entitlement: 'credit:x' }] }] },
    { id: 'us.x.card/lounge', card_id: 'us.x.card', kind: 'membership', name: 'Lounge', versions: [
      { version: 1, change_type: 'added', release: 'us.x.card@2024-01-01', grants: [{ entitlement: 'membership:x' }] }] },
    { id: 'us.x.card/gym', card_id: 'us.x.card', kind: 'statement_credit', name: 'Gym', versions: [
      { version: 1, change_type: 'added', release: 'us.x.card@2024-01-01', grants: [{ entitlement: 'credit:gym' }] }] }
  ],
  earn_rules: [{ id: 'us.x.card/base', categories: ['cat:all'], versions: [{ version: 1, release: 'us.x.card@2024-01-01', multiplier: '1' }] }],
  releases: [
    { id: 'us.x.card@2024-01-01', card_id: 'us.x.card', kind: 'baseline', effective_for_new: '2024-01-01', sources: [{ url: 'https://x/base' }], changes: [
      { target: 'fee:annual', to: usd(50000) }, { target: 'fee:authorized_user', to: usd(10000) },
      { target: 'benefit:us.x.card/credit', version: 1 }, { target: 'benefit:us.x.card/lounge', version: 1 },
      { target: 'benefit:us.x.card/gym', version: 1 }, { target: 'earn_rule:us.x.card/base', version: 1 }] },
    { id: 'us.x.card@2025-01-01', card_id: 'us.x.card', kind: 'change', effective_for_new: '2025-01-01', sources: [{ url: 'https://x/2025' }], changes: [{ target: 'benefit:us.x.card/credit', version: 2 }],
      transition: [{ applies_to: ['benefit:us.x.card/credit'], on: '2025-03-01' }] },
    { id: 'us.x.card@2026-01-01', card_id: 'us.x.card', kind: 'change', effective_for_new: '2026-01-01', sources: [{ url: 'https://x/2026' }], changes: [{ target: 'benefit:us.x.card/credit', version: 3 }, { target: 'benefit:us.x.card/gym', change_type: 'retired' }] }
  ]
});
const variant = (extra: object = {}) => ({
  id: 'us.x.card-plus', name: 'Card Plus', based_on: { card: 'us.x.card', exclude: ['us.x.card/lounge'] },
  benefits: [{ id: 'us.x.card-plus/bonus', card_id: 'us.x.card-plus', kind: 'other', name: 'Bonus', versions: [{ version: 1, change_type: 'added', release: 'us.x.card-plus@2024-01-01', grants: [{ entitlement: 'other:bonus' }] }] }],
  earn_rules: [],
  releases: [
    { id: 'us.x.card-plus@2024-01-01', card_id: 'us.x.card-plus', follows: 'us.x.card@2024-01-01', effective_for_new: '2024-01-01',
      changes: [{ target: 'fee:authorized_user', to: usd(10000), free_count: 1 }, { target: 'benefit:us.x.card-plus/bonus', version: 1 }] },
    { id: 'us.x.card-plus@2026-02-01', card_id: 'us.x.card-plus', follows: 'us.x.card@2026-01-01', effective_for_new: '2026-02-01' }
  ],
  ...extra
});

test('a variant must follow or decline every base release', () => {
  const problems: string[] = [];
  expandVariant(variant(), base(), problems);
  assert.deepEqual(problems, ['us.x.card-plus: base release us.x.card@2025-01-01 is neither followed nor listed in based_on.not_followed']);
});

test('inherited records take the variant IDs, follow its releases and renumber around declined ones', () => {
  const problems: string[] = [];
  const v = expandVariant(variant({ based_on: { card: 'us.x.card', exclude: ['us.x.card/lounge'], not_followed: [{ release: 'us.x.card@2025-01-01', reason: 'not offered on this card' }] } }), base(), problems);
  assert.deepEqual(problems, []);
  assert.deepEqual(v.benefits.map((b: any) => b.id).sort(), ['us.x.card-plus/bonus', 'us.x.card-plus/credit', 'us.x.card-plus/gym']);
  const credit = v.benefits.find((b: any) => b.id === 'us.x.card-plus/credit');
  assert.equal(credit.based_on, 'us.x.card/credit');
  assert.deepEqual(credit.versions.map((x: any) => [x.version, x.supersedes, x.release, x.effective_from, x.face_value.amount]),
    [[1, undefined, 'us.x.card-plus@2024-01-01', '2024-01-01', 10000], [2, 1, 'us.x.card-plus@2026-02-01', '2026-02-01', 30000]]);
  const r26 = v.releases.find((r: any) => r.id === 'us.x.card-plus@2026-02-01');
  assert.deepEqual(r26.changes, [{ target: 'benefit:us.x.card-plus/credit', version: 2 }, { target: 'benefit:us.x.card-plus/gym', change_type: 'retired' }]);
  assert.equal(r26.kind, 'change');
  assert.deepEqual(r26.sources, [{ url: 'https://x/2026' }]);
  const r24 = v.releases.find((r: any) => r.id === 'us.x.card-plus@2024-01-01');
  assert.deepEqual(r24.changes.find((c: any) => c.target === 'fee:authorized_user'), { target: 'fee:authorized_user', to: usd(10000), free_count: 1 });
  assert.ok(!r24.changes.some((c: any) => c.target.includes('lounge')));
  assert.equal(v.family, 'x');
  assert.equal(v.tier, 'premium');
});

test('a variant record with a base slug replaces the base record', () => {
  const problems: string[] = [];
  const own = { id: 'us.x.card-plus/credit', card_id: 'us.x.card-plus', kind: 'statement_credit', name: 'Bigger credit', versions: [{ version: 1, change_type: 'added', release: 'us.x.card-plus@2024-01-01', face_value: usd(99900), grants: [{ entitlement: 'credit:x' }] }] };
  const vv = variant({ based_on: { card: 'us.x.card', not_followed: [{ release: 'us.x.card@2025-01-01', reason: 'n/a' }] } });
  (vv.benefits as any[]).push(own);
  (vv.releases[0].changes as any[]).push({ target: 'benefit:us.x.card-plus/credit', version: 1 });
  const v = expandVariant(vv, base(), problems);
  const credits = v.benefits.filter((b: any) => b.id === 'us.x.card-plus/credit');
  assert.equal(credits.length, 1);
  assert.equal(credits[0].name, 'Bigger credit');
  assert.ok(!v.releases.find((r: any) => r.id === 'us.x.card-plus@2026-02-01').changes.some((c: any) => c.target === 'benefit:us.x.card-plus/credit'));
});

test('the Morgan Stanley Platinum resolves as the Platinum plus its own terms', () => {
  const catalog = loadCatalog() as any;
// Valuation needs values from somewhere; these tests use the example value set, as an app would choose its own.
const values = loadValueSet();
  const holder = { opened_on: '2023-05-01' };
  const plat = resolveTerms(catalog, 'us.amex.platinum', holder, '2026-11-13');
  const ms = resolveTerms(catalog, 'us.amex.platinum-morgan-stanley', holder, '2026-11-13');
  assert.deepEqual(ms.benefits.filter(b => b.based_on).map(b => b.based_on).sort(), plat.benefits.map(b => b.id).sort());
  assert.deepEqual(ms.benefits.filter(b => !b.based_on).map(b => b.id), ['us.amex.platinum-morgan-stanley/spend-award']);
  assert.equal(ms.fees.annual.amount, plat.fees.annual.amount);
  assert.equal(ms.fees.authorized_user?.free_count, 1);
  // The Saks credit leaves existing holders of both cards on the same date.
  for (const id of ['us.amex.platinum', 'us.amex.platinum-morgan-stanley']) {
    assert.ok(resolveTerms(catalog, id, holder, '2026-06-30').benefits.some(b => b.id.endsWith('/saks-credit')));
    assert.ok(!resolveTerms(catalog, id, holder, '2026-07-01').benefits.some(b => b.id.endsWith('/saks-credit')));
  }
});

test('holding a card and its variant stacks per-card credits and dedupes memberships', () => {
  const catalog = loadCatalog() as any;
  const w = (ids: string[]): any => ({ occb: '0.3', people: [{ id: 'p' }], cards: ids.map((card_id, i) => ({ id: `w${i}`, card_id, holder: 'p', opened_on: '2024-02-01', status: 'open' })) });
  const r = valueWallet(catalog, w(['us.amex.platinum', 'us.amex.platinum-morgan-stanley']), { asOf: '2026-11-13', values });
  const group = (e: string) => r.parts.filter(p => p.entitlement === e);
  assert.equal(group('credit:resy').filter(p => p.counted).length, 2);
  assert.equal(group('membership:priority_pass').filter(p => p.counted).length, 1);
});

test('wallet_holds with a family and tier matches only cards of that tier', async () => {
  const { holds } = await import('../src/value.ts');
  const catalog = loadCatalog() as any;
  // The Reserve is the family's premium tier and the Preferred its mid tier, so a rule for the premium tier
  // covers a future Reserve for Business without naming it, and never the Preferred.
  const cond = { type: 'wallet_holds', family: 'chase-sapphire', tier: 'premium' };
  assert.equal(holds(catalog, new Set(['us.chase.sapphire-reserve']), cond), true);
  assert.equal(holds(catalog, new Set(['us.chase.sapphire-preferred']), cond), false);
  assert.equal(holds(catalog, new Set(['us.chase.sapphire-preferred']), { ...cond, tier: ['mid', 'premium'] } as any), true);
});

test('wallet_holds with a segment matches only personal or only business cards of the family', async () => {
  const { holds } = await import('../src/value.ts');
  const catalog = loadCatalog() as any;
  const cond = { type: 'wallet_holds', family: 'chase-united', segment: 'personal' };
  assert.equal(holds(catalog, new Set(['us.chase.united-business']), cond), false);
  assert.equal(holds(catalog, new Set(['us.chase.united-business', 'us.chase.united-explorer']), cond), true);
});

test('both Sapphire Reserves keep Hyatt 1:1; the Preferred gets the reduced ratio', async () => {
  const { bestRatio } = await import('../src/value.ts');
  const catalog = loadCatalog() as any;
  const ur = catalog.currencies.find((c: any) => c.id === 'pts:chase_ur');
  const ratio = (card: string) => bestRatio(catalog, ur, 'pts:world_of_hyatt', new Set([card]), '2026-11-13');
  assert.equal(ratio('us.chase.sapphire-reserve'), 1);
  assert.equal(ratio('us.chase.sapphire-reserve-business'), 1);
  assert.ok(ratio('us.chase.sapphire-preferred') < 1);
});

test('a variant with no defaults of its own values inherited perks like its base card', () => {
  const catalog = loadCatalog() as any;
  const w = (card_id: string): any => ({ occb: '0.3', people: [{ id: 'p' }], cards: [{ id: 'w', card_id, holder: 'p', opened_on: '2024-02-01', status: 'open' }] });
  const base = valueWallet(catalog, w('us.amex.platinum'), { asOf: '2026-11-13', values }).cards[0].benefits;
  const schwab = valueWallet(catalog, w('us.amex.platinum-schwab'), { asOf: '2026-11-13', values }).cards[0].benefits;
  for (const slug of ['priority-pass', 'resy-credit', 'centurion']) assert.equal(schwab[`us.amex.platinum-schwab/${slug}`], base[`us.amex.platinum/${slug}`], slug);
});

