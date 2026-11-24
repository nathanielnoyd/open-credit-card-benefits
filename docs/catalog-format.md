# Catalog format

The catalog is plain YAML, one record per file, so every change is a readable diff. `npm run build` compiles it into `dist/catalog.json`, and `npm run validate` checks every file against `schema/` plus the cross-file rules below.

The YAML is the **authoring form**. The published JSON is the **distribution form**: loading expands a few shorthands (below), so every published record is explicit and consumers never apply defaults themselves. The JSON Schemas describe the distribution form.

## Layout

```
catalog/
  issuers.yaml
  entitlement-types.yaml        # canonical entitlement keys and combine rules
  spend-categories.yaml         # canonical spend taxonomy, with merchant category codes
  currencies/<currency>.yaml    # points programs and redemption paths (file name: pts.<program>.yaml)
  cards/<card id>/
    card.yaml
    earn-rules.yaml             # each rule has versions
    benefits/<slug>.yaml        # each benefit has versions
    releases/<YYYY-MM-DD>.yaml  # the dated changes that ship versions
```

## Authoring shorthand

Loading fills these in, so leave them out of the YAML unless a record differs from the default.

| Left out | Filled with |
| --- | --- |
| `sources`, `verified_by`, `confidence`, `last_reviewed` on a benefit version or release | The card's `provenance` block in `card.yaml` |
| `sources` on an earn-rule version | The card's `provenance.sources` |
| `period` on a benefit version | `{ cadence: ongoing }` |
| `period.tz` | The issuer's timezone from `issuers.yaml` |
| `effective_from` on a benefit version | Its release's `effective_for_new` |
| `combine` on a grant | The rule for that entitlement in `entitlement-types.yaml` |
| A variant's records (card `based_on`) | Its base card's benefits, earn rules and card fields under the variant's IDs, shipped by the variant's releases that `follows` the base's (below) |

Give a version its own `sources` whenever the card-level sources don't support that specific fact.

## Summaries

Every card and every benefit version has a `summary`: one plain-language sentence that a person or an AI agent can quote. Say what the cardholder gets, how much, how often and the main restriction, and lead with the value: "Up to $10 a month in Uber Cash for US Uber rides and Uber Eats orders, $120 a year in total." Money in the YAML is cents; money in summaries is dollars. A summary must agree with the structured fields: the validator warns when it quotes a dollar figure that isn't in the record, which usually means the fact is still only in `notes` and should be given a field. Earn rules don't need summaries; their text is generated from the data.

## Rules the validator enforces

- Every benefit and earn-rule version is shipped by exactly one release, and every release change points at a version that exists.
- Each card has exactly one `baseline` release; it is the earliest and sets `fee:annual` (amount 0 for no-fee cards).
- A release's ID is `<card id>@<effective_for_new>` and its file name is that date.
- A card's ID starts with its issuer's ID, and its issuer, currency and cobrand program exist.
- Every granted entitlement is in `entitlement-types.yaml`, exactly or through a `<type>:*` wildcard, and a grant's `combine`, if given, matches the registry.
- Every spend category, currency (including transfer targets and reward currencies) and `wallet_holds` card exists.
- Conditions carry the parameters their type needs (spec section 7).
- `value_share` values on one version sum to 1; `machine_readable: false` comes with `notes`.
- Every version and release has at least one source after expansion.
- Every card and benefit version has a `summary`.
- Amounts look plausible (amounts are cents), and transition rules only name targets the release changes.

`OCCB_CARDS=us.amex.gold,us.amex.green npm run validate` checks only the named cards. `OCCB_WARNINGS=1` lists warnings, such as protections without structured coverage.

## Modeling guide

### Cards

```yaml
id: us.amex.gold
issuer_id: us.amex
name: American Express Gold Card
network: amex
segment: personal          # or business
tier: premium              # no_fee, mid, premium, ultra_premium
family: amex-membership-rewards
earns: pts:amex_mr
open_to_applicants: true
url: https://www.americanexpress.com/us/credit-cards/card/gold-card/
aliases: [Amex Gold]
fee_posting: { anchor: account_open }
provenance:
  sources:
    - { url: https://www.americanexpress.com/us/credit-cards/card/gold-card/, retrieved_at: "2026-11-13", publisher: issuer }
  verified_by: agent:occb-research
  confidence: "0.85"
```

