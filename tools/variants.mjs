// Card variants (docs/design/card-variants.md): an authoring shorthand for a card the issuer sells as another card
// plus or minus a few terms, such as the Platinum Card for Morgan Stanley. A variant is its own product with its own
// IDs; `based_on` only saves copying the base card's records. Loading expands it, so published files stay explicit.
//
// The variant's card.yaml names its base:
//
//   based_on:
//     card: us.amex.platinum
//     exclude: [us.amex.platinum/lululemon]          # base records the variant doesn't have (benefits or earn rules)
//     not_followed:                                   # base releases that didn't reach the variant, with the reason
//       - { release: us.amex.platinum@2026-10-01, reason: ... }
//
// Every base release is either followed by one of the variant's releases (`follows: <base release id>`) or listed in
// `not_followed`. A following release ships the base release's changes for the variant, remapped to the variant's
// IDs, plus any changes of its own; its own entry for a target replaces the base's. Fields it leaves out (kind,
// dates, notes, transition, legacy, sources) come from the base release. A benefit or earn rule in the variant's own
// folder with the same slug as a base record replaces that record; one with a new slug is the variant's own.

const slug = id => id.slice(id.indexOf('/') + 1);
const INHERITED_CARD_FIELDS = ['issuer_id', 'network', 'segment', 'tier', 'family', 'earns', 'cobrand', 'fee_posting', 'card_material', 'selections'];

/** Expand one variant against its already-expanded base. Returns a new card object; problems go to `problems`. */
export function expandVariant(variant, base, problems = []) {
  const v = variant.id, b = base.id;
  const spec = variant.based_on;
  const out = { ...variant };
  for (const k of INHERITED_CARD_FIELDS) if (out[k] === undefined && base[k] !== undefined) out[k] = base[k];

  // Which variant release follows each base release.
  const follower = new Map();
  for (const r of variant.releases) if (r.follows) {
    if (follower.has(r.follows)) problems.push(`${v}: base release ${r.follows} is followed twice`);
    follower.set(r.follows, r);
  }
  const baseRel = new Map(base.releases.map(r => [r.id, r]));
  for (const id of follower.keys()) if (!baseRel.has(id)) problems.push(`${v}: follows ${id}, which is not a release of ${b}`);
  const declined = new Set((spec.not_followed ?? []).map(x => x.release));
  for (const r of base.releases) if (!follower.has(r.id) && !declined.has(r.id))
    problems.push(`${v}: base release ${r.id} is neither followed nor listed in based_on.not_followed`);

  const excluded = new Set(spec.exclude ?? []);
  for (const id of excluded) if (!base.benefits.some(x => x.id === id) && !base.earn_rules.some(x => x.id === id))
    problems.push(`${v}: excludes ${id}, which is not a benefit or earn rule of ${b}`);
  const ownBenefit = new Set(variant.benefits.map(x => slug(x.id)));
  const ownRule = new Set(variant.earn_rules.map(x => slug(x.id)));

  // Copy a base record whose versions are shipped by followed releases, renumbering versions from 1.
  const versionMap = new Map(); // "<base target>#<base version>" -> new version number
  const inherit = (rec, kind) => {
    const kept = rec.versions.filter(x => follower.has(x.release));
    if (!kept.length) return null;
    const versions = kept.map((x, i) => {
      versionMap.set(`${kind}:${rec.id}#${x.version}`, i + 1);
      const f = follower.get(x.release), fromBase = baseRel.get(x.release);
      const copy = { ...x, version: i + 1, release: f.id };
      if (kind === 'benefit') {
        // Dropping versions shipped by declined releases can make a later version the first one.
        if (i === 0) { delete copy.supersedes; copy.change_type = 'added'; } else copy.supersedes = i;
        if (i > 0 && copy.change_type === 'added') copy.change_type = 'terms_changed';
      }
      if (x.effective_from === fromBase.effective_for_new) copy.effective_from = f.effective_for_new;
      return copy;
    });
    return { ...rec, id: `${v}/${slug(rec.id)}`, ...(rec.card_id ? { card_id: v } : {}), based_on: rec.id, versions };
  };
  const inheritedBenefits = base.benefits.filter(x => !excluded.has(x.id) && !ownBenefit.has(slug(x.id))).map(x => inherit(x, 'benefit')).filter(Boolean);
  const inheritedRules = base.earn_rules.filter(x => !excluded.has(x.id) && !ownRule.has(slug(x.id))).map(x => inherit(x, 'earn_rule')).filter(Boolean);
  out.benefits = [...inheritedBenefits, ...variant.benefits];
  out.earn_rules = [...inheritedRules, ...variant.earn_rules];

  // A following release: the base release's changes for inherited records and fees, then the variant's own.
  const remapTarget = t => {
    const [kind, ...rest] = t.split(':');
    const id = rest.join(':');
    if ((kind === 'benefit' || kind === 'earn_rule') && id.startsWith(b + '/')) return `${kind}:${v}/${slug(id)}`;
    return t;
  };
  const inheritedIds = new Set([...inheritedBenefits.map(x => `benefit:${x.based_on}`), ...inheritedRules.map(x => `earn_rule:${x.based_on}`)]);
  out.releases = variant.releases.map(r => {
    if (!r.follows || !baseRel.has(r.follows)) return r;
    const f = baseRel.get(r.follows);
    const own = new Set((r.changes ?? []).map(ch => ch.target));
    const fromBase = f.changes.flatMap(ch => {
      const isRecord = ch.target.startsWith('benefit:') || ch.target.startsWith('earn_rule:');
      if (isRecord && !inheritedIds.has(ch.target)) return [];
      const target = remapTarget(ch.target);
      if (own.has(target)) return [];
      if (!isRecord || ch.version == null) return [{ ...ch, target }];
      const version = versionMap.get(`${ch.target}#${ch.version}`);
      return version ? [{ ...ch, target, version }] : [];
    });
    const remapRules = rules => rules?.map(t => ({ ...t, applies_to: t.applies_to.map(remapTarget) }));
    const merged = { ...f, ...r, card_id: v, changes: [...fromBase, ...(r.changes ?? [])] };
    if (!r.transition && f.transition) merged.transition = remapRules(f.transition);
    if (!r.sources) merged.sources = f.sources;
    for (const k of ['transition_amounts']) if (r[k] === undefined && f[k] !== undefined) merged[k] = f[k];
    if (r.announced_on === undefined && r.first_seen_on === undefined) {
      if (f.announced_on) merged.announced_on = f.announced_on;
      if (f.first_seen_on) merged.first_seen_on = f.first_seen_on;
    }
    // A following release only takes the base's notes when it has none; its id and dates are always its own.
    merged.id = r.id; merged.effective_for_new = r.effective_for_new; merged.follows = r.follows;
    return merged;
  });
  return out;
}
