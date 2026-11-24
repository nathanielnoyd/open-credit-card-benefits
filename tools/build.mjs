// Compiles the YAML catalog into dist/catalog.json and the normative CSV projection (spec section 14).
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, loadDirectory, loadValueSet, ROOT } from './load.mjs';
import { resolveTerms, describeEarnRule, money as fmtMoney } from '../src/index.ts';
import { holds } from '../src/value.ts';

const out = path.join(ROOT, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'csv'), { recursive: true });
const cat = loadCatalog();
const directory = loadDirectory().map(d => d.venue);
const write = (rel, data) => { const p = path.join(out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); };
const version = process.env.CATALOG_VERSION || new Date().toISOString().slice(0, 10);
// The catalog data is CC BY 4.0; every bundle says so, with the attribution to give.
const LICENSE = { id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Open Credit Card Benefits contributors (https://github.com/nathanielnoyd/open-credit-card-benefits)' };
write('catalog.json', { ...cat, catalog_version: version, license: LICENSE });
write('directory.json', directory);
// The example value set (docs/value-sets.md): one publisher's opinions, shipped separately from the facts so apps can start from it.
write('value-sets/example.json', { ...loadValueSet(), license: LICENSE });
// Each card file carries `current`: the terms a new applicant gets on the build date, resolved from releases,
// so consumers that only need today's card never replay release history.
const today = version.match(/^\d{4}-\d{2}-\d{2}$/) ? version : new Date().toISOString().slice(0, 10);
const current = card => {
  const t = resolveTerms(cat, card.id, { opened_on: today }, today);
  return { as_of: today, fees: t.fees, benefits: t.benefits.map(({ applied_on, ...b }) => b), earn_rules: t.earn_rules.map(({ applied_on, ...e }) => e), unlocks: unlocks(card) };
};
// Redemption paths that holding this card opens (paths whose `requires` this card meets on its own), grouped by
// currency and kind, with the other cards that open the same paths. Apps show these as rows such as "points transfer
// to partners"; the valuation engine already counts them through the transfer graph (spec section 11).
function unlocks(card) {
  const groups = new Map();
  for (const cur of cat.currencies) for (const p of cur.paths) {
    if (!p.requires?.length || (p.effective_from && p.effective_from > today) || (p.effective_to && p.effective_to < today)) continue;
    const opens = ids => p.requires.every(c => holds(cat, new Set(ids), c));
    if (!opens([card.id])) continue;
    const key = `${cur.id} ${p.kind} ${JSON.stringify(p.requires)}`;
    if (!groups.has(key)) groups.set(key, { currency: cur.id, kind: p.kind, paths: [], partners: [], also_opened_by: cat.cards.filter(o => o.id !== card.id && opens([o.id])).map(o => o.id), note: p.requires.map(c => c.note).find(Boolean) });
    const g = groups.get(key);
    g.paths.push(p.id);
    if (p.to) g.partners.push(p.to);
    if (p.ratio) g.ratios = [...new Set([...(g.ratios ?? []), p.ratio])];
  }
  return [...groups.values()].map(g => Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))));
}
for (const card of cat.cards) write(`cards/${card.id}.json`, { ...card, current: current(card) });
// A small index for search and pickers: one row per card with today's headline terms.
write('cards.json', cat.cards.map(card => {
  const c = current(card);
  return { id: card.id, name: card.name, issuer_id: card.issuer_id, network: card.network, segment: card.segment, tier: card.tier, earns: card.earns,
    cobrand: card.cobrand?.partner, open_to_applicants: card.open_to_applicants, url: card.url, aliases: card.aliases,
    based_on: card.based_on?.card, related: card.related,
    summary: card.summary, annual_fee: c.fees.annual ?? null, benefit_count: c.benefits.length,
    fact_sheet: `cards/${card.id}.md`, data: `cards/${card.id}.json` };
}));
// Newest-first feed of every release, for consumers that only need to know what changed.
write('releases.json', cat.cards.flatMap(c => c.releases.map(r => ({ ...r, card_name: c.name })))
  .sort((a, b) => b.effective_for_new.localeCompare(a.effective_for_new) || a.id.localeCompare(b.id)));
