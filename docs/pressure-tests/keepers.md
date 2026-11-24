# Pressure test: "which cards are keepers?"

November 13, 2026. A test of whether OCCB's spec, catalog and engine can support a real application, using one of the most widely shared keep-or-cancel tools as the model: Frequent Miler's spreadsheet *Which Premium Credit Cards are Keepers?* (version 15.1).

## The application

The spreadsheet has one tab per premium card (48 of them) and a summary. Each tab lists the card's perks. Next to each perk are an editor's estimate of its yearly value, a note explaining the estimate, and blank columns for the reader's own value and notes. The summary compares each card's total with its annual fee, and a checkbox totals the cards the reader decides to keep. Its central advice is that a perk is worth only what it adds beyond the cards you'll keep anyway: if a card you keep already pays for Global Entry, another card's Global Entry credit is worth nothing to you.

That is the kind of application OCCB exists for. An app like it needs:

1. Every perk of every card, current and correct, in a form it can list.
2. A value per perk, an expert estimate with a reason, that the user can replace with their own.
3. Overlap resolved across the cards the user keeps.
4. Dollar values for things that aren't perks in OCCB's model: bonus categories, transferable points, "anything else you value".
5. Cards people hold, not only cards open to applicants.

## Method

1. Every row of the 31 card tabs was mapped to the catalog by agents working in parallel, one group of issuers each. The 31 tabs are the 23 cards the catalog has, plus 8 for comparison. Each row was marked matched, a data mismatch, missing data the spec could express, not expressible, or out of scope.
2. The app was built on the reference engine (`examples/apps/keepers.ts`), and every place it needed something the spec or engine didn't offer was recorded.
3. The catalog's default perk values were compared with the spreadsheet's estimates, card by card.

## Findings

### Row mapping

| | Rows | Matched | Data mismatch | Missing data | Not expressible | Out of scope |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 23 cards in the catalog | 308 | 248 (81%) | 19 | 25 | 12 | 4 |
| 8 cards not in the catalog | 140 | 43 (inherited from a sibling card) | 10 | 78 | 8 | 1 |

All 23 annual fees agree. 25 of the spreadsheet's 48 cards aren't in the catalog; they're listed in the roadmap.

The mismatches went to `docs/review-queue.md`. The spreadsheet is a secondary source, so nothing was changed on its word. In several places the catalog looks more current, such as the $120 Global Entry credit and the Venture X Business lounge add-on. In others the spreadsheet does. The consumer Platinum missed the October 2026 Lodging Credit change, which is recorded only on the Business Platinum.

### Overlap bugs that would mislead any app

These were wrong in the data, not in the spec, and are fixed:

| Problem | Effect | Fix |
| --- | --- | --- |
| Delta TakeOff 15 and the United award discount shared one key | A wallet with a Delta card and a United card counted only one award discount | Airline-scoped keys; spec section 6 now requires program-scoped keys |
| A Delta card's free first and second bags shared one key | A card waiving both counted only one | Separate key for the second bag |
| Walmart+ was a credit on Business Gold and a membership on Platinum | Holding both counted the membership twice | One membership key |
| Six Capital One benefits granted two entitlements without `value_share` | Each was counted twice: Venture X lounges at $293 instead of $147 | Even shares; the validator now requires shares; the engine splits evenly when they're missing |

### What the app needed that OCCB didn't have

