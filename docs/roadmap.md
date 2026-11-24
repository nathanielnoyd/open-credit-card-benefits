# Roadmap

This plan comes from modeling 56 popular US personal and business cards in November 2026. Sixteen research passes each listed the terms the schema couldn't express; the items below group those reports by theme and rank them by how often they came up and how much they affect answers. v0.3 already closed the most common gaps (Appendix E of the spec). What remains is ordered by priority.

## 1. Agent and app readiness (do first)

The catalog's main consumers will be AI agents and apps that answer questions such as "which card should I use for groceries?" or "is my Reserve still worth $795?". They need data that is quotable, findable, compact and honest about its certainty.

| Change | Why | Status |
| --- | --- | --- |
| Plain-language `summary` on every benefit version and every card, required by the validator | Agents need a sentence they can quote, not fields to reassemble; humans reviewing data need it too | Added in v0.3; being backfilled |
| Generated earn text (`describeEarnRule`) and fee text | Descriptions derived from data can't contradict it | Added in v0.3 |
| Markdown fact sheet per card and `llms.txt` | The cheapest way for a model to read a card: plain text, about a page each, with stable IDs to cite | Added in v0.3 |
| `cards.json` index and resolved `current` terms per card | Most questions are about today's terms for a new applicant, not history | Added in v0.3 |
| Reference MCP server over the published files (`search_cards`, `get_card`, `get_terms`, `best_card_for`, `value_wallet`, `renewal_decision`) | Spec section 14 lists the tools, but nothing implements them; one small reference server makes every agent integration consistent | Next |
| JSON Schemas for those tool inputs and outputs, published with the catalog | Tool-calling models do best with typed arguments and results | Next |
| `glossary.json`: plain-language definitions of every benefit kind, entitlement key, spend category, condition and currency | Lets an agent explain `credit:trusted_traveler` or `cat:groceries.store` without guessing | Added in v0.3 |
| Per-fact provenance in `current`: each benefit's `confidence`, `last_reviewed` and source URLs inline, plus a `stale_after` date | Agents should hedge or recheck low-confidence or stale facts, and cite a source | Next |
| Flatten the published form: `current` should never need registry lookups (inline category and entitlement names) | Fewer joins means fewer agent mistakes | Next |
| Search aids: `aliases` on every card, benefit `tags` (`lounge`, `dining`, `travel_insurance`), and issuer names in the index | Agents search by everyday words, not IDs | Partly done |
| Embedding-ready chunks: one record per benefit with card name, summary and key numbers in a JSONL file | Retrieval systems index rows, not nested documents | Added in v0.3 (`benefits.jsonl`) |
| `llms-full.txt`: every fact sheet in one file | One fetch gives a model the whole catalog | Added in v0.3 |
| Stable published URLs with ETags, and `catalog_version` in every file | Agents can cache safely and know when to refresh | Partly done |

## 2. Data quality

| Change | Why |
| --- | --- |
| Human review of every card, starting with the most widely held; record `verified_by: human:<id>` | Every card was researched by an AI agent from reviews; issuer pages for Amex and Chase often failed to load, so many facts rest on secondary sources |
| Raise or remove the lowest-confidence facts (below 0.6), mostly protection amounts on business cards and protections from a single review | Wrong coverage numbers are worse than missing ones |
| Sources on every version (not just card defaults) with `publisher: issuer` where possible, and `excerpt_hash` for change detection | Agents and reviewers can check each fact against its page |
| Validator sanity checks: implausible amounts (added), summaries that disagree with fields (numbers in the summary must appear in the data), duplicate entitlement keys that mean the same perk | Catches the cents/dollars and drift errors seen during research |
| Agent watcher: scheduled check of each card's issuer page that opens a pull request with a new release when terms change | Card terms changed on 30+ of the 56 cards in 2025–2026 |

## 3. Schema gaps found during research

Ranked by how many cards needed them. Each currently lives in `notes` with `machine_readable: false`.