Cobrand cards add `cobrand: { partner: Delta Air Lines, program: pts:delta_skymiles }`; `earns` is then the partner currency.

### Fees

Fees live in releases, at their regular amount. Free authorized users are `free_count`; a percentage fee is `rate`:

```yaml
changes:
  - target: fee:annual
    to: { amount: 15000, currency: USD }
  - target: fee:authorized_user
    to: { amount: 0, currency: USD }
  - target: fee:foreign_transaction
    rate: "0.03"
```

### Earn rules

`multiplier` is points per dollar. For cashback currencies, where one point is one cent, it is the percent back: `"2"` means 2%. For each purchase, the applicable non-stacking rule with the highest multiplier applies; rules with `stacks: true` add to it; a `boost` rule multiplies the card's total earn by `1 + boost`.

| Card terms | Model |
| --- | --- |
| 4x at restaurants up to $50,000 a year, then 1x | `multiplier: "4"`, `cap: { amount: 5000000, currency: USD }`, `cap_period: calendar_year`, plus the card's `cat:all` 1x rule |
| 5% on two categories you choose each quarter | Rule-level `choice: { mode: holder_selects, pick: 2, selection: cash_plus_categories, period: quarter }`, all eligible categories in `categories` |
| 5% on your top eligible category each billing cycle | `choice: { mode: top_spend, pick: 1, period: statement }`, `cap_period: statement` |
| 5% in quarterly rotating categories after activation | `choice: { mode: rotating, period: quarter }`, version `schedule` of `{from, to, categories}`, `conditions: [{ type: enrollment_required }]`, `cap_period: quarter` |
| 3% choice plus 2% groceries, $2,500 combined per quarter | Both rules carry the same `cap` and `cap_group: quarterly-bonus` |
| 25–75% more with a banking relationship | One `boost` rule per tier, each with `conditions: [{ type: selection_is, name: preferred_rewards_tier, value: gold }]`, and the selection declared on a benefit |
| A credit or certificate from the second card year on | `conditions: [{ type: card_year, min: 2 }]` |
| 1.5x on purchases of $5,000 or more | `conditions: [{ type: min_transaction, amount: 500000, currency: USD }]` |
| 2x when paying with Apple Pay | `conditions: [{ type: payment_method, method: apple_pay }]` |
| $1 Delta MQD per $10 spent | `currency: pts:delta_mqd`, `multiplier: "0.1"` |

Use the most specific spend category that matches the issuer's definition, and put issuer-specific exclusions in `notes`. Merchant-specific earn uses `cat:merchant.<slug>`; add the node under the merchant's usual category.

### Benefits

Every perk is one file with versions. The structured fields for each kind:

| Kind | Use these fields |
| --- | --- |
| `statement_credit` | `face_value` (per year), `period` (`monthly`, `quarterly`, `semiannual`, `annual`, `every_n_years`), `limit.amount` per period, `conditions` (`merchant_in`, `booking_channel`, `enrollment_required`, `min_nights`), `percent_back` for "20% back" credits |
| `membership` / `access` | Grants with attributes, such as `guests`, `visits`; `limit.count` with `unit` for visit caps |
| `status` | Grant `status:<program>` with `attributes: { tier: gold }` |
| `certificate` | `cap` (most the award may cost, in points), `top_up`, `expires_after_days`, `issued_on`, `period` |
| `protection` | `coverage` (`priority`, `per_claim`, `per_person`, `per_trip`, `per_item`, `per_period`, `deductible`, `waiting_hours`, `max_days`, `window_days`, `extends_years`, `max_claims_per_period`), condition `paid_with_card` |
| `fee_waiver` | `waives` (`checked_bag`, `foreign_transaction_fee`), `count`, `companions` |
| `redemption_modifier` | `applies_to_path`, `rate`/`rate_min`/`rate_max`, `percent_rebate`, `cap` |
| `milestone` | `threshold`, `threshold_period`, and `reward`, `reward_cash` or `reward_benefit` |
| `anniversary` | `reward` (points), `issued_on` |

A compact benefit:

