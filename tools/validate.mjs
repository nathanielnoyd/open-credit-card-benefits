// Validates every catalog and directory file against the JSON Schemas, then checks cross-file integrity.
// Schemas describe the published (expanded) form, so records are checked after loadCatalog() expands them.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadCatalog, loadDirectory, loadValueSet, entitlementType, ROOT, SPEC_VERSION, SITE } from './load.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const f of fs.readdirSync(path.join(ROOT, 'schema'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', f), 'utf8')));
const S = name => ajv.getSchema(`${SITE}/schema/${SPEC_VERSION}/${name}`);

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
function check(validator, data, where) {
  if (!validator(data)) for (const e of validator.errors) err(where, `${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ' ' + JSON.stringify(e.params.allowedValues) : ''}`);
}

const cat = loadCatalog();
check(S('catalog-lists.schema.json#/$defs/issuers'), cat.issuers, 'issuers.yaml');
check(S('catalog-lists.schema.json#/$defs/entitlement_types'), cat.entitlement_types, 'entitlement-types.yaml');
check(S('catalog-lists.schema.json#/$defs/spend_categories'), cat.spend_categories, 'spend-categories.yaml');
for (const c of cat.currencies) check(S('currency.schema.json'), c, `currency ${c.id}`);

const dupes = (xs, what) => { const seen = new Set(); for (const x of xs) { if (seen.has(x)) err(what, `duplicate id ${x}`); seen.add(x); } };
dupes(cat.issuers.map(i => i.id), 'issuers');
dupes(cat.entitlement_types.map(e => e.id), 'entitlement types');
dupes(cat.spend_categories.map(c => c.id), 'spend categories');
dupes(cat.currencies.map(c => c.id), 'currencies');

const issuerIds = new Set(cat.issuers.map(i => i.id));
const catIds = new Set(cat.spend_categories.map(c => c.id));
const curIds = new Set(cat.currencies.map(c => c.id));
const isCash = id => /^[A-Z]{3}$/.test(id);
const knownCurrency = id => isCash(id) || curIds.has(id);
const allBenefitIds = new Set();

for (const c of cat.spend_categories) if (c.parent && !catIds.has(c.parent)) err(c.id, `unknown parent ${c.parent}`);
for (const cur of cat.currencies) for (const p of cur.paths ?? []) {
  if (p.to && !knownCurrency(p.to)) err(`currency ${cur.id}`, `path ${p.id} transfers to unknown currency ${p.to}`);
  for (const r of p.requires ?? []) if (r.card_id && !process.env.OCCB_CARDS && !cat.cards.some(c => c.id === r.card_id)) err(`currency ${cur.id}`, `path ${p.id} requires unknown card ${r.card_id}`);
}

// Walk any record and check every embedded condition, points amount and category against the registries.
function checkRefs(obj, where) {
  if (Array.isArray(obj)) return obj.forEach(x => checkRefs(x, where));
  if (!obj || typeof obj !== 'object') return;
  if (typeof obj.type === 'string' && obj.type === 'wallet_holds' && obj.card_id && !process.env.OCCB_CARDS && !cat.cards.some(c => c.id === obj.card_id)) err(where, `wallet_holds unknown card ${obj.card_id}`);
  for (const [k, v] of Object.entries(obj)) {
    if (['reward', 'reward_max', 'cap', 'top_up'].includes(k) && v && typeof v === 'object' && v.currency && !knownCurrency(v.currency)) err(where, `${k} in unknown currency ${v.currency}`);
    checkRefs(v, where);
  }
}

// Variants (spec section 4, tools/variants.mjs): problems found while expanding them, and a check that they still are variants.
for (const p of cat.cards._variantProblems ?? []) err('variant', p);
for (const card of cat.cards.filter(c => c.based_on)) {
  const base = cat.cards.find(c => c.id === card.based_on.card);
  if (!base) continue;
  if (base.issuer_id !== card.issuer_id) err(card.id, `based_on ${base.id} from another issuer`);
  for (const r of card.releases) if (r.follows && r.effective_for_new < base.releases.find(x => x.id === r.follows)?.effective_for_new)
    warn(r.id, `follows ${r.follows} but takes effect before it`);
  // A variant is the base plus or minus a few terms. When most records are its own, it is a separate card, not a variant.
  const total = card.benefits.length + card.earn_rules.length;
  const own = total - card.benefits.filter(b => b.based_on).length - card.earn_rules.filter(r => r.based_on).length;
  if (total && own / total > 0.34) warn(card.id, `${own} of ${total} records are its own, not inherited; author it as a separate card instead of a variant`);
}

