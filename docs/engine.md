# Engine API

The engine is a TypeScript library with no runtime dependencies. Every function is pure: you pass the catalog in, and nothing is fetched or cached.

```ts
import { resolveTerms, upcomingChanges, valueWallet, valueAdded, marginalValues, describeEarnRule, money, nextRenewal } from 'open-credit-card-benefits';
import type { Catalog, Wallet, WalletCard, ValueSet, Terms } from 'open-credit-card-benefits';
```

## Conventions

- **Money** is `{ amount, currency }`, with `amount` an integer in minor units (cents). Valuation results are plain numbers in cents.
- **Dates** are ISO `YYYY-MM-DD` strings.
- **IDs:** cards are `us.<issuer>.<slug>` (`us.chase.sapphire-reserve`), benefits are `<card id>/<slug>`, spend categories are `cat:<path>` (`cat:dining`) and currencies are `pts:<program>` (`pts:chase_ur`). `cards.json` and `glossary.json` list them all.
- Every function throws on an unknown card ID.

## Loading data

The package ships the built files, so you can pin to the version you installed:

```ts
import data from 'open-credit-card-benefits/catalog.json' with { type: 'json' };
const catalog = data as unknown as Catalog;

import example from 'open-credit-card-benefits/data/value-sets/example.json' with { type: 'json' };
const values = example as ValueSet;
```

You can also fetch the latest build from `https://nathanielnoyd.github.io/open-credit-card-benefits/v0.3/catalog.json` (see [`publishing.md`](publishing.md)).

## Terms

### `resolveTerms(catalog, cardId, holder, asOf): Terms`

The terms a specific cardholder has on a date. Holders who opened the card earlier often keep old terms until renewal, so the answer depends on `holder.opened_on` (and `holder.fee_post_dates` if known).

```ts
const t = resolveTerms(catalog, 'us.amex.platinum', { opened_on: '2023-05-10' }, '2026-11-24');
t.fees.annual;     // { amount: 89500, currency: 'USD' }
t.fee_rates;       // percentage fees as fractions, such as { foreign_transaction: '0.03' }
t.benefits;        // ResolvedBenefit[]: each version in force, with `summary`, `face_value`, `period`, `conditions`
t.earn_rules;      // ResolvedEarnRule[]: `categories`, `multiplier`, `cap`, ...
t.history;         // the release changes that reached this holder, oldest first
```

For a new applicant, pass `{ opened_on: asOf }`. The published per-card JSON already has this as `current`.

### `upcomingChanges(catalog, cardId, holder, asOf)`

Changes announced but not yet reached by this holder, soonest first: `{ release, target, version?, change_type?, to?, date }[]`.

### `nextRenewal(holder, date): string`

The holder's first renewal (fee) date on or after `date`.

## Valuation

Valuation needs facts (the catalog) and opinions (what perks and points are worth). Opinions come from an optional **value set** (`opts.values`) and from the wallet itself, and the wallet's own values always win. Without any values it falls back to face value and 1 cent per point, and lists everything it guessed under `unvalued`. See [`value-sets.md`](value-sets.md).

### `valueWallet(catalog, wallet, { asOf, horizonMonths?, values? })`

What a set of cards is worth over the horizon (default 12 months), after fees and with overlapping perks counted once.

| Field | Meaning |
| --- | --- |
| `net` | `benefits + earn + offers − fees`, in cents |
| `benefits`, `earn`, `fees`, `offers` | The components |
| `double_count_removed` | What naive per-card totals would have overcounted |
| `cards[]` | Per card: `counted`, `benefits` by benefit ID, `opportunity_cost` |
| `overlaps[]` | Each perk held more than once, and which copy counted |
| `allocation[]` | Which card each spend category was assigned to |
| `points_earned` | By currency |
| `unvalued` | Benefits, currencies and finance assumptions no one supplied a value for, so an app knows what to ask |

### `marginalValues(catalog, wallet, opts): Record<walletCardId, number>`

What each card adds to the rest of the wallet, in cents. A card whose value is below zero isn't paying for itself.

### `valueAdded(catalog, keptWallet, candidates, opts)`

What each candidate card adds beyond the cards the user keeps anyway, perk by perk: `{ wallet_card_id, added, standalone, added_by_benefit, other_cards, ... }[]`. This is the keep-or-cancel question. [`examples/apps/keepers.ts`](../examples/apps/keepers.ts) is a complete app built on it.

## Wallets

A wallet is the user layer (spec section 10). The minimum is people, cards and a spend profile:

```ts
const wallet: Wallet = {
  occb: '0.2',
  people: [{ id: 'me' }],
  cards: [{ id: 'csr', card_id: 'us.chase.sapphire-reserve', holder: 'me', opened_on: '2024-03-01' }],
  spend_profile: { amounts: { 'cat:dining': 600000, 'cat:all': 2000000 } }  // cents a year
};
```

Optional fields: `benefit_values` and `entitlement_values` (the user's own perk values), `valuations` (cents per point), `selections` on a card (such as a chosen airline), `fee_paid` (the actual fees paid after retention offers) and `finance`. The full schema is [`schema/wallet.schema.json`](../schema/wallet.schema.json), and [`examples/`](../examples) has eight complete wallets.

## Text

- `describeEarnRule(catalog, card.earns, rule)` turns a rule into a sentence, such as "4x points on dining, on up to $50,000 a calendar year".
- `money({ amount: 79500, currency: 'USD' })` returns `"$795"`.

## Limits

What the spec describes but the engine doesn't do yet is listed in [`limitations.md`](limitations.md).