```yaml
id: us.amex.gold/dining-credit
card_id: us.amex.gold
kind: statement_credit
name: Dining credit
versions:
  - version: 1
    change_type: added
    release: us.amex.gold@2024-07-25
    face_value: { amount: 12000, currency: USD }
    period: { cadence: monthly, anchor: calendar }
    limit: { amount: 1000 }
    grants: [{ entitlement: credit:dining_partners_amex }]
    conditions:
      - { type: enrollment_required }
      - { type: merchant_in, merchants: [grubhub, cheesecake_factory, goldbelly, wine_com, five_guys] }
    beneficiaries: [primary]
```

**Entitlement keys decide overlap**, so reuse an existing key whenever two cards' perks are the same thing (two cards' Priority Pass memberships are both `membership:priority_pass`). Add a new key only for a genuinely different perk. Per-card rewards (anniversary points, certificates, milestones) use wildcard keys like `certificate:<card id>.free-night`, which need no registration.

**Merchants** in `merchant_in` are lowercase slugs (`resy_network`, `disney_plus`).

### Releases and history

Each card needs a `baseline` release: the terms first observed on its date. Later changes are `change` or `refresh` releases with `announced_on` or `first_seen_on`, and transition rules if existing holders got them on a different date. Model a refresh when it is well sourced; when history is unclear, record the current terms as the baseline and say so in its `notes`.

**Offers are out of scope.** Don't record welcome bonuses, intro APRs, first-year fee waivers, first-year earn promotions or other sign-up incentives anywhere in the catalog, including card notes and summaries. They vary by applicant and change constantly. The spec defines an offer format (Appendix F, `schema/offer.schema.json`) for other publishers and for wallet cards; `examples/offers/` shows it. Terms that apply to every holder for the life of the card, such as a companion certificate from the second year on, are terms, not offers.

### Variants

A variant is a card the issuer sells as another card plus or minus a few terms, such as the Platinum Card Exclusively for Morgan Stanley. It is its own product, but you author only what differs. Personal and business versions of a card and tiers of a family are **not** variants: author them as separate cards and link them with `related` (see `docs/design/card-variants.md` for why).

```yaml
# card.yaml
id: us.amex.platinum-morgan-stanley
name: Platinum Card Exclusively for Morgan Stanley
summary: "..."
based_on:
  card: us.amex.platinum
  exclude: []          # base benefit or earn rule IDs the variant lacks
  not_followed: []     # { release: <base release id>, reason: ... } for base changes that didn't reach it
provenance: { ... }    # the variant's own sources
```

- Add one release per base release, with `follows: <base release id>` and the variant's own `effective_for_new`. An empty one is six lines. Add `changes` for the variant's own terms, which replace the base's change to the same target. Add `sources` when a page confirms the change reached the variant.
- Put the variant's own benefits in its `benefits/` folder. A file with the same slug as a base benefit replaces it.
- When the base card gets a new release, the validator fails until each variant follows it or lists it in `not_followed`. That is deliberate: someone decides whether the change reached the variant.
- If more than a third of the card's records end up its own, it isn't a variant; author it as a separate card.

## Recording a change

Suppose an issuer raises a credit from $100 to $150, effective March 1 for new applicants and at renewal for existing holders.

1. Add a version to the benefit file. Keep the old version; never edit history.

   ```yaml
   - version: 2
     supersedes: 1
     change_type: amount_changed
     release: us.example.card@2027-03-01
     face_value: { amount: 15000, currency: USD }
     # ...the rest of the terms, in full
   ```

2. Add `releases/2027-03-01.yaml`:

   ```yaml
   id: us.example.card@2027-03-01
   card_id: us.example.card
   kind: change
   announced_on: "2027-01-15"
   effective_for_new: "2027-03-01"
   changes:
     - target: benefit:us.example.card/hotel-credit
       version: 2
   transition:
     - applies_to: [benefits]
       next_renewal_on_or_after: "2027-03-01"
   sources:
     - url: https://example.com/announcement
       retrieved_at: "2027-01-15"
   ```

3. Run `npm run check`. If the change moves the expected numbers in `conformance/valuation/`, say why in the pull request.

To retire a benefit, add a change with `change_type: retired` and no new version. If you don't know when a change was announced, use `first_seen_on`.

## Dates and money

Quote dates (`"2026-11-12"`) so every YAML parser reads them as strings. Money is integer minor units: `{ amount: 79500, currency: USD }` is $795.00.