| Need | Before | Now |
| --- | --- | --- |
| What a card adds beyond the cards you keep, perk by perk | Only W(wallet) − W(wallet without card), with no per-perk split; overlap credit went to whichever card's copy was worth more, so a perk the keepers already had could show its full value on the card being judged | `valueAdded(catalog, wallet, candidates, opts)` credits each perk with its share of the change in its overlap groups; spec section 13 |
| A dollar value for a bonus category without a spend profile | Earn came only from spend; `benefit_values` can't name an earn rule | `earn_values` in the user layer; a valued rule leaves spend assignment, so nothing counts twice |
| "What else do you value?" | `custom_benefits` was in the schema but the engine ignored it, and the schema demanded a release and sources | Custom benefits are valued on their wallet card; a user benefit needs only an ID, kind, name and a version |
| Values entered as "what I'd pay up front" | Every personal value was discounted again | `basis: present_value` |
| The reason next to a value | No field; `additionalProperties: false` rejected one | `note` on user values and on value-set entries |
| An expert's estimates as a set | One `default` scope, no reasons, no method | `publisher` scope, `method`, per-entry `note` (spec section 11) |
| "Points transfer to partners" as a row on the card that unlocks it | Lived only in currency-path `requires`; an app summing perks scored it $0 | Published `current.unlocks` and a fact-sheet section listing what each card opens and which other cards open the same paths |

### Where the catalog's default values stand

Totalled per card with no spend profile, the catalog's default perk values are close to the spreadsheet's estimates for most cards. They are well above them for the ultra-premium cards. The spreadsheet's totals include earning, which this column does not, so the gap on perks alone is larger still.

| Card | Default perks ÷ spreadsheet total |
| --- | ---: |
| Sapphire Preferred | 1.9 |
| Business Platinum, IHG Premier | 1.8 |
| Platinum, Sapphire Reserve | 1.5 |
| Bilt Palladium | 1.4 |
| Venture X Business, Delta Gold, United Explorer | 1.2 |
| 10 others | 0.9–1.1 |
| Amex Gold, Green, Strata Premier, Surpass, AAdvantage Executive | 0.6–0.7 |

The defaults are labelled placeholders, but an app that ships them will tell most people to keep every premium card. Running the example wallet does exactly that. They need a documented method, a reason per entry and human review before anyone relies on them (roadmap section 3).

### Gaps that remain

The roadmap lists them under "Found by the keepers pressure test". The ones that most change keep-or-cancel answers:

- **Card variants**: Schwab and Morgan Stanley Platinums, and business twins of personal cards, need `based_on` rather than copies.
- **Closed products and product changes**: existing holders of closed cards, and downgrade paths as the alternative to cancelling.
- **Issuer-wide programs and referrer rewards**: Amex Offers and refer-a-friend appear on every Amex tab of the spreadsheet.
- **Outside relationships**: brokerage and banking tiers gate real value on six of the cards tested.
- **Combining within limits, certificate value, time-limited perks and status goals.**

Five rows were out of scope by design, all of them referral bonuses read as offers. One mapping agent read the referrer's own reward as an acquisition offer. The roadmap treats it as a gap instead, because it is a lasting benefit of holding the card, not a sign-up incentive.

## Running the example

```sh
node examples/apps/keepers.ts examples/keepers.json --as-of 2026-11-13
node examples/apps/keepers.ts examples/keepers.json --keep w-csr
```

The first prints a summary table and one sheet per card: each perk's value on its own, what it adds given the other keepers, and the user's note. `--keep` names cards the user keeps no matter what; the app then adds whichever remaining card adds the most net of its fee, until none pays for itself. `test/keepers.test.ts` covers the engine behavior the app relies on.

## Rerun on the full catalog

November 14, 2026, after the gaps above were worked through: card variants, eight business twins and sixteen more personal cards, so the catalog grew from 56 to 81 cards.

| Check | First run | Rerun |
| --- | --- | --- |
| Spreadsheet cards in the catalog | 23 of 48 | 48 of 48 |
| Annual fees matching | 23 of 23 | 48 of 48 |
| Spreadsheet rows on covered cards | 308 | 652 (909 catalog benefits on the same cards) |
| Default perk values ÷ spreadsheet estimates, all covered cards | 1.14 | 1.13 |
| Cards whose defaults run above 1.6 times the estimate | 4 | 5 (Business Platinum, Sapphire Reserve for Business, Sapphire Preferred, IHG Premier, IHG Business) |
| `valueAdded` with every catalog card as a candidate | not run | 36 ms on an empty base, 135 ms on a three-card base |