write('index.json', {
  occb: cat.occb, catalog_version: version, license: LICENSE,
  files: { catalog: 'catalog.json', index: 'cards.json', llms: 'llms.txt', llms_full: 'llms-full.txt', benefits: 'benefits.jsonl', glossary: 'glossary.json', directory: 'directory.json', releases: 'releases.json', example_value_set: 'value-sets/example.json', cards: cat.cards.map(c => `cards/${c.id}.json`), csv: 'csv/' }
});

// Agent-readable fact sheets: one Markdown page per card with today's terms in plain language, plus llms.txt
// (https://llmstxt.org) as the entry point. Both are generated from the same data as the JSON, so they never drift.
const NOTICE = 'Assembled from issuer pages and published reviews; not issuer terms. Check the issuer before relying on a figure.';
const KIND_ORDER = ['statement_credit', 'certificate', 'anniversary', 'milestone', 'access', 'membership', 'status', 'program_access', 'fee_waiver', 'redemption_modifier', 'protection', 'other'];
const KIND_TITLE = { statement_credit: 'Credits', certificate: 'Certificates', anniversary: 'Anniversary rewards', milestone: 'Spend milestones', access: 'Lounge access', membership: 'Memberships', status: 'Elite status', program_access: 'Programs', fee_waiver: 'Fee waivers and travel perks', redemption_modifier: 'Redemption perks', protection: 'Protections', other: 'Other benefits' };
const issuerName = id => cat.issuers.find(i => i.id === id)?.name ?? id;
const currencyName = id => cat.currencies.find(c => c.id === id)?.name ?? id;
function factSheet(card) {
  const c = current(card);
  const lines = [`# ${card.name}`, '', card.summary ?? '', ''];
  const fee = c.fees.annual ? (c.fees.annual.amount ? `${fmtMoney(c.fees.annual)} a year` : 'No annual fee') : 'Unknown';
  lines.push(`- Card ID: \`${card.id}\``, `- Issuer: ${issuerName(card.issuer_id)} (${card.network}, ${card.segment})`,
    `- Annual fee: ${fee}`);
  const au = c.fees.authorized_user;
  if (au) lines.push(`- Authorized users: ${!au.amount ? 'free' : au.free_count ? `first ${au.free_count === 1 ? 'one' : au.free_count} free, then ${fmtMoney(au)} each` : `${fmtMoney(au)} each`}`);
  const cardName = id => cat.cards.find(x => x.id === id)?.name ?? id;
  if (card.based_on) lines.push(`- Variant of: [${cardName(card.based_on.card)}](${card.based_on.card}.md). It is its own product; its terms below include that card's, and perks marked "this card only" are its own`);
  const RELATION = { business_counterpart: 'Business version', personal_counterpart: 'Personal version', variant: 'Variant', replaced: 'Replaced', replaced_by: 'Replaced by' };
  for (const r of card.related ?? []) if (!(card.based_on && r.card_id === card.based_on.card)) lines.push(`- ${RELATION[r.relation]}: [${cardName(r.card_id)}](${r.card_id}.md)`);
  lines.push(`- Earns: ${currencyName(card.earns)} (\`${card.earns}\`)`);
  if (card.cobrand) lines.push(`- Co-brand partner: ${card.cobrand.partner}`);
  if (card.open_to_applicants === false) lines.push(`- Closed to new applicants${card.closed_to_applicants_on ? ` since ${card.closed_to_applicants_on}` : ''}`);
  if (card.url) lines.push(`- Issuer page: ${card.url}`);
  lines.push(`- Terms as of: ${c.as_of}`, '', '## Earning', '');
  for (const r of c.earn_rules) lines.push(`- ${describeEarnRule(cat, card.earns, r)}`);
  for (const kind of [...KIND_ORDER, ...new Set(c.benefits.map(b => b.kind).filter(k => !KIND_ORDER.includes(k)))]) {
    const bs = c.benefits.filter(b => b.kind === kind);
    if (!bs.length) continue;
    lines.push('', `## ${KIND_TITLE[kind] ?? kind}`, '');
    for (const b of bs) lines.push(`- **${b.name}**: ${b.summary ?? b.notes ?? ''}${card.based_on && !b.based_on ? ' This card only.' : ''} (\`${b.id}\`)`);
  }
  if (c.unlocks.length) {
    lines.push('', '## Points options this card opens', '');
    for (const u of c.unlocks) {
      const ratio = u.ratios?.length === 1 ? ` at ${u.ratios[0]}` : '';
      const what = u.kind === 'transfer' ? `transfers${ratio} to ${u.partners.length} partner${u.partners.length > 1 ? 's' : ''} (${u.partners.map(currencyName).join(', ')})` : `${u.kind.replace(/_/g, ' ')} redemptions (${u.paths.join(', ')})`;
      const also = u.also_opened_by?.length ? `; also opened by ${u.also_opened_by.map(id => cat.cards.find(x => x.id === id).name).join(', ')}` : '; only this card opens it';
      lines.push(`- ${currencyName(u.currency)}: ${what}${also}.`);
    }
  }
  if (card.notes) lines.push('', '## Notes', '', card.notes);
  const sources = [...new Map([...(card.provenance?.sources ?? []), ...c.benefits.flatMap(b => b.sources ?? [])].map(x => [x.url, x])).values()].slice(0, 12);
  lines.push('', '## Sources', '', ...sources.map(x => `- ${x.url}`), '', `_${NOTICE} Confidence ${card.provenance?.confidence ?? 'unstated'}; last reviewed ${card.provenance?.last_reviewed ?? 'unknown'}._`, '');
  return lines.join('\n');
}
for (const card of cat.cards) {
  const p = path.join(out, 'cards', `${card.id}.md`);
  fs.writeFileSync(p, factSheet(card));
}
const byIssuer = [...new Set(cat.cards.map(c => c.issuer_id))].sort();
fs.writeFileSync(path.join(out, 'llms.txt'), [
  '# Open Credit Card Benefits (OCCB): US credit card benefits and rewards data',
  '',
  `> Structured, sourced data on ${cat.cards.length} US credit cards: fees, earn rates, credits, lounges, status, protections, points currencies and how terms changed over time. ${NOTICE}`,
  '',
  'Use `cards.json` to find a card, then read its fact sheet (Markdown, plain language) or its JSON file (full structured terms with history). Money is in cents; IDs are stable. The JSON Schemas and spec define every field.',
  '',
  `License: the data is ${LICENSE.id} (${LICENSE.url}); credit "${LICENSE.attribution}". It describes card terms; it is not financial advice, and OCCB is not affiliated with any issuer.`,
  '',
  '## Start here',
  '',
  '- [Card index](cards.json): every card with its fee, summary and file links',
  '- [Full catalog](catalog.json): every card, currency, release and registry in one file',
  '- [Release feed](releases.json): every dated change, newest first',
  '- [Glossary](glossary.json): what every kind, key, category, condition and currency means',
  '- [Benefits](benefits.jsonl): one row per current benefit, for search indexes',
  '- [Everything as text](llms-full.txt): every fact sheet in one file',
  '- [Specification](https://github.com/nathanielnoyd/open-credit-card-benefits/blob/main/spec/SPEC.md)',
  '',
  ...byIssuer.flatMap(iid => ['', `## ${issuerName(iid)}`, '', ...cat.cards.filter(c => c.issuer_id === iid).map(c => `- [${c.name}](cards/${c.id}.md): ${c.summary ?? ''}`)]),
  ''
].join('\n'));

