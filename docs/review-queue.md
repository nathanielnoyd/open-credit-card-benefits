# Review queue

Records that need a person to check them before the catalog is published as reviewed. They come from the research and summary passes of November 2026; items marked FIXED were corrected and are kept for the record. Run `npm run warnings` for the live list of protections without structured coverage and summaries that quote figures found only in notes.

## Known conflicts and gaps

- us.citi.strata-elite/citigold-credit: $145/yr modeled; Citigold Private Client $595 first year not modeled.
- us.citi.strata-elite/rental-cdw, us.citi.strata-premier/rental-cdw: secondary, but primary outside the home country per notes.
- us.citi.strata-elite/trip-delay: no waiting_hours.
- us.citi.double-cash/extended-warranty: effective_from 2024-11-17 precedes its release (2025-05-18).
- us.wellsfargo.autograph-journey/airline-credit: anchor fee_post, but first period starts at account opening.
- us.wellsfargo.autograph-journey/lost-luggage: per trip vs per person conflict.
- us.wellsfargo.autograph-journey/trip-cancel: separate interruption limits not modeled.
- us.citi.strata-premier/trip-delay: 6 hours modeled; one review says 3 hours.
- us.bilt.obsidian/hotel-credit, us.bilt.palladium/hotel-credit: notes require paying with the card; no paid_with_card condition.
- us.bilt.*/rental-cdw: secondary, but primary outside the US per notes.
- us.bilt.mastercard/trip-delay: amounts ($200/day, $1,800) in notes only.
- us.bofa.premium-rewards/trip-cancel, evacuation, purchase-security: coverage amounts unconfirmed.
- us.bofa.atmos-ascent/trip-cancel: confidence 0.5; one review says no travel insurance.
- us.capitalone.spark-cash-plus/roadside: paid_with_card condition is unusual for roadside dispatch.
- us.amex.business-platinum/trusted-traveler: TSA PreCheck cycle 4.5 years vs 4 modeled.
- us.amex.business-platinum/dell-bonus, adobe-credit: merchant-specific spend thresholds in notes only.
- us.amex.delta-gold@2025-02-01, us.amex.delta-platinum@2025-02-01: release notes copied across cards (Resy/rideshare dates).
- us.amex.business-gold/trip-delay: 6 vs 12 hours.
- us.chase.ihg-premier/doordash-other: monthly vs quarterly unconfirmed; dashpass has no duration.
- us.chase.marriott-bonvoy-boundless/airline-credit: $250 half-year airline spend requirement in notes only.
- us.chase.sapphire-preferred, us.chase.sapphire-reserve: protections lack coverage fields; cards lack url and provenance (seed cards predate v0.3).
- us.citi.aadvantage-*/free-checked-bag: domestic-only restriction in notes only.
- us.chase.united-quest/pqp-bonus: must be open on Dec 31 (notes only); instacart split $10+$5 in notes.
- us.chase.southwest-priority/doordash: version depends on enrollment date.
- us.amex.hilton-aspire/annual-free-night: issued_on renewal, but notes say also issued in year one.
- us.amex.platinum: protections lack coverage amounts (seed card predates v0.3); trip delay terms in notes only; rental priority unknown.
- us.amex.delta-reserve/baggage: $3,000 vs $1,250/$500 conflict.
- us.amex.green/clear: $209 vs $219; may have been removed.
- us.amex.marriott-bonvoy-brilliant/priority-pass: guests from reviews only.

## From the keepers pressure test (November 13, 2026)

Rows of a widely used keep-or-cancel spreadsheet (version 15.1) compared with the catalog; see `docs/pressure-tests/keepers.md`. The spreadsheet is a secondary source, so each item needs checking against the issuer before a change.

