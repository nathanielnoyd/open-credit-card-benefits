# Open Credit Card Benefits

[![CI](https://github.com/nathanielnoyd/open-credit-card-benefits/actions/workflows/ci.yml/badge.svg)](https://github.com/nathanielnoyd/open-credit-card-benefits/actions/workflows/ci.yml)

Structured, sourced data on US credit card benefits, plus a TypeScript engine that answers questions with it.

- **Catalog:** 81 US personal and business cards from 11 issuers. It covers fees, earn rates, statement credits, lounges, protections, points currencies and transfer partners, with dated history and a source on every fact.
- **Engine:** resolves which terms a cardholder has on any date and values a wallet of cards without double-counting overlapping perks. It has no runtime dependencies.
- **Spec and schemas:** the data model, as a written spec and JSON Schemas.

> [!NOTE]
> AI agents compiled the catalog from issuer pages and published reviews, and people haven't reviewed it yet. Use it as a starting point, not as issuer terms. Open issues are listed in [`docs/review-queue.md`](docs/review-queue.md).

## Install

```sh
npm install github:nathanielnoyd/open-credit-card-benefits
```

Requires Node.js 22.18 or later. The package includes the built catalog, so it works offline and stays pinned to the commit you installed.

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

## Use the data without the engine

CI publishes the catalog to GitHub Pages on every push to `main`. Agents start at `llms.txt`. Apps read `cards.json`, the per-card JSON or `catalog.json`. There's also JSONL for search indexes and CSV for spreadsheets.

```
https://nathanielnoyd.github.io/open-credit-card-benefits/v0.3/llms.txt
https://nathanielnoyd.github.io/open-credit-card-benefits/v0.3/catalog.json
```

The full file list is in [`docs/publishing.md`](docs/publishing.md).

## Documentation

| Doc | For |
| --- | --- |
| [`docs/engine.md`](docs/engine.md) | Engine API reference |
| [`docs/catalog-format.md`](docs/catalog-format.md) | How cards, benefits and releases are written |
| [`docs/maintaining.md`](docs/maintaining.md) | Keeping the catalog current: the update loop, adding cards, cutting releases |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI agents working in this repository |
| [`spec/SPEC.md`](spec/SPEC.md) | The full data model |

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
