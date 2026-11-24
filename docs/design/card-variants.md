# Card variants

November 13, 2026. Decision record for how OCCB handles cards that are close copies of other cards: the Schwab and Morgan Stanley Platinums, personal and business twins such as the Sapphire Reserve and Sapphire Reserve for Business, and tiers in one family such as the United Quest and Explorer. The keepers pressure test (`docs/pressure-tests/keepers.md`) found 25 cards missing from the catalog, and about half are close copies of a card already in it.

## Decision

1. **Every card a person applies for separately is its own product**, with its own card ID, benefit IDs and release list. This holds for variants, business twins and tiers alike.
2. **A variant may be authored as `based_on` another card.** A variant is a card the issuer sells as another card plus or minus a few terms. `based_on` is an authoring shorthand. Loading expands it into ordinary explicit records under the variant's own IDs, and the published files carry `based_on` only as information.
3. **A variant must account for every release of its base.** For each base release, it either follows it with a release of its own (`follows`) or declines it with a reason (`based_on.not_followed`). Nothing propagates silently, and every change to the variant is still a dated, sourced release in its own changelog.
4. **Business twins and tiers are authored as separate cards.** They aren't variants. A `related` link connects counterparts for apps. Rules meant to cover a group of cards name a family and tier, not a card ID.

## Why every variant is still its own product

The tempting alternative is one product with editions: a single `us.amex.platinum` with a selection `edition: standard | schwab | morgan_stanley`, and edition-only perks gated by `selection_is`. It saves the most data. It fails on the things OCCB keys by card ID:

- **Fees and fee history.** Fees live in releases and can't be conditioned on a selection. The Morgan Stanley card's first authorized user is free, and the consumer card's isn't.
- **Offers** (Appendix F) attach to a `card_id`. The Morgan Stanley card had its own 150,000-point offer in 2026.
- **Applying, eligibility and closing.** Each variant has its own application, its own eligibility (a Morgan Stanley account), and can close to new applicants on its own date.
- **Search and comparison.** `cards.json`, fact sheets and every comparison app, including the spreadsheet tested, list each variant as a card a person can pick.
- **Holding both.** People hold the consumer and Morgan Stanley Platinums at once and get both cards' credits. Separate products give each card its own grants, and the combine rules already decide what stacks.
- **History.** A variant's terms can diverge from its base, and IDs are never reused (section 2). Editions would make one benefit ID mean different terms for different holders.

So identity says separate products. The real cost of separate products is authoring: copying about 38 benefit files, 3 earn rules and 5 releases to add two terms, and then keeping the copies in step. That is a problem for the authoring form, which already has shorthands for exactly this kind of repetition.

## Three kinds of similar card

Measured on the catalog: benefits compared by entitlement and terms for a new applicant on November 13, 2026, and release dates since mid-2024.

| Pair | Same perk, same terms | Same perk, different terms | Only on one | Release dates in common |
| --- | ---: | ---: | ---: | --- |
| Platinum / Business Platinum | 0 | 25 | 22 | 2 of 9 |
| Gold / Business Gold | 0 | 7 | 10 | none |
| Venture X / Venture X Business | 8 | 6 | 5 | 1 of 3 |
| United Quest / Explorer | 18 | 1 | 10 | all |
| Delta Reserve / Platinum | 16 | 0 | 11 | all |
| Bilt Palladium / Obsidian | 9 | 1 | 6 | all |
| Morgan Stanley Platinum / Platinum (from issuer and review pages) | all of the Platinum's | 0 | 2 expressible, 2 not yet | all, including the 2026 Saks removal |

The table shows three relationships:

- **Variants** (Schwab and Morgan Stanley Platinums): the issuer's own wording is "all the benefits of the Platinum Card, plus". They change on the base's dates, because they share its benefit guide. Inheritance fits them.
- **Business twins** (Platinum and Business Platinum, Gold and Business Gold): mostly the same perks under different amounts, on different release calendars. Inheriting would mean replacing most records and declining most releases, which is more work than authoring the card, and harder to review. The Reserve for Business also differs in 6 of 20 rows and in its spend threshold.
- **Tiers** (Quest and Explorer, Delta Reserve and Platinum): many identical records (cardmember perks, protections), changed on the same announcement dates, but each tier has its own credits and amounts. What they share is a set of family perks, not a whole card. Card-level inheritance is the wrong unit; see "Not now" below.