- us.amex.platinum/hotel-credit: the October 22, 2026 Lodging Credit change (Airbnb Luxe added) is recorded only on us.amex.business-platinum.
- us.amex.platinum: Plaza Premium guests 1 (spreadsheet and Business Platinum: 2); Escape has no guest count; Airspace lounges are missing on both Platinum cards.
- us.amex.platinum/cell-phone: no coverage block; the spreadsheet says $800 per claim, $50 deductible, as Business Platinum records.
- us.amex.platinum/delta-unlimited, us.amex.business-platinum/delta-unlimited: unlimited Sky Club access after $75,000 runs through the end of the following calendar year per the spreadsheet; no `persists_periods`.
- us.amex.platinum/centurion-guests, us.amex.business-platinum/centurion-guests: 2 free guests after $75,000; the grant has no guest count; guest fees ($50 adult, $30 child) in notes only.
- us.amex.platinum, us.amex.business-platinum, us.amex.hilton-aspire, us.amex.marriott-bonvoy-brilliant, us.amex.delta-reserve: emergency medical transportation assistance missing (`protection:emergency_evacuation` exists).
- us.amex.platinum, us.amex.business-platinum: cruise program benefits missing. us.amex.business-platinum: Platinum Member Airfares missing.
- us.chase.sapphire-reserve/points-boost: `rate_max` 2.5; the spreadsheet says up to 2x.
- us.chase.sapphire-reserve/roadside: no 4-a-year limit or per-event amount.
- us.chase.sapphire-reserve, us.chase.sapphire-preferred DoorDash credits and DashPass: no end date; the spreadsheet says through December 31, 2027, and DashPass for 12 months after activation. The spreadsheet also says the Reserve's $15 credit works on all orders, not only restaurants.
- us.chase.united-quest, us.chase.united-explorer: DoorDash quarterly $10 credit and DashPass missing; Premier upgrades on award tickets left out (sources conflict).
- us.chase.united-explorer/instacart-plus: 25% off after the trial; the spreadsheet says half price.
- us.amex.delta-gold/rideshare and the second free checked bag on us.amex.delta-gold, -platinum and -reserve: not on the spreadsheet; confirm against the 2026 refresh sources.
- us.amex.delta-platinum: complimentary upgrades and Hertz Five Star missing.
- us.amex.marriott-bonvoy-brilliant/annual-free-night: `top_up` 15,000; the spreadsheet says 25,000.
- us.citi.strata-premier/flights-hotels-3x: the spreadsheet includes travel agencies.
- us.capitalone.venture-x-business: the spreadsheet says employee cards get no lounge access; the catalog says lounge access can be bought for $125 a year (later source).
- us.bilt.palladium/priority-pass: `restaurants` unset; the spreadsheet says lounges only.
- us.citi.aadvantage-executive: `fee:authorized_user` is $175 each; the release notes and the spreadsheet say $175 covers up to three.
- us.amex.platinum-morgan-stanley: new variant. Its following releases rest on the Platinum's sources except where a review page confirms the change reached it (2025 refresh, 2026 Saks removal); check the rest against Amex's Morgan Stanley benefit terms.
- us.amex.platinum@2026-03-26: one Amex statement says Saks stayed available to new and existing members through June 30, 2026; modeled as removed for new applicants from March 26.
- Every Amex card: Amex Offers not recorded (see roadmap: issuer-wide programs).
- us.amex.marriott-bonvoy-brilliant/annual-free-night: the program-wide top-off increase from 15,000 to 25,000 points on March 12, 2026 is recorded on us.amex.marriott-bonvoy-business and us.chase.marriott-bonvoy-boundless but not on the Brilliant.
- us.amex.marriott-bonvoy-business: protection limits rest on one third-party benefits summary (confidence 0.6–0.7); history before 2024 not modeled.
- us.amex.hilton-business: the $15,000 and $60,000 free nights ended in 2024; a July 2026 Amex survey tested bringing them back. Extended warranty caps unconfirmed; rental-coverage country exclusions copied from the Surpass.
- us.chase.ihg-business: renamed IHG One Rewards Business; the 2024-01-01 baseline is a placeholder; unsure whether the 15 annual Elite Night Credits are new in the 2026 refresh, when existing holders move from the $20K to the $25K milestone, when the $60K free night expires; Instacart+ from one source (0.6).
- us.chase.sapphire-reserve-business: Air Canada lounges are on Chase's page but One Mile at a Time says the card lacks them (start date unknown); the Hyatt Explorist date is approximate; cell phone, travel accident and roadside protections rest on one weaker source (0.6); DoorDash credits have no confirmed end date.
- us.chase.sapphire-reserve-business/travel-credit: Chase says the personal Reserve's credited travel earns no points (`credited_spend_earns: false`); confirm whether the business card's terms say the same.
- us.chase.united-club-business: pre-2025 fee $450, $525 or $550 by source ($450 used, 0.6); DashPass (0.55) and trip cancellation (0.6) from reviews only; anniversary miles dated to the 2025 refresh but may be older; Global Entry, Premier upgrades on awards, price protection and a DoorDash credit left out.
- us.barclays.wyndham-earner-business: baseline dated to the first review (August 18, 2021), not a confirmed launch; National Executive from the refresh at 0.7; free employee cards under the old terms assumed; the 2026 refresh is grandfathered (`never`) since Barclays announced no change for existing cardmembers.
- us.usbank.altitude-reserve: issuer page is gone, so all sources are reviews; 3x travel assumed to survive the December 2025 changes; whether Priority Pass restaurants and experiences use the 8 visits is unconfirmed; protection amounts unknown except travel accident.
- us.cnb.crystal-visa-infinite: authorized users $95 each (the spreadsheet says free); the 12 Gogo passes are no longer listed and were left out; Global Entry frequency and the two Priority Pass memberships unconfirmed; point values date from 2019.
- us.bofa.premium-rewards-elite: whether the four Priority Pass memberships include restaurants (true at 0.6) and their guest allowance (two or unlimited) are disputed; protection amounts from reviews only (0.6–0.7); baseline is the date first observed.
- us.bofa.atmos-summit: 20% in-flight rebate may be Ascent-only (0.5); partner award fee $12.50 or $20, so no amount; 3x on foreign purchases has no spend category (notes only); rental status and roadside left out. The Ascent may be missing rent-via-Bilt earning.
- us.barclays.wyndham-earner-plus: the June 17, 2026 refresh is the baseline, so holders from before then resolve to the new terms ($95 fee, 15,000 points) instead of their old ones ($75, 7,500); it needs a pre-refresh baseline and a refresh with a `never` transition, as the Earner Business has. Vacation Club 4x is notes only.
- us.barclays.wyndham-earner-premier: no-expiration of points from the press release and one review (0.7), not the card page; the cardmember discount has no published percentage (0.65); Global Entry $120 vs $125 in the press release.
- us.chase.ritz-carlton: airline credit period calendar vs account year (Chase vs The Points Guy); club-upgrade year disputed; extra lounge guest fee $27 vs $35 in notes; Sapphire Lounge access not on Chase's Ritz page (0.75). Product-change eligibility from a Chase Marriott card has no field (roadmap: product-change options).
- us.chase.marriott-bonvoy-bountiful: protection limits copied from the Boundless (0.7); purchase protection window 120 vs 90 days; rental and travel accident coverage left out (one source).
- us.citi.prestige: authorized-user fee $75 (One Mile at a Time, Bankrate) vs $50 (Upgraded Points); Global Entry credit modeled as $120 every 5 years (0.55; sources split with $100 every 4); cell phone limits changed since 2019; the $25 Citigold rebate on the authorized-user fee and a 15% Citigold points bonus left out.
- us.citi.aadvantage-globe: protection limits unpublished (0.5); the $99 companion co-pay has no field (summary warning).
- us.amex.marriott-bonvoy-bevy: purchase protection $10,000 per item / $50,000 a year vs one source's $1,000 per claim (0.6); trip delay from third-party sources only (0.65); baggage and warranty limits in notes; return protection left out.
- us.amex.platinum-schwab: the $1,000 credit tier from two reviews only; one review still lists Lufthansa lounge access after the base removed it.
- us.chase.united-club: pre-2025 fee $525 (The Points Guy) vs $450 (Upgraded Points); pre-2025 PQP cap 15,000 at 0.65; Avis President's Club start date unknown; when the cut from 2 guests to 1 reached existing members is unknown; Premier upgrades on awards and DoorDash left out; a 2027 PQP cap of 32,000 is in notes only. All Access via Premier Gold and the passes' authorized-user requirement are notes only (machine_readable: false).
- us.chase.united-business: the pre-2025 $100 travel credit after seven purchases rests on one review (0.6); expanded award availability dated 2026-04-02 from reviews only (0.55); personal-rental coverage terms unknown; Global Entry, DoorDash and Premier upgrades on awards left out (sources withdrawn or conflicting).
- us.amex.delta-reserve-business: baggage limits, rental coverage, Hertz status and the $175 employee card fee each rest on one source; emergency evacuation not found.
- us.amex.delta-gold-business, us.amex.delta-platinum-business: baselines dated to match the personal cards (2025-02-01), not observed; second-bag companions disputed between sources; rental coverage amounts in notes only.

## Fixed during research

- us.chase.ihg-premier@2026-10-01: missing fee:annual $150 change (validator now checks transition targets).
- us.citi.aadvantage-*/inflight credits used the discount entitlement; now credit:american_inflight.
- Keepers pressure test: Delta TakeOff 15 and the United award discount shared `program:reduced_award_pricing`, so a wallet with one card of each counted only one; now airline-scoped keys. The first and second free Delta bags shared one key, so a card waiving both counted one; the second bag now has its own key. Business Gold's Walmart+ credit used `credit:walmart_plus` while Platinum's used `membership:walmart_plus`, so holding both counted the membership twice; both now use the membership key. Six Capital One lounge and Premier Collection benefits granted two entitlements without `value_share` and were counted twice; they now split evenly. The Brilliant's cobrand partner read "Marriott", not "Marriott Bonvoy".

## General

- Every card was researched by an AI agent. Amex and some Chase product pages render only with JavaScript, so many Amex facts come from reviews rather than the issuer.
- Baseline release dates for cards with unclear history are placeholders; their release notes say so.