// llms-full.txt: every fact sheet in one file, so one fetch gives a model the whole catalog.
fs.writeFileSync(path.join(out, 'llms-full.txt'), cat.cards.map(factSheet).join('\n---\n\n'));

// benefits.jsonl: one self-contained row per current benefit, for search and retrieval indexes.
fs.writeFileSync(path.join(out, 'benefits.jsonl'), cat.cards.flatMap(card => current(card).benefits.map(b => JSON.stringify({
  card_id: card.id, card_name: card.name, issuer: issuerName(card.issuer_id), segment: card.segment,
  benefit_id: b.id, kind: b.kind, name: b.name, summary: b.summary ?? null,
  face_value: b.face_value ?? null, cadence: b.period?.cadence ?? null,
  entitlements: b.grants.map(g => g.entitlement), confidence: b.confidence ?? null, last_reviewed: b.last_reviewed ?? null,
  sources: (b.sources ?? []).map(x => x.url), as_of: today
}))).join('\n') + '\n');

// glossary.json: plain-language meanings of every code an agent may meet, so it never has to guess.
const KIND_MEANING = {
  statement_credit: 'Money back on the statement for eligible purchases, usually up to a set amount per period.',
  membership: 'A membership the card pays for or includes, such as Priority Pass, CLEAR or DashPass.',
  status: 'Elite status in a hotel, airline or car rental program while you hold the card.',
  access: 'Airport lounge access granted directly by the card.',
  program_access: 'Entry to a booking program or perk scheme with no fixed dollar amount, such as a hotel collection.',
  certificate: 'A one-time award such as a free night or companion fare, issued on a schedule.',
  protection: 'Insurance or coverage that applies when the purchase or trip is paid with the card.',
  redemption_modifier: 'Makes points worth more when redeemed a certain way, such as a rebate or a portal boost.',
  fee_waiver: 'A fee the card waives, such as checked bags or foreign transaction fees.',
  milestone: 'A reward for reaching a spending threshold.',
  anniversary: 'A reward given each card year, such as anniversary points.',
  other: 'A perk not yet modeled with structured fields; read its summary and notes.'
};
const CONDITION_MEANING = {
  enrollment_required: 'You must enroll or activate before it works.', booking_channel: 'Only through a named booking channel, such as the issuer’s travel portal.',
  merchant_in: 'Only at the named merchants.', min_nights: 'Only on stays of at least this many nights.', same_day_flight: 'Only with a same-day boarding pass, optionally on named airlines.',
  fare_class_not_in: 'Not on the listed fare classes, such as basic economy.', access_window_hours: 'Only within this many hours before departure.',
  paid_with_card: 'Only when the purchase or trip was paid with this card.', payment_method: 'Only when paid a particular way, such as with Apple Pay.',
  selection_is: 'Only when the cardholder chose this option.', beneficiary_role: 'Only for these people, such as the primary cardholder.',
  spend_gte: 'Only after spending at least this much in the period.', wallet_holds: 'Only if you also hold a named card or card family.',
  region: 'Only in these countries.', date_window: 'Only between these dates.', card_year: 'Only in these card years.',
  min_transaction: 'Only on single purchases of at least this amount.', any_of: 'Any one of the listed conditions is enough.'
};
write('glossary.json', {
  as_of: today,
  money: 'Amounts are integers in minor units (cents for USD) with a currency code.',
  benefit_kinds: KIND_MEANING,
  conditions: CONDITION_MEANING,
  entitlements: Object.fromEntries(cat.entitlement_types.map(e => [e.id, { name: e.name ?? null, description: e.description ?? null, combine: e.combine, tiers: e.tiers }])),
  spend_categories: Object.fromEntries(cat.spend_categories.map(c => [c.id, { name: c.name, parent: c.parent ?? null, description: c.description ?? null }])),
  currencies: Object.fromEntries(cat.currencies.map(c => [c.id, { name: c.name, kind: c.kind, issuer: c.issuer ?? null }])),
  issuers: Object.fromEntries(cat.issuers.map(i => [i.id, i.name]))
});