The validator enforces the line. When more than a third of a variant's records are its own rather than inherited, it warns that the card should be authored separately.

## The mechanism

### Authoring form

```yaml
# catalog/cards/us.amex.platinum-morgan-stanley/card.yaml
id: us.amex.platinum-morgan-stanley
name: Platinum Card Exclusively for Morgan Stanley
based_on:
  card: us.amex.platinum
  exclude: []            # base benefits or earn rules the variant doesn't have
  not_followed: []       # base releases that didn't reach the variant: { release, reason }
```

```yaml
# releases/2024-01-01.yaml: follows the base baseline and adds the variant's own terms
id: us.amex.platinum-morgan-stanley@2024-01-01
card_id: us.amex.platinum-morgan-stanley
follows: us.amex.platinum@2024-01-01
effective_for_new: "2024-01-01"
changes:
  - target: fee:authorized_user
    to: { amount: 19500, currency: USD }
    free_count: 1
  - target: benefit:us.amex.platinum-morgan-stanley/spend-award
    version: 1
```

```yaml
# releases/2026-03-26.yaml: follows a base change with nothing of its own
id: us.amex.platinum-morgan-stanley@2026-03-26
card_id: us.amex.platinum-morgan-stanley
follows: us.amex.platinum@2026-03-26
effective_for_new: "2026-03-26"
```

### Expansion rules (`tools/variants.mjs`)

- **Card fields.** Fields the variant leaves out (issuer, network, segment, tier, family, earns, cobrand, fee posting, selections) come from the base. Its name, URL, aliases, summary, notes and provenance are always its own.
- **Inherited records.** Every base benefit and earn rule that isn't excluded, and has no record of the same slug in the variant's folder, is copied as `<variant id>/<slug>` with `based_on` naming the original. Only versions shipped by followed releases are kept. They are renumbered from 1, so declining a base release drops its versions cleanly. Each version points at the following release, and an `effective_from` equal to the base release's date becomes the follower's date.
- **Replacing and adding.** A record in the variant's folder with a base slug replaces the base record whole. A new slug is the variant's own.
- **Following releases.** A following release ships the base release's changes for inherited records and fees, remapped to the variant's IDs and version numbers, followed by its own `changes`. Its own entry for a target replaces the base's. Kind, announcement dates, notes, transition rules (with targets remapped), legacy rules and sources come from the base release unless the variant release gives its own. Its ID and `effective_for_new` are always its own, so a variant that got a change a week later says so.
- **Provenance.** Inherited facts keep the base's sources, and an inherited release keeps the base release's sources. A variant release that gives its own sources, such as a page confirming the change reached the variant, replaces them.
- **Default values.** An inherited benefit with no default value of its own uses its base benefit's default, so a variant's opinions don't have to be copied either.
- **Validation.** Every base release is followed exactly once or declined. Excluded IDs and followed releases must exist. A variant can't be based on another variant or on another issuer's card. Warnings about an inherited record are reported once, on the base.

### Published form

The variant's card file is complete and explicit, like any other: its own benefit IDs, versions and releases. `based_on` on the card, benefits and earn rules, and `follows` on releases, are kept so apps and reviewers can trace a fact to the base record it came from. The fact sheet says "Variant of: Platinum Card" and marks the variant's own perks "This card only." `cards.json` lists `based_on` and `related`. A consumer never needs to expand anything.

## What variants don't do

**`wallet_holds` doesn't match variants implicitly.** A rule that names `card_id: us.amex.platinum` means that product. Implicit matching would silently extend issuers' rules to cards they may not cover, and would differ between implementations. Rules meant for a group of cards name a family, optionally narrowed by tier: `{ type: wallet_holds, family: chase-sapphire, tier: premium }` covers the Reserve and a future Reserve for Business, but not the Preferred. The engine ignored `tier` until now; it now honors a tier or a list of tiers. Variants inherit the base's family and tier, so family rules include them automatically.

