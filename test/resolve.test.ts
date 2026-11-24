import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveTerms } from '../src/index.ts';
import { loadCatalog } from '../tools/load.mjs';

const catalog = loadCatalog() as any;
const { cases } = JSON.parse(fs.readFileSync(new URL('../conformance/resolution.json', import.meta.url), 'utf8'));

for (const c of cases) {
  test(c.name, () => {
    const t = resolveTerms(catalog, c.card_id, c.holder, c.as_of);
    const slug = (id: string) => id.split('/')[1];
    const benefits = new Map(t.benefits.map(b => [slug(b.id), b]));
    const earn = new Set(t.earn_rules.map(e => slug(e.id)));
    const e = c.expect;
    if (e.fee_annual != null) assert.equal(t.fees.annual.amount, e.fee_annual, 'annual fee');
    if (e.fee_authorized_user != null) assert.equal(t.fees.authorized_user.amount, e.fee_authorized_user, 'authorized user fee');
    for (const b of e.has ?? []) assert.ok(benefits.has(b), `has ${b}`);
    for (const b of e.lacks ?? []) assert.ok(!benefits.has(b), `lacks ${b}`);
    for (const [b, v] of Object.entries(e.versions ?? {})) assert.equal(benefits.get(b)?.version, v, `${b} version`);
    for (const r of e.earn_has ?? []) assert.ok(earn.has(r), `earn rule ${r}`);
    for (const r of e.earn_lacks ?? []) assert.ok(!earn.has(r), `no earn rule ${r}`);
    if (e.legacy_count != null) assert.equal(t.legacy.length, e.legacy_count, 'legacy rules');
  });
}

test('a release with a never transition reaches new applicants but not existing holders', async () => {
  const { loadCatalog } = await import('../tools/load.mjs');
  const catalog = loadCatalog() as any;
  const id = 'us.barclays.wyndham-earner-business';
  const old = resolveTerms(catalog, id, { opened_on: '2023-05-01' }, '2026-11-14');
  const fresh = resolveTerms(catalog, id, { opened_on: '2026-08-01' }, '2026-11-14');
  assert.equal(old.fees.annual?.amount, 9500);
  assert.equal(fresh.fees.annual?.amount, 14900);
});