**High (several issuers, affects valuation)**

- **Percentage foreign transaction fees in the data.** The `rate` field exists now; every card without a waiver should record `fee:foreign_transaction`.
- **Coverage that varies by situation**: rental cover that is primary abroad or for business use and secondary otherwise; trip cancellation vs interruption limits; per-ticket, per-bag-type and per-day limits; claim windows (Chase, Citi, Amex, Capital One).
- **Unlocks and status that take effect next period** and last into the following year (`persists_periods` exists; add `starts: next_period`).
- **External prerequisites**: a condition that the holder has an outside membership (Amazon Prime, Costco) or another benefit active (Instacart+).
- **Spend-after-threshold earn** (5x after $150,000) and **step rewards** (2,500 points per $5,000; $2,000 per $500,000).
- **Milestones with several rewards or tiers**, thresholds in points as well as dollars (Loyalty Points), and reward menus (Marriott Earned Choice).
- **Status credits that combine across cards only within limits** (Marriott: one personal plus one business card).
- **Paid add-ons**: authorized-user lounge access for $125, guest fees, group authorized-user fees.

**Medium**

- Award discounts and certificates denominated in miles off or percent off (United, Delta TakeOff 15, Southwest).
- Companion fare rules: cabin, region, co-pay and tax caps.
- Time-of-day and day-of-week earn (Citi Nights).
- Earn that costs another currency (Bilt Cash spent to unlock points) and earn that depends on a spend ratio (Bilt housing).
- Transitions that differ by holder: by tenure, by account age, by renewal window, opt-out elections, and per-member dates.
- Rewards paid as restricted credit (airline eCredits, travel-portal credits, gift cards); `reward_cash` with `restricted_to`.
- Merchant-scoped spend thresholds (Dell credit after $5,000 at Dell) and credits triggered by counts (three rides a month).
- Trials and introductory memberships with a duration and a new-members-only rule.
- Rotating-calendar entries with their own announcement and activation dates.

**Low**

- Intro APR and installment financing (consider a separate `financing` record, outside benefits).
- Issuer history (Apple Card moving from Goldman Sachs to JPMorgan Chase), networks chosen by the issuer.
- Transfer bonuses, minimum transfers and transfer fees on currency paths; partner programs without a points currency (Omni).
- Pay-per-use services (roadside dispatch) and on-property vouchers as their own kinds.

**Found by the keepers pressure test** (`docs/pressure-tests/keepers.md`), ranked by how much they change keep-or-cancel answers:

- **Card variants.** Done (`docs/design/card-variants.md`): variants such as the Morgan Stanley Platinum are authored `based_on` their base and must follow or decline each base release; business twins and tiers stay separate cards linked by `related`. Eight business twins are now separate cards (Sapphire Reserve, Delta Reserve, Platinum and Gold, United, Hilton, IHG and Marriott Bonvoy Business), and the Reserves' shared Hyatt 1:1 path is a family and tier rule. Next: the Schwab Platinum; United Club Business and Wyndham Earner Business once their personal card and issuer are in the catalog; a reviewed `tier` vocabulary.
- **Closed products people still hold.** A keep-or-cancel app serves existing holders. Citi Prestige and the Ritz-Carlton card are closed to applicants but widely held, and a currency path can only name them in prose until they have IDs.
- **Product-change options.** The alternative to cancelling is often a downgrade that keeps points and credit history (Sapphire to Freedom, Boundless to the Ritz-Carlton card by upgrade). Proposal: `product_change_to: [{card_id, direction, conditions}]` on cards, with sources.
- **Issuer-wide programs.** Amex Offers, cruise programs and referral rewards apply to every card of an issuer. Copied onto each card they depend on every author choosing the same key; left out, apps can't show them. Proposal: issuer-level benefit records that cards inherit, with combine `any`.
- **Referrer rewards.** Refer-a-friend bonuses for the existing cardholder (per referral, capped per year) have no home; Appendix F covers only the applicant's side.
- **Outside relationships.** Brokerage and banking relationships gate real value: Schwab's 1.1¢ cash-out and asset-tiered credit, Morgan Stanley's engagement bonus, Citigold rebates, Amex Business Checking cash-out, Bank of America Preferred Rewards. Proposal: a `relationship` predicate (`program`, `tier`) and a matching user-layer field, instead of free-form selections.
- **Combining within limits.** Marriott elite night credits stack across one personal and one business card but not two personal cards; Delta Sky Club visit allowances add up across a person's cards (Delta's FAQ: a personal and a business Reserve give 30 visits), but `max` counts one card's. Proposal: a combine `scope` (per segment, per family) and per-attribute rules for visit counts, with `null` meaning unlimited.
- **Value basis for certificates.** Every free-night and companion certificate has `face_value: null`, so its value is opinion only; Hilton nights are uncapped but `cap` can't say so; companion fares keep cabin, region and co-pay in notes.
- **Time-limited perks.** `effective_to` means the end of terms for new applicants, but is used for perks that end for everyone (2026-only hotel credit; DoorDash through 2027). Add an `ends_on` that applies to all holders, and an `activation` period anchor for perks that run 12 months from enrollment.
- **Holder-since conditions.** Legacy 1.5¢ and 1.25¢ Chase Travel rates apply only to cardholders from before June 23, 2025, but path `requires` can't test the open date.
- **Perks that apply however you pay.** United's extra miles on paid flights for cardmembers, and Delta and United award discounts, apply to purchases on any card. Earn rules apply only to spend on the card, so these live in notes.
- **Lounge detail.** Priority Pass variants differ in visit limits, experiences, restaurant access for guests, and memberships the cardholder can give to others (Bank of America's four); Centurion guest counts after a threshold and paid guest fees have no fields.
- **Paid add-ons.** Lounge access for authorized users at $125 a year (Venture X), one fee covering up to three authorized users (AAdvantage Executive), the Prestige's Citigold rebate on that fee.
- **Ordered perks without status.** Upgrade priority puts Reserve holders ahead of Platinum holders; only `status` entitlements have tiers today.
- **Restricted rewards.** A Delta eCredit or Bilt Cash is not cash; credits and rewards paid in a restricted currency need a currency or `restricted_to`, and value sets need a way to value Bilt Cash below face.
- **Status chasing.** Qualifying dollars and loyalty points matter only when they move a holder across a tier. A user-layer status goal would let the engine value a headstart properly.
- **Values are inputs, not catalog data.** Done: the catalog carries no perk or points values; calculators pass a value set (`docs/value-sets.md`), and the engine reports what no one valued. Next: let a value set value lounge networks per visit rather than per network, and publish the example set's rules for review by anyone who wants to use them.

**Catalog coverage for keep-or-cancel apps.** All 48 premium cards in the spreadsheet tested are in the catalog, including cards closed to applicants (Citi Prestige, Ritz-Carlton, Altitude Reserve) and two variants (Schwab and Morgan Stanley Platinums).

## 4. Engine work

| Item | Notes |
| --- | --- |
| Protections valued per trip against routed spend | Still combined per wallet |
| Lounges valued against the person's airports via the access directory | Still a flat value per benefit |
| Path transitions and points lots | Release transitions don't yet apply to redemption paths |
| Status goals in the user layer | Today a user must value status credits in cents to steer spend; a goal ("reach Platinum Medallion") is clearer |
| Optimal spend assignment | Greedy assignment is deterministic but not optimal with several caps and thresholds |
| Decimal arithmetic | The spec asks for it; the engine uses floats and rounds at the end |
| Per-attribute combining | Overlap keeps the highest-valued grant whole; guests, bag counts and visit limits don't combine per attribute (spec section 6) |
| Value sets | Wired in: the app passes one value set; layering several (a community set under a publisher set) is not yet supported |

## 5. Release

- 1.0 when every catalog card has had human review and the agent-facing files have settled.
