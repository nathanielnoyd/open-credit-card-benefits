// Lists cards in the order they most need rechecking: least recently checked first, then lowest confidence.
//
//   npm run stale                 # table of every card
//   npm run stale -- --limit 10   # the ten most in need of a check
//   npm run stale -- --json       # machine-readable, for agents and scripts
//
// "Last checked" is the newest `last_reviewed` or source `retrieved_at` on any of the card's records.
// "Low" counts facts with confidence below 0.6. "Human" is true when any record is `verified_by: human:*`.
import { loadCatalog } from './load.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;

const rows = loadCatalog().cards.map(card => {
  const records = [
    card.provenance ?? {},
    ...card.releases,
    ...card.benefits.flatMap(b => b.versions),
    ...card.earn_rules.flatMap(r => r.versions)
  ];
  const dates = records.flatMap(r => [r.last_reviewed, ...(r.sources ?? []).map(s => s.retrieved_at)]).filter(Boolean);
  const confidences = records.map(r => Number(r.confidence)).filter(Number.isFinite);
  return {
    card_id: card.id,
    last_checked: dates.sort().at(-1) ?? null,
    min_confidence: confidences.length ? Math.min(...confidences) : null,
    low_confidence_facts: confidences.filter(c => c < 0.6).length,
    human_reviewed: records.some(r => String(r.verified_by ?? '').startsWith('human')),
    url: card.url ?? null
  };
});

rows.sort((a, b) => (a.last_checked ?? '').localeCompare(b.last_checked ?? '') || (a.min_confidence ?? 0) - (b.min_confidence ?? 0) || a.card_id.localeCompare(b.card_id));
const out = rows.slice(0, limit);

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const w = Math.max(...out.map(r => r.card_id.length), 7);
  console.log(`${pad('card', w)}  last checked  min conf  low  human`);
  for (const r of out) console.log(`${pad(r.card_id, w)}  ${pad(r.last_checked ?? '-', 12)}  ${pad(r.min_confidence ?? '-', 8)}  ${pad(r.low_confidence_facts, 3)}  ${r.human_reviewed ? 'yes' : 'no'}`);
}