for (const card of cat.cards) {
  const { benefits, earn_rules, releases, ...cardOnly } = card;
  check(S('card.schema.json'), cardOnly, `card ${card.id}`);
  if (!card.summary) err(card.id, 'needs a plain-language summary');
  if (card.open_to_applicants && !card.url && !card.based_on) warn(card.id, 'no `url`; add the issuer product page so maintainers can recheck it');
  check(S('earn-rules.schema.json'), { card_id: card.id, rules: earn_rules }, `earn rules ${card.id}`);
  if (!issuerIds.has(card.issuer_id)) err(card.id, `unknown issuer ${card.issuer_id}`);
  if (!card.id.startsWith(card.issuer_id + '.')) err(card.id, `id must start with its issuer id ${card.issuer_id}`);
  if (!curIds.has(card.earns)) err(card.id, `earns unknown currency ${card.earns}`);
  if (card.cobrand?.program && !curIds.has(card.cobrand.program)) err(card.id, `cobrand program ${card.cobrand.program} is not a known currency`);
  const rel = new Map(releases.map(r => [r.id, r]));
  const referenced = new Map(); // "target#version" -> count

  for (const r of releases) {
    check(S('release.schema.json'), r, `release ${r.id}`);
    if (r.card_id !== card.id) err(r.id, 'card_id does not match folder');
    if (r.id !== `${card.id}@${r.effective_for_new}`) err(r.id, 'id must be <card id>@<effective_for_new>');
    for (const ch of r.changes) if (ch.version) {
      const key = `${ch.target}#${ch.version}`;
      referenced.set(key, (referenced.get(key) || 0) + 1);
    }
  }
  const baselines = releases.filter(r => r.kind === 'baseline');
  if (baselines.length !== 1) err(card.id, `needs exactly one baseline release, found ${baselines.length}`);
  else {
    if (releases.some(r => r.effective_for_new < baselines[0].effective_for_new)) err(card.id, 'baseline must be the earliest release');
    if (!baselines[0].changes.some(ch => ch.target === 'fee:annual')) err(card.id, 'baseline must set fee:annual (use amount 0 for no-fee cards)');
  }

  const versionsOf = new Map();
  const selectionNames = new Set();
  for (const b of benefits) {
    check(S('benefit.schema.json'), b, `benefit ${b.id}`);
    checkRefs(b, b.id);
    allBenefitIds.add(b.id);
    if (b.card_id !== card.id || !b.id.startsWith(card.id + '/')) err(b.id, 'id/card_id does not match folder');
    versionsOf.set(`benefit:${b.id}`, b.versions.map(v => v.version));
    b.versions.forEach((v, i) => {
      if (v.version !== i + 1) err(b.id, `versions must be numbered 1..n in order (found ${v.version} at ${i + 1})`);
      if (!rel.has(v.release)) err(b.id, `v${v.version} names unknown release ${v.release}`);
      const n = referenced.get(`benefit:${b.id}#${v.version}`) || 0;
      if (n !== 1) err(b.id, `v${v.version} must be shipped by exactly one release (found ${n})`);
      const shares = v.grants.filter(g => g.value_share).map(g => +g.value_share);
      if (shares.length && Math.abs(shares.reduce((a, x) => a + x, 0) - 1) > 1e-9) err(b.id, `v${v.version} value_share must sum to 1`);
      // Spec section 6: a benefit that grants several entitlements splits its value between them, or it counts more than once.
      if (v.grants.length > 1 && shares.length < v.grants.length) err(b.id, `v${v.version} grants ${v.grants.length} entitlements; give each a value_share`);
      // Spec section 7: something must switch an unlocked_only benefit on: another benefit's unlocks.add, a milestone's
      // reward_benefit, or a spend_gte condition of its own. Otherwise valuation silently ignores it.
      if (v.unlocked_only) {
        const switchedOn = benefits.some(o => o.versions.some(ov => (ov.unlocks ?? []).some(u => (u.add ?? []).includes(b.id)) || ov.reward_benefit === b.id))
          || (v.conditions ?? []).some(c => c.type === 'spend_gte');
        if (!switchedOn) err(b.id, `v${v.version} is unlocked_only but no unlock, milestone or spend_gte condition switches it on`);
      }
      for (const g of v.grants) {
        const t = entitlementType(cat.entitlement_types, g.entitlement);
        if (!t) err(b.id, `unknown entitlement ${g.entitlement}`);
        else if (g.combine !== t.combine) err(b.id, `grant ${g.entitlement} combines by ${g.combine} but the registry says ${t.combine}`);
      }
      for (const s of v.selections ?? []) selectionNames.add(s.name);
      for (const u of v.unlocks ?? []) for (const id of u.add ?? []) if (!benefits.some(x => x.id === id)) err(b.id, `unlock adds unknown benefit ${id}`);
      if (v.reward_benefit && !benefits.some(x => x.id === v.reward_benefit)) err(b.id, `reward_benefit ${v.reward_benefit} not found on this card`);
      if (!v.summary) err(b.id, `v${v.version} needs a plain-language summary`);
      else {
        // Every dollar figure in the summary should appear somewhere in the record, or be a simple multiple of one.
        const amounts = new Set();
        (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (Number.isInteger(o.amount) && /^[A-Z]{3}$/.test(o.currency ?? '')) amounts.add(o.amount); for (const x of Object.values(o)) walk(x); } else if (Number.isInteger(o)) amounts.add(o); })(v);
        const ok = c => [...amounts].some(a => a === c || [2, 3, 4, 5, 6, 12].some(k => a * k === c || a === c * k));
        for (const m of v.summary.matchAll(/\$(\d{1,3}(?:,\d{3})*(?:\.\d\d)?)(?![\d,]\d)/g)) {
          const cents = Math.round(Number(m[1].replace(/,/g, '')) * 100);
          if (!ok(cents) && !b.based_on) warn(b.id, `summary mentions ${m[0]}, which isn't in the record's data`);
        }
      }
      if (v.machine_readable === false && !v.notes) err(b.id, `v${v.version} is machine_readable: false but has no notes`);
      // Inherited records are copies of the base card's, so their warnings are reported once, on the base.
      if (b.kind === 'protection' && !v.coverage && !v.notes && !b.based_on) warn(b.id, 'protection without coverage terms');
      if (v.face_value && v.face_value.amount > 500000) err(b.id, `face value of $${v.face_value.amount / 100} looks wrong; amounts are in cents`);
    });
  }
  for (const r of earn_rules) {
    versionsOf.set(`earn_rule:${r.id}`, r.versions.map(v => v.version));
    if (!r.id.startsWith(card.id + '/')) err(r.id, 'earn rule id must start with the card id');
    for (const c of r.categories) if (!catIds.has(c)) err(r.id, `unknown spend category ${c}`);
    if (r.choice?.mode === 'holder_selects' && !r.choice.selection) err(r.id, 'holder_selects choice needs a selection name');
    for (const g of r.choice?.groups ?? []) for (const c of g.categories) if (!r.categories.includes(c)) err(r.id, `choice group ${g.id} uses ${c}, which is not in the rule's categories`);
    for (const v of r.versions) {
      if (!rel.has(v.release)) err(r.id, `v${v.version} names unknown release ${v.release}`);
      const n = referenced.get(`earn_rule:${r.id}#${v.version}`) || 0;
      if (n !== 1) err(r.id, `v${v.version} must be shipped by exactly one release (found ${n})`);
      if (v.currency && !curIds.has(v.currency)) err(r.id, `unknown currency ${v.currency}`);
      // Money is in cents; a cap over $2.5M or a multiplier over 30 is almost always a unit mistake.
      if (v.cap && v.cap.amount > 250000000) err(r.id, `cap of $${v.cap.amount / 100} looks wrong; amounts are in cents`);
      if (v.multiplier && Number(v.multiplier) > 30) err(r.id, `multiplier ${v.multiplier} looks wrong`);
      if (r.choice?.mode === 'rotating' && !v.schedule) warn(r.id, 'rotating rule without a schedule');
      for (const s of v.schedule ?? []) for (const c of s.categories) if (!catIds.has(c)) err(r.id, `schedule uses unknown spend category ${c}`);
      checkRefs(v.conditions ?? [], r.id);
    }
  }
  for (const r of releases) for (const t of r.transition ?? []) for (const target of t.applies_to) {
    if (/^(benefit|earn_rule|fee|path):/.test(target) && !r.changes.some(ch => ch.target === target)) err(r.id, `transition names ${target}, which this release doesn't change`);
  }
  for (const r of releases) for (const ch of r.changes) {
    if (/^(benefit|earn_rule):/.test(ch.target)) {
      const vs = versionsOf.get(ch.target);
      if (!vs) err(r.id, `change targets unknown ${ch.target}`);
      else if (ch.version && !vs.includes(ch.version)) err(r.id, `${ch.target} has no version ${ch.version}`);
    } else if (ch.target.startsWith('fee:') && !ch.to && ch.rate == null) err(r.id, `${ch.target} needs "to" or "rate"`);
    if (ch.to && ch.target === 'fee:annual' && ch.to.amount > 500000) err(r.id, `annual fee of $${ch.to.amount / 100} looks wrong; amounts are in cents`);
    if (ch.rate != null && Number(ch.rate) >= 1) err(r.id, `${ch.target} rate ${ch.rate} must be a fraction, such as "0.03" for 3%`);
  }
}
// The example value set (examples/value-sets) is an input apps may use, not catalog data; check it still fits the catalog.
const vs = loadValueSet();
if (vs.benefit_values) {
  check(S('catalog-lists.schema.json#/$defs/benefit_values'), vs.benefit_values, 'examples/value-sets/benefit-values.yaml');
  for (const [id, v] of Object.entries(vs.benefit_values.values)) {
    if (v.personal_value && v.personal_value.amount > 200000) err('examples/value-sets/benefit-values.yaml', `${id}: value looks wrong; amounts are in cents`);
    if (!allBenefitIds.has(id) && !process.env.OCCB_CARDS) err('examples/value-sets/benefit-values.yaml', `unknown benefit ${id}`);
  }
}
if (vs.finance) {
  const { scope, source, as_of, method, ...params } = vs.finance;
  check(S('wallet.schema.json#/properties/finance'), params, 'examples/value-sets/finance.yaml');
  for (const c of Object.keys(params.devaluation ?? {})) if (!curIds.has(c)) err('examples/value-sets/finance.yaml', `unknown currency ${c}`);
}
if (vs.valuations) {
  check(S('catalog-lists.schema.json#/$defs/valuations'), vs.valuations, 'examples/value-sets/valuations.yaml');
  for (const v of vs.valuations) if (!curIds.has(v.currency)) err('examples/value-sets/valuations.yaml', `unknown currency ${v.currency}`);
}
for (const { file, venue } of loadDirectory()) {
  check(S('venue.schema.json'), venue, path.relative(ROOT, file));
  for (const r of venue.access_rules) if (!entitlementType(cat.entitlement_types, r.entitlement)) err(venue.id, `unknown entitlement ${r.entitlement}`);
}
for (const f of fs.existsSync(path.join(ROOT, 'examples')) ? fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.json')) : []) {
  const w = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8'));
  check(S('wallet.schema.json'), w, `examples/${f}`);
  for (const c of w.cards ?? []) if (!process.env.OCCB_CARDS && !cat.cards.some(x => x.id === c.card_id)) err(`examples/${f}`, `unknown card ${c.card_id}`);
}

