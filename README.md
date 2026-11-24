# Open Credit Card Benefits

[![CI](https://github.com/nathanielnoyd/open-credit-card-benefits/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanielnoyd/open-credit-card-benefits/actions/workflows/ci.yml)

An open draft specification for credit card benefit data, with JSON Schemas, a reference catalog and a reference engine.

## Why this exists

Every app that deals with credit card benefits invents its own way to describe them. Most of those formats break down in the same places:

- **Change over time.** Issuers refresh cards often. New applicants get new terms on one date, and existing cardholders on another, usually at renewal. A format that stores only "current terms" gets most existing cardholders wrong.
- **Overlap.** Many cards cover the same perk, such as Global Entry, Priority Pass or a streaming credit. Without a shared notion of "the same perk", tools add them up and overstate what a set of cards is worth.
- **Facts vs. opinions.** What a card offers and what a point or perk is worth get stored together, so one publisher's valuation becomes part of the data.
- **Provenance.** Facts rarely carry a source, a date or a confidence, so neither a person nor an agent can tell what to trust or when to recheck.

This draft specification addresses each of these. It uses dated releases with rules for when existing cardholders get a change, shared entitlement keys so overlapping perks combine correctly, valuations kept separate from facts, and a source on every record.

## What's here

- **Spec and schemas:** the data model, as a written spec ([`spec/SPEC.md`](spec/SPEC.md)) and JSON Schemas.
- **Reference catalog:** real US cards described in the format, to show it works on actual terms.
- **Reference engine:** a TypeScript library that resolves a cardholder's terms on any date and values a wallet of cards without double-counting overlapping perks.

> [!NOTE]
> The reference catalog exists to exercise the spec. AI agents compiled it from public sources, people haven't reviewed it, and it isn't maintained as an authoritative source. Don't rely on it for actual card terms.

## Install

```sh
npm install github:nathanielnoyd/open-credit-card-benefits
```

Requires Node.js 22.18 or later. The package includes the engine, the schemas and the built reference catalog.

## Quick start

```ts
import { resolveTerms, valueWallet, type Catalog, type Wallet } from 'open-credit-card-benefits';
import data from 'open-credit-card-benefits/catalog.json' with { type: 'json' };

const catalog = data as unknown as Catalog;

// The terms a Sapphire Reserve opened in March 2024 has today
const terms = resolveTerms(catalog, 'us.chase.sapphire-reserve', { opened_on: '2024-03-01' }, '2026-11-24');
terms.fees.annual;      // { amount: 79500, currency: 'USD' }  (money is always in cents)
terms.benefits.length;  // 34

// What two cards are worth together over the next 12 months
const wallet: Wallet = {
  occb: '0.2',
  people: [{ id: 'me' }],
  cards: [
    { id: 'csr', card_id: 'us.chase.sapphire-reserve', holder: 'me', opened_on: '2024-03-01' },
    { id: 'cfu', card_id: 'us.chase.freedom-unlimited', holder: 'me', opened_on: '2022-01-10' }
  ],
  spend_profile: { amounts: { 'cat:dining': 600000, 'cat:all': 2000000 } }
};
valueWallet(catalog, wallet, { asOf: '2026-11-24' }).net;  // cents, after fees and overlap
```

Valuation runs on facts alone unless you pass a **value set**, which holds your opinion of what each perk and point is worth. See [`docs/value-sets.md`](docs/value-sets.md).

## Published files

CI publishes the reference catalog in the spec's distribution formats to GitHub Pages on every push to `main`. Agents start at `llms.txt`. Apps read `cards.json`, the per-card JSON or `catalog.json`. There's also JSONL for search indexes and CSV for spreadsheets.

```
https://nathanielnoyd.github.io/open-credit-card-benefits/v0.3/llms.txt
https://nathanielnoyd.github.io/open-credit-card-benefits/v0.3/catalog.json
```

The full file list is in [`docs/publishing.md`](docs/publishing.md).

## Documentation

| Doc | For |
| --- | --- |
| [`spec/SPEC.md`](spec/SPEC.md) | The draft specification |
| [`docs/engine.md`](docs/engine.md) | Engine API reference |
| [`docs/catalog-format.md`](docs/catalog-format.md) | How cards, benefits and releases are written |
| [`docs/maintaining.md`](docs/maintaining.md) | Changing the spec, schemas and engine; updating the reference catalog; cutting releases |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI agents working in this repository |

All docs are listed in [`docs/`](docs/README.md).

## Development

```sh
npm install
npm run check   # validate the catalog, build, test, typecheck
npm run stale   # cards that most need rechecking
```

## Disclaimer

This isn't financial advice, and it isn't issuer terms. Check with the issuer before relying on a figure. Card and issuer names are trademarks of their owners, and this project is not affiliated with any of them.

## License

- Code and schemas: [Apache 2.0](LICENSE)
- Catalog data and example value sets: [CC BY 4.0](LICENSE-DATA). Credit "Open Credit Card Benefits contributors" with a link to this repository.
- Spec text: [CC BY 4.0](LICENSE-SPEC)