**Overlap between a card and its variant is ordinary overlap.** Holding the Platinum and the Morgan Stanley Platinum gives two Resy credits (`sum`) and one Priority Pass membership (`any`), which is right for two accounts. Whether two Uber Cash credits land in one Uber account is a per-account stacking question. It is the same for any two cards granting `credit:uber_cash`, and belongs to `stacking_confidence`, not to variants.

## Twins and tiers: `related`

`related` lists the products a card is commonly compared with: `business_counterpart`, `personal_counterpart`, `variant`, `replaced` and `replaced_by`. It is informational and nothing is inherited. Apps use it to show "also comes as a business card", and agents use it to answer "what's the difference between X and Y?". The `replaced` and `replaced_by` relations also give closed products a successor link, such as the Citi Premier replaced by the Strata Premier.

## Worked example: what the first variant found

Authoring the Morgan Stanley Platinum required accounting for each of the Platinum's releases. Its own sources listed a change the base didn't have: the Saks credit, removed from new applications on March 26, 2026 and from existing card members on July 1, 2026. That change belongs to the consumer Platinum itself. The catalog's Platinum had no Saks credit at all, so it was added to the base, with its retirement as a release. The variant follows it, so both cards lose Saks on the same dates. With copied records, the Morgan Stanley card would have been authored from a base already missing this change, and nothing would have noticed.

The Morgan Stanley card's two relationship-based terms, the 1¢ cash-out to a Morgan Stanley account and the $895 engagement bonus for Platinum CashPlus clients, stay in its notes. They need the outside-relationship predicate on the roadmap, not anything specific to variants.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Editions of one product (a selection) | Breaks fees, offers, eligibility, search and history, which all key on card ID (see above) |
| Variants inherit every base release automatically | A base change would reach the variant with no review and no source for the variant. Issuers occasionally diverge, and the error would be silent. Declining a release would need its own mechanism anyway |
| Plain copies with a drift checker | Keeps every record explicit, but each base change still means editing about 40 files by hand per variant. The `follows` rule gives the same drift detection with a six-line release file |
| Inheritance for business twins too | Most records would be replaced and most releases declined; harder to review than a separate card |
| Implicit `wallet_holds` matching of variants | Silently widens issuers' rules; family and tier say what's meant |

## Not now

- **Family-level shared benefits for tiers.** United cardmember perks, Delta's TakeOff 15 and the issuer-wide Amex Offers are one perk granted by many cards. A shared benefit record that cards include would remove that duplication, but it raises its own questions: a different amount per card, and release timing per card. The issuer-wide programs item on the roadmap should settle those first, then tiers can reuse the answer.
- **Tier vocabulary.** `tier` is coarse and unreviewed. The Platinum, Gold, Sapphire Reserve and Venture X are all `premium`, and only two cards are `ultra_premium`. Tier-qualified rules need a reviewed vocabulary before many rules depend on them.
- **Variants of variants.** Not allowed until a real case needs them.
- **Regional versions** stay separate products (section 2), authored separately: different currencies, fees and benefits.

## Cards in the keepers test, by decision

| Card | Decision |
| --- | --- |
| Platinum Card for Morgan Stanley | Variant of the Platinum (done) |
| Platinum Card for Schwab | Variant of the Platinum (done); its asset-tiered credit and 1.1¢ cash-out are in notes until the outside-relationship predicate exists |
| Sapphire Reserve for Business | Separate card, `related` to the Reserve; Chase paths that require the Reserve should use family and tier |
| Delta Reserve, Platinum and Gold Business | Separate cards, `related` to their personal counterparts |
| United Club and Club Business; United Business; Hilton Business; IHG Business; Bonvoy Business; Wyndham Earner Business | Separate cards |
| Citi Prestige; Ritz-Carlton card | Separate, closed cards (`open_to_applicants: false`), with `replaced_by` where one exists |
