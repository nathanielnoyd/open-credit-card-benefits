# Changelog

Notable changes to the spec, schemas, engine and tooling. Catalog data changes are recorded as releases in `catalog/` and published in `releases.json`.

## Unreleased

- Framing: the project is a draft specification; the catalog and engine are reference implementations. The README explains the problems the spec addresses, the spec is marked as a draft, and `AGENTS.md` and `docs/maintaining.md` treat catalog updates as optional upkeep of example data.
- Published site: a front page and a root `llms.txt`.

## 0.3.0 — 2026-11-24

- Package: installable from GitHub with `npm install github:nathanielnoyd/open-credit-card-benefits`. The engine compiles to JavaScript with type declarations and has no runtime dependencies. The built catalog ships as `open-credit-card-benefits/catalog.json`, and the other published files as `open-credit-card-benefits/data/*`, including the example value set (`value-sets/example.json`).
- Maintenance: `AGENTS.md`, `docs/maintaining.md` and `docs/engine.md`; `npm run stale` lists the cards that most need rechecking; the validator warns when an open card has no issuer `url`.
- Licensing: catalog data and example value sets under CC BY 4.0 (`LICENSE-DATA`), with the license and attribution in published `index.json`, `catalog.json` and `llms.txt`. Schema IDs moved from the `occb.example` placeholder to the project's Pages URL, where the publish workflow serves the schemas.
- Renamed from Open Card Benefits Specification (OCBS) to Open Credit Card Benefits (OCCB). The package is now `open-credit-card-benefits`, the wallet version key is `occb`, the media type is `application/vnd.occb+json`, and the environment variables are `OCCB_CARDS` and `OCCB_WARNINGS`.
- Authoring shorthand: card-level `provenance`, default `period`, issuer timezone, release `effective_from` and registry `combine` are filled in at load time; published files stay explicit.
- Typed condition parameters: each predicate's required fields are checked. New predicates `card_year` and `min_transaction`; `payment_method` documented.
- Kind-specific benefit fields: `coverage` for protections, `waives`/`count`/`companions` for fee waivers, `cap`/`top_up`/`expires_after_days`/`issued_on` for certificates, `percent_rebate`, `percent_back`, `threshold`, `reward_cash`, `reward_benefit`.
- Earn rules: `choice` (holder-selected, top-spend and rotating categories), `schedule`, `cap_group`, `stacks`, `boost`, per-rule `currency` and `conditions`.
- Fees: `free_count` and percentage `rate` on fee changes.
- Cards: `url`, `aliases`, `cobrand`, `closed_to_applicants_on`, `tier` as an enum.
- Currencies: `airline`, `hotel` and `status_credit` kinds, `cents_per_point`, `issuer`; transfer targets must exist.
- Registries: wildcard entitlement types (`welcome:*`), entitlement names and tiers, spend categories with MCCs and merchant nodes; 93 categories, 194 entitlement types, 62 currencies.
- Engine: caps with overflow to the next-best card, shared caps, choice and rotating categories, stacking and boost rules, status-credit currencies.
- Published files: `cards.json` index and a resolved `current` snapshot in every card file; more CSV columns and tables.
- Agent-facing files: `llms.txt`, `llms-full.txt`, a Markdown fact sheet per card, `glossary.json` and `benefits.jsonl`.
- Plain-language `summary` required on every card and benefit version; earn-rule text generated from the data.
- Category groups in earn choices; percentage fees; open-ended card years; `explicit_only` categories (rent) and `exclude_categories`; unlocks that persist.
- Engine: second-currency earn adds to the main earn and counts toward card choice; path requirements by family and `any_of`; newest valuation wins; cash back doesn't devalue by default; expired terms drop out of resolved terms.
- Validator: implausible amounts, transition targets, choice groups, summaries and figures quoted in them.
- Catalog: 56 US personal and business cards from Amex, Chase, Capital One, Citi, Bank of America, U.S. Bank, Wells Fargo, Discover, Apple and Bilt; complete transfer partners; November 2026 valuations.
- Acquisition offers are out of scope: welcome bonuses, intro APRs, first-year fee waivers and first-year promotions are removed from the catalog (59 records, 49 releases). A separate offer format (Appendix F, `schema/offer.schema.json`) lets card sites, issuers and users publish and record offers: bonuses, fee waivers, intro APRs and intro earn rates. Wallet cards record their holders' offers in `offers`; valuation counts them only for year-one value (`include_offers`). A recorded `fee_paid` replaces the catalog fee for that date.
- Scenario wallets and tests for cashback optimizing, business spend, status chasing, hotel loyalty, rent and lounge overlap.
- Finance assumptions are inputs too: the discount rate, devaluation and holding period come from the user's `finance` or the value set's (`finance.yaml`); the engine no longer assumes 4.5%, 6% and 18 months, applies none when they are missing, and reports them under `unvalued.finance`. The example and conformance value sets carry the former assumptions, so their results are unchanged.
- The catalog no longer carries values: what perks and points are worth is an opinion, so it is an input. `valueWallet`, `valueAdded` and `marginalValues` take `values`, a value set chosen by the app; without one, credits count at face value, perks without one at zero and points at their fixed rate or 1 cent, and the result lists them under `unvalued`. The former defaults are now an example publisher value set in `examples/value-sets` (with its generator), and conformance uses its own frozen value set.
- Default values for every card by the prepay method: 950 perks on 79 cards, with ranges and notes (`tools/default-values.mjs`). New rules for airline cards: the airline's own club as the main lounge network, one-time passes per pass, checked bags, boarding, companion certificates and status credits. Conformance values unchanged (the three-card wallet's cards were already reviewed).
- Default values restated as conservative prepay values, below expected use (`docs/defaults.md`): near-cash credits keep most of face, conditional credits about half of expected use, niche perks next to nothing. Under them the Platinum and Sapphire Reserve no longer pay for themselves on perks at typical values; both depend on the holder. Conformance: the three-card wallet's perks fall from $2,710 to $1,404.
- A perk is worth what its holder would prepay for it on the fee date. Personal values are prepaid amounts by default (`basis: annual` to discount one). Derived credit values deduct the opportunity cost of using them: the earn given up by putting the credit's purchases on that card instead of the wallet's best card for their category (`spend_category` on 84 credit types; `credited_spend_earns: false` on the Sapphire Reserve travel credit). `valueAdded` reports a card's effect on the other cards' perks separately. Conformance net value moved by $13.
- Default perk values reviewed for the Platinum, Business Platinum, Sapphire Reserve (personal and business), Sapphire Preferred and IHG cards by a documented method (`docs/defaults.md`, `tools/default-values.mjs`): each default has a typical value, a `low`/`high` range and a note. Users can value a kind of perk once for every card (`entitlement_values`). The keepers app shows how much a card's unvalued perks must be worth for it to pay for itself, says "depends on you" when the answer turns on them, and lists the questions to ask. Conformance values regenerated: the three-card wallet's perks fell from $4,153 to $2,723 under the reviewed defaults.
- Keepers pressure test rerun on the full catalog (`docs/pressure-tests/keepers.md`): all 48 spreadsheet cards covered with matching fees. United Club Business and Wyndham Earner Business added. Anniversary rewards paid in points are now valued from the currency (they counted as zero without a default). Release transitions can say `never`, for refreshes that existing holders don't get.
- More personal cards from the keepers test: United Club, IHG One Rewards Premier Select, Ritz-Carlton (closed), Marriott Bonvoy Bountiful and Bevy, the Schwab Platinum (a second variant), Citi Prestige (closed) and AAdvantage Globe, Bank of America Premium Rewards Elite and Atmos Summit, U.S. Bank Altitude Reserve (closed) and City National Bank Crystal Visa Infinite (a new issuer and currency), and Wyndham Earner Plus and Premier (the first Barclays cards). Prestige holders get full ThankYou ratios; Altitude transfer paths require the Altitude Reserve; inherited variant benefits fall back to their base benefit's default value.
- Business twins as separate cards: Sapphire Reserve for Business, Delta Reserve, Platinum and Gold Business, United Business, Hilton Business, IHG One Rewards Business and Marriott Bonvoy Business, each with `related` links to its personal counterpart. `wallet_holds` takes a `segment` and a list of tiers; the Hyatt 1:1 path covers both Sapphire Reserves through a family and tier rule, and the Reserve for Business has its own Points Boost path.
- Card variants (`docs/design/card-variants.md`): every separately applied-for card stays its own product; a variant is authored `based_on` its base card and expanded at load time, and each base release must be followed (`follows`) or declined (`not_followed`). Business twins and tiers are separate cards linked by `related`. `wallet_holds` honors `tier`; resolved fees keep `free_count`. Catalog: the Platinum Card Exclusively for Morgan Stanley (the first variant), the Platinum's Saks credit and its 2026 removal, and `related` links between personal and business pairs.
- Keepers pressure test (`docs/pressure-tests/keepers.md`): a keep-or-cancel spreadsheet rebuilt on OCCB as `examples/apps/keepers.ts`.
  - Engine: `valueAdded` values cards against a set the user keeps, perk by perk; custom benefits are now valued; `earn_values` and `basis: present_value` are honored; a multi-grant benefit without shares is split evenly instead of counted per grant.
  - User layer: `earn_values`; `basis` and `note` on personal values; user-scope custom benefits need no release, sources, period or grants, and can name a `wallet_card_id`.
  - Value sets: `publisher` scope, `method` and per-entry `note`.
  - Published files: `current.unlocks` on each card file, and a fact-sheet section listing the points options the card opens.
  - Validator: multi-grant benefits need `value_share` on every grant; `unlocked_only` benefits need something to switch them on.
  - Catalog: airline-scoped award discount and availability keys, a separate second-bag key, one Walmart+ key, value shares on six Capital One benefits. Mismatches with the spreadsheet were added to the review queue, and the remaining gaps to the roadmap.

## 0.2.0 — November 12, 2026

- Benefit versions and card releases with transition, transition-amount and legacy rules.
- Release kinds `baseline`, `refresh` and `change`, and `first_seen_on`.
- New fields and predicates found by modeling three real cards; see spec Appendix B.
- Conformance profiles: catalog publisher, access directory, wallet app and valuation engine.
- Access directory module (Appendix D).
- Seed catalog for the Sapphire Reserve, Sapphire Preferred and Amex Platinum, with release history from 2024.
- Reference engine: terms resolution, wallet valuation, marginal values and upcoming changes.
- Published files: versioned catalog bundle, per-card files, release feed and CSVs on every merge.
- The user layer is defined as an input format for valuation only; storing user data is out of scope.

## 0.1.0

- First draft: catalog and user layers, entitlements and combine rules, valuation and time value.