// Offers (spec Appendix F) are a format for other publishers; the catalog itself must never hold them.
if (fs.existsSync(path.join(ROOT, 'catalog', 'offers'))) err('catalog/offers', 'acquisition offers are out of scope for the catalog');
const offerDir = path.join(ROOT, 'examples', 'offers');
for (const f of fs.existsSync(offerDir) ? fs.readdirSync(offerDir).filter(f => f.endsWith('.json')) : []) {
  const feed = JSON.parse(fs.readFileSync(path.join(offerDir, f), 'utf8'));
  (Array.isArray(feed) ? feed : [feed]).forEach((o, i) => check(S('offer.schema.json'), o, `examples/offers/${f}[${i}]`));
}

const nB = cat.cards.reduce((s, c) => s + c.benefits.length, 0), nR = cat.cards.reduce((s, c) => s + c.releases.length, 0);
if (process.env.OCCB_WARNINGS) for (const w of warnings) console.warn('warning: ' + w);
if (errors.length) { console.error(errors.join('\n')); console.error(`\n${errors.length} problem(s).`); process.exit(1); }
console.log(`OK: ${cat.cards.length} cards, ${nB} benefits, ${nR} releases, ${cat.currencies.length} currencies, ${cat._files.length} files${warnings.length ? `, ${warnings.length} warning(s) (set OCCB_WARNINGS=1 to list)` : ''}.`);
