// Loads the YAML catalog into one bundle object. Shared by validate, build and tests.
//
// The YAML is the authoring form; the bundle is the published form. Loading expands the
// authoring shorthand so every published record is explicit (docs/catalog-format.md):
//   - card `provenance` fills `sources`, `verified_by`, `confidence` and `last_reviewed`
//     on every benefit version, earn-rule version and release that leaves them out;
//   - a benefit version without `period` gets `{ cadence: ongoing }`;
//   - a period without `tz` gets the issuer's timezone;
//   - a version without `effective_from` gets its release's `effective_for_new`;
//   - a grant without `combine` gets the rule from entitlement-types.yaml;
//   - a variant (`based_on`) gets its base card's records under its own IDs (tools/variants.mjs).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { expandVariant } from './variants.mjs';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const SPEC_VERSION = '0.3';
// Where the project publishes (GitHub Pages); schema IDs and published links are under it.
export const SITE = 'https://nathanielnoyd.github.io/open-credit-card-benefits';
const read = p => YAML.parse(fs.readFileSync(p, 'utf8'));
const list = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().map(f => path.join(dir, f)) : [];

/** The registry entry for an entitlement key: an exact match, else the `<type>:*` wildcard. */
export function entitlementType(types, id) {
  return types.find(t => t.id === id) ?? types.find(t => t.id === id.split(':')[0] + ':*');
}

const PROVENANCE = ['sources', 'verified_by', 'confidence', 'last_reviewed'];
function withProvenance(rec, prov) {
  if (!prov) return rec;
  const out = { ...rec };
  for (const k of PROVENANCE) if (out[k] == null && prov[k] != null) out[k] = prov[k];
  return out;
}

export function loadCatalog(root = ROOT, { expand = true } = {}) {
  const cat = path.join(root, 'catalog');
  const files = [];
  const track = (p) => { files.push(p); return read(p); };

  const issuers = track(path.join(cat, 'issuers.yaml'));
  const entitlement_types = track(path.join(cat, 'entitlement-types.yaml'));
  const spend_categories = track(path.join(cat, 'spend-categories.yaml'));
  const currencies = list(path.join(cat, 'currencies')).map(track);

  // OCCB_CARDS=id1,id2 loads only those cards, so work on a few cards can be validated in isolation.
  const only = process.env.OCCB_CARDS ? process.env.OCCB_CARDS.split(',').map(s => s.trim()).filter(Boolean) : null;
  const cards = fs.readdirSync(path.join(cat, 'cards')).sort()
    .filter(dir => fs.existsSync(path.join(cat, 'cards', dir, 'card.yaml')))
    .filter(dir => !only || only.includes(dir))
    .map(loadCard);
  function loadCard(dir) {
    const base = path.join(cat, 'cards', dir);
    const erPath = path.join(base, 'earn-rules.yaml');
    return {
      ...track(path.join(base, 'card.yaml')),
      benefits: list(path.join(base, 'benefits')).map(track),
      earn_rules: fs.existsSync(erPath) ? track(erPath).rules ?? [] : [],
      releases: list(path.join(base, 'releases')).map(track)
    };
  }

  // Variants inherit from their base card (tools/variants.mjs). Loading only some cards still loads the bases they need.
  if (only) for (const card of [...cards]) {
    const b = card.based_on?.card;
    if (b && !cards.some(c => c.id === b) && fs.existsSync(path.join(cat, 'cards', b, 'card.yaml'))) cards.push(loadCard(b));
  }

  if (expand) {
    // Plain cards expand first; variants then inherit from their expanded base and expand their own records.
    const problems = [];
    for (const card of cards.filter(c => !c.based_on)) expandCard(card);
    for (const [i, card] of cards.entries()) if (card.based_on) {
      const base = cards.find(c => c.id === card.based_on.card);
      if (!base) { problems.push(`${card.id}: based_on names unknown card ${card.based_on.card}`); continue; }
      if (base.based_on) { problems.push(`${card.id}: based_on names ${base.id}, which is itself a variant`); continue; }
      cards[i] = expandCard(expandVariant(card, base, problems));
    }
    Object.defineProperty(cards, '_variantProblems', { value: problems, enumerable: false });
  }

  function expandCard(card) {
    {
      const prov = card.provenance;
      const tz = issuers.find(i => i.id === card.issuer_id)?.tz;
      const rel = new Map(card.releases.map(r => [r.id, r]));
      card.releases = card.releases.map(r => withProvenance(r, prov));
      card.benefits = card.benefits.map(b => ({
        ...b,
        versions: b.versions.map(v0 => {
          const v = withProvenance(v0, prov);
          v.period = { cadence: 'ongoing', ...(v.period ?? {}) };
          if (!v.period.tz && tz) v.period.tz = tz;
          if (v.effective_from === undefined && rel.has(v.release)) v.effective_from = rel.get(v.release).effective_for_new;
          v.grants = (v.grants ?? []).map(g => g.combine ? g : { ...g, combine: entitlementType(entitlement_types, g.entitlement)?.combine });
          return v;
        })
      }));
      card.earn_rules = card.earn_rules.map(r => ({ ...r, versions: r.versions.map(v => withProvenance(v, prov && { sources: prov.sources })) }));
    }
    return card;
  }

  const bundle = {
    occb: SPEC_VERSION,
    issuers,
    cards,
    currencies,
    entitlement_types,
    spend_categories
  };
  Object.defineProperty(bundle, '_files', { value: files, enumerable: false });
  return bundle;
}

export function loadDirectory(root = ROOT) {
  const dir = path.join(root, 'directory');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(sub => list(path.join(dir, sub)).map(p => ({ file: p, venue: read(p) })));
}

/**
 * Load a value set (spec section 11): what perks and points are worth to some publisher or user. Value sets are inputs
 * to valuation, never part of the catalog; examples/value-sets holds an example one.
 */
export function loadValueSet(dir = path.join(ROOT, 'examples', 'value-sets')) {
  const file = name => path.join(dir, name);
  return {
    benefit_values: fs.existsSync(file('benefit-values.yaml')) ? read(file('benefit-values.yaml')) : undefined,
    valuations: fs.existsSync(file('valuations.yaml')) ? read(file('valuations.yaml')) : undefined,
    finance: fs.existsSync(file('finance.yaml')) ? read(file('finance.yaml')) : undefined
  };
}