const cell = v => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function csv(name, cols, rows) {
  fs.writeFileSync(path.join(out, 'csv', `${name}.csv`), [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n');
}
const money = (prefix, m) => ({ [`${prefix}_amount`]: m?.amount ?? '', [`${prefix}_currency`]: m?.currency ?? '' });

csv('cards', ['id', 'issuer_id', 'name', 'network', 'segment', 'family', 'tier', 'earns', 'open_to_applicants', 'url', 'cobrand_partner', 'cobrand_program'], cat.cards.map(c => ({ ...c, cobrand_partner: c.cobrand?.partner, cobrand_program: c.cobrand?.program })));
const bv = [], grants = [], conds = [], rels = [], changes = [], transitions = [], earn = [];
for (const c of cat.cards) {
  for (const b of c.benefits) for (const v of b.versions) {
    const key = { benefit_id: b.id, version: v.version };
    bv.push({ ...key, card_id: b.card_id, kind: b.kind, name: b.name, change_type: v.change_type, release: v.release, effective_from: v.effective_from, effective_to: v.effective_to, enroll_by: v.enroll_by, unlocked_only: v.unlocked_only, ...money('face_value', v.face_value), 'period.cadence': v.period.cadence, 'period.anchor': v.period.anchor, 'period.n': v.period.n, 'limit.amount': v.limit?.amount, 'limit.count': v.limit?.count, 'limit.per_transaction': v.limit?.per_transaction, coverage: v.coverage, waives: v.waives, reward_points: v.reward?.points ?? v.reward_max?.points, reward_currency: v.reward?.currency ?? v.reward_max?.currency, ...money('reward_cash', v.reward_cash), ...money('spend_required', v.spend_required), window_days: v.window_days, beneficiaries: (v.beneficiaries || []).join(' '), notes: v.notes, confidence: v.confidence, source_url: v.sources[0]?.url });
    v.grants.forEach((g, i) => grants.push({ ...key, index: i, entitlement: g.entitlement, combine: g.combine, value_share: g.value_share, stacking_confidence: g.stacking_confidence, attributes: g.attributes }));
    (v.conditions || []).forEach((k, i) => { const { type, note, ...params } = k; conds.push({ ...key, index: i, type, note, params: Object.keys(params).length ? params : null }); });
  }
  for (const r of c.releases) {
    rels.push({ id: r.id, card_id: r.card_id, kind: r.kind, announced_on: r.announced_on, first_seen_on: r.first_seen_on, effective_for_new: r.effective_for_new, notes: r.notes, source_url: r.sources[0]?.url });
    r.changes.forEach((ch, i) => changes.push({ release_id: r.id, index: i, target: ch.target, version: ch.version, change_type: ch.change_type, ...money('to', ch.to), free_count: ch.free_count }));
    (r.transition || []).forEach((t, i) => transitions.push({ release_id: r.id, index: i, applies_to: t.applies_to.join(' '), on: t.on, next_renewal_on_or_after: t.next_renewal_on_or_after }));
  }
  for (const rule of c.earn_rules) for (const v of rule.versions) earn.push({ earn_rule_id: rule.id, version: v.version, card_id: c.id, categories: rule.categories.join(' '), choice: rule.choice, release: v.release, multiplier: v.multiplier, boost: v.boost, stacks: v.stacks, currency: v.currency, ...money('cap', v.cap), cap_period: v.cap_period, cap_group: v.cap_group, conditions: v.conditions, schedule: v.schedule, effective_to: v.effective_to });
}
csv('benefit_versions', Object.keys(bv[0]), bv);
csv('benefit_grants', ['benefit_id', 'version', 'index', 'entitlement', 'combine', 'value_share', 'stacking_confidence', 'attributes'], grants);
csv('benefit_conditions', ['benefit_id', 'version', 'index', 'type', 'note', 'params'], conds);
csv('releases', ['id', 'card_id', 'kind', 'announced_on', 'first_seen_on', 'effective_for_new', 'notes', 'source_url'], rels);
csv('release_changes', ['release_id', 'index', 'target', 'version', 'change_type', 'to_amount', 'to_currency', 'free_count'], changes);
csv('release_transitions', ['release_id', 'index', 'applies_to', 'on', 'next_renewal_on_or_after'], transitions);
csv('earn_rules', ['earn_rule_id', 'version', 'card_id', 'categories', 'choice', 'release', 'multiplier', 'boost', 'stacks', 'currency', 'cap_amount', 'cap_currency', 'cap_period', 'cap_group', 'conditions', 'schedule', 'effective_to'], earn);
csv('entitlement_types', ['id', 'name', 'combine', 'attribute_rules', 'tiers'], cat.entitlement_types);
csv('currencies', ['id', 'name', 'kind', 'issuer', 'cents_per_point', 'expiry', 'url'], cat.currencies);
csv('currency_paths', ['currency_id', 'id', 'kind', 'rate', 'rate_min', 'rate_max', 'rate_expected', 'to', 'ratio', 'requires', 'effective_from', 'effective_to', 'notes'], cat.currencies.flatMap(c => (c.paths ?? []).map(p => ({ currency_id: c.id, ...p }))));
csv('issuers', ['id', 'name', 'region', 'tz', 'url'], cat.issuers);
csv('spend_categories', ['id', 'parent', 'name', 'description', 'mcc'], cat.spend_categories.map(c => ({ ...c, mcc: (c.mcc ?? []).join(' ') })));
csv('venue_access_rules', ['venue_id', 'venue_name', 'airport', 'terminal', 'entitlement', 'guests_free', 'effective_from', 'effective_to', 'notes'], directory.flatMap(v => v.access_rules.map(r => ({ venue_id: v.id, venue_name: v.name, airport: v.airport, terminal: v.terminal, entitlement: r.entitlement, guests_free: r.guests?.free, effective_from: r.effective_from, effective_to: r.effective_to, notes: r.notes }))));
console.log(`Built catalog ${version}: dist/catalog.json, ${cat.cards.length} card files, releases.json, directory.json and ${fs.readdirSync(path.join(out, 'csv')).length} CSV files.`);