The new cards were researched row by row from the spreadsheet's list. Their disagreements with it are in the review queue rather than counted again here. Examples: the Delta Gold Business earns 2x on shipping and advertising, not supermarkets; the CNB Crystal's authorized users cost $95; the Hilton Business's spend-based free nights ended in 2024.

### What the rerun found

- **Anniversary rewards in points were worth nothing.** A reward paid in points each card year counted only if someone had typed a dollar default for it, so 10 of 24 were zero, among them the Venture X's 10,000 miles and the Wyndham cards' anniversary points. They are now worth the points at the wallet's value for the currency. The Venture X moved from 1.04 to 1.27 of the spreadsheet's estimate, and the Wyndham Earner Plus from 0.38 to 0.72.
- **Existing holders who keep their old terms couldn't be expressed.** Barclays' 2026 Wyndham refresh applies only to new applicants. A release with no transition rule reaches existing holders on its effective date, so the spec gained `transition: [{ applies_to: [all], never: true }]`. The Earner Plus still needs its pre-refresh terms recorded this way.
- **A variant's defaults duplicated its base's.** Inherited benefits now fall back to their base benefit's default, so the Morgan Stanley Platinum is no longer valued at face.
- **Business twins make overlap visible.** On a 12-card wallet with personal and business pairs, the app keeps the personal and business Reserves and Delta Reserves. It cancels the Hilton Business, whose perks the Aspire already gives, and the United Club, whose value the Quest largely covers. Two Delta Reserves still undercount Sky Club visits, which Delta adds up across cards (roadmap: per-attribute combining).
- **The defaults remain the weakest part.** Coverage and fees now match, but default perk values still run 1.4 to 2 times the spreadsheet's estimates for the Platinum, Reserve and IHG families. Every other check passes, so this is the main reason the app still says "keep" too often. Reviewing the defaults by hand is the next step for this use case.

### Default values reviewed

The five cards above 1.6 times the estimates, and the rest of their families, now follow a documented method (`docs/defaults.md`). Each perk has a typical value, a range from what it's worth to the holder who gets least to the one who gets most, and a reason. Across all 48 cards the defaults now total 0.98 of the spreadsheet's estimates (from 1.13); the Platinum went from 1.52 to 0.91 and the Reserve from 1.52 to 1.05.

The bigger change is how the app uses them. A card whose verdict flips within its perks' ranges is "depends on you", with the break-even (how much its unvalued perks must be worth to you) next to the typical value and the perks that decide it. On the example wallet the Platinum and Reserve are now "depends on you": the Reserve pays for itself if its unvalued perks are worth at least $657 a year to you, against $886 for a typical holder, and Priority Pass and the Sapphire Lounges decide it.

Restated as prepay values, which sit below expected use, the reviewed defaults fell again: the Platinum to 0.45 and the Reserve to 0.58 of the spreadsheet's totals, which also include earning. On the example wallet neither card now pays for itself on perks at typical values. The Reserve needs its unvalued perks to be worth $612 a year to you against $493 for a typical holder, so a frequent Priority Pass user keeps it and an occasional traveler doesn't. The unreviewed cards still carry higher placeholder defaults, so until they are reviewed the app favors them.

### Values left the catalog

The rounds above spent a lot of effort calibrating what perks are worth. That is not OCCB's job: the spec exists so calculators can show what a card is worth to someone, and what a perk is worth is that someone's opinion, or the calculator's. So the catalog now carries no values. Valuation takes a value set as an input and reports which perks and currencies no one valued; the values built above became an example publisher value set (`examples/value-sets`), which the example app uses. The defaults discussion is kept here because it is what shaped the format: prepay semantics, ranges and reasons, and answers per perk type.

