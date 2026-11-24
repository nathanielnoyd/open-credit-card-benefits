// The example value set, by the method in docs/value-sets.md. Each entry gets a typical value, a range (low, high) and
// a note giving the reason. Writes the example value set, examples/value-sets/benefit-values.yaml. These are one
// publisher's opinions, an example of a value set; the catalog itself carries no values.
//
//   node examples/value-sets/generate.mjs            # rewrite the example value set
//   node examples/value-sets/generate.mjs --check    # list perks no rule covers
//
// Add a card to CARDS once its perks have been reviewed against the rules; add a rule when a perk fits none.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { loadCatalog, ROOT } from '../../tools/load.mjs';

// Every card except variants, which take their base card's defaults (docs/design/card-variants.md).
const cat = loadCatalog();
const CARDS = cat.cards.filter(c => !c.based_on).map(c => c.id);
const usd = d => ({ amount: Math.round(d * 100), currency: 'USD' });

// Statement credits: the share of face value a typical holder of the card uses. Low is 0 (doesn't use it), high is face.
// Statement credits: the share of face value a typical holder would PREPAY for the credit, which is less than the share
// they end up using. People discount an uncertain future credit for the risk of not using it and the effort of tracking
// it, and a credit is worth face value only when it replaces spending they'd do anyway. Only near-cash credits keep
// most of their face; a conditional credit is worth about half its expected use; a niche one next to nothing.
// Low is 0 (wouldn't pay anything for it), high is face (would pay full price).
const USAGE = [
  [0.85, 'Near cash: comes off most travel purchases automatically, so most holders would prepay nearly its face value.', ['credit:travel_general']],
  [0.6, 'Comes off a bill most people already pay, but needs enrolling and tracking.', ['credit:wireless_business', 'credit:trusted_traveler', 'credit:giftcards_com']],
  [0.5, 'Any one airline purchase over a minimum, if you fly that year.', ['credit:airline_purchase']],
  [0.35, 'Broad merchant, but monthly amounts expire if unused; worth near face only to people who use the merchant every month.', ['credit:uber_cash']],
  [0.25, 'Worth near face to people who already use the merchant or service regularly, little to others; half of expected use for a typical holder.',
    ['credit:resy', 'credit:digital_entertainment', 'credit:airline_incidentals', 'credit:chase_travel_hotel', 'credit:shops_at_chase']],
  [0.2, 'Needs a specific merchant or travel provider that many holders use only sometimes.',
    ['credit:doordash_restaurant', 'credit:united_travel', 'credit:dell', 'membership:clear']],
  [0.15, 'Needs a particular merchant, booking channel, stay or minimum that many holders won\'t use; few would prepay much for it.',
    ['credit:amex_fhr_thc', 'credit:hilton_property', 'credit:ihg_food_beverage', 'credit:doordash_nonrestaurant', 'credit:dining_exclusive_tables']],
  [0.1, 'Needs a narrow merchant list or a multi-night portal booking at portal prices; few would prepay much for it.',
    ['credit:chase_edit', 'credit:lyft', 'credit:instacart', 'credit:chatgpt_business', 'credit:google_workspace']],
  [0.05, 'One merchant most holders don\'t already use.', ['credit:lululemon', 'credit:saks', 'credit:stubhub', 'credit:chase_travel_select_hotels', 'credit:adobe']],
  [0.02, 'One merchant or service few holders use.', ['credit:oura', 'credit:indeed', 'credit:airbnb_experiences', 'credit:ziprecruiter', 'credit:expensify']],
  [0, 'A premium membership or boutique merchant almost no one would prepay for.', ['credit:equinox', 'credit:peloton_membership', 'credit:soulcycle']]
];
// Memberships the card pays for: worth their price only to people who'd subscribe anyway, and few would prepay for them.
const MEMBERSHIP = [
  [0.2, 'Worth its price only to people who would subscribe anyway.', ['credit:apple_services', 'membership:apple_services', 'membership:apple_tv']],
  [0.1, 'Worth its price only to people who would subscribe anyway.', ['membership:uber_one', 'membership:dashpass', 'membership:walmart_plus', 'membership:wyndham_insider']]
];
// Lounges: a traveler uses one lounge per visit, so the card's main network carries most of the value and others add little.
// The card's main network is the first of these it grants with ongoing access; the others on the card are secondary.
const MAIN_LOUNGE_ORDER = ['lounge_network:centurion', 'lounge_network:united_club', 'lounge_network:delta_sky_club', 'lounge_network:admirals_club',
  'lounge_network:capital_one_lounge', 'lounge_network:alaska_lounge', 'membership:priority_pass', 'lounge_network:chase_sapphire'];
// On a cobrand airline card the airline's own club comes first, even when the card also grants another network.
const AIRLINE_FIRST = ['lounge_network:united_club', 'lounge_network:delta_sky_club', 'lounge_network:admirals_club', 'lounge_network:alaska_lounge'];
// A handful of one-time passes (8 or fewer visits) is not a network the card gives access to; a larger visit
// allowance is access to the network with a cap.
const isPasses = v => v.limit?.count != null && v.limit.count <= 8 && v.grants?.some(g => g.entitlement.startsWith('lounge_network:'));
const mainLounge = card => (card.cobrand ? [...AIRLINE_FIRST, ...MAIN_LOUNGE_ORDER] : MAIN_LOUNGE_ORDER)
  .find(k => card.benefits.some(b => { const v = b.versions.at(-1); return !v.unlocked_only && !isPasses(v) && v.grants?.some(g => g.entitlement === k); }));
// Fixed dollar values for perks with no face value: [value, high, note].
const FIXED = {
  'lounge_network:centurion': [25, 400, 'A second network on this card, at a small number of airports.'],
  'lounge_network:delta_sky_club': [25, 500, 'Valuable only to people who fly Delta; a second network adds little to the card\'s main one.'],
  'membership:priority_pass': [25, 450, 'A second lounge network adds little when the card already has a main one.'],
  'lounge_network:chase_sapphire': [20, 400, 'A handful of airports; a second network adds little to Priority Pass.'],
  'lounge_network:plaza_premium': [5, 150, 'Few US locations; overlaps the card\'s other networks.'],
  'lounge_network:escape': [5, 100, 'Few locations; overlaps the card\'s other networks.'],
  'lounge_network:lufthansa': [0, 100, 'Only when flying Lufthansa Group airlines.'],
  'lounge_network:air_canada_maple_leaf': [5, 100, 'Only when flying Star Alliance through Canada.'],
  'lounge_guests:centurion': [0, 200, 'Only after a high spend threshold, and only for people who travel with guests.'],
  'status:hilton': [25, 300, 'Breakfast or a food credit at Hilton for people who stay a few nights a year.'],
  'status:marriott': [5, 150, 'Gold adds little; higher tiers matter only to frequent Marriott guests.'],
  'status:ihg': [5, 200, 'Platinum adds little beyond occasional upgrades; Diamond adds breakfast for frequent IHG guests.'],
  'status:lhw': [0, 50, 'Adds little over base membership.'],
  'status:hertz': [5, 100, 'Useful only to people who rent from Hertz.'],
  'status:national': [15, 150, 'Useful to people who rent cars several times a year.'],
  'status:avis': [0, 75, 'Useful only to people who rent from Avis.'],
  'status:hyatt': [5, 150, 'Explorist adds little unless you stay at Hyatt often.'],
  'status:southwest': [10, 300, 'Valuable only to people who fly Southwest often.'],
  'program:amex_fhr': [10, 300, 'Perks on luxury hotel bookings for people who book such hotels.'],
  'program:amex_thc': [5, 150, 'Perks on two-night bookings for people who book through Amex Travel.'],
  'program:amex_member_airfares': [0, 200, 'Occasional discounted fares through Amex Travel.'],
  'fee_waiver:foreign_transaction': [5, 300, 'Worth something only to people who spend abroad; most premium cards waive it too.'],
  'protection:trip_delay': [10, 150, 'Claims are rare; worth more to people who fly often.'],
  'protection:trip_cancellation': [10, 150, 'Claims are rare; worth more to people with expensive nonrefundable trips.'],
  'protection:rental_cdw': [10, 150, 'Worth more to people who rent cars often, and when primary.'],
  'protection:cell_phone': [10, 100, 'Saves buying separate phone insurance for people who would.'],
  'protection:purchase': [0, 50, 'Claims are rare; few would prepay for it.'],
  'protection:extended_warranty': [0, 50, 'Claims are rare; few would prepay for it.'],
  'protection:return': [0, 50, 'Claims are rare; few would prepay for it.'],
  'protection:lost_luggage': [0, 50, 'Claims are rare; few would prepay for it.'],
  'protection:baggage_delay': [0, 50, 'Claims are rare; few would prepay for it.'],
  'protection:emergency_evacuation': [0, 100, 'Claims are rare; peace of mind on international trips.'],
  'protection:travel_accident': [0, 25, 'Claims are very rare.'],
  'protection:roadside': [0, 50, 'Useful to people without another roadside plan.'],
  'program:ihg_fourth_night_free': [10, 300, 'Saves a night\'s points on award stays of four nights or more.'],
  'membership:instacart_plus': [5, 100, 'Worth its price only to people who would subscribe anyway.'],
  'redemption:points_boost': [0, 200, 'Boosted bookings are unpredictable; worth more to people who book through Chase Travel.']
};
// Classified across the whole catalog (reviewed): credit types assigned to a USAGE or MEMBERSHIP class by prepay share.
const ASSIGN = {
  "credit:accounting_software": 0.1,
  "credit:american_inflight": 0.2,
  "credit:american_vacations": 0.05,
  "credit:amex_business_flexible": 0.2,
  "credit:amex_dining_partners": 0.25,
  "credit:avis_budget": 0.1,
  "credit:bilt_cash": 0.35,
  "credit:blacklane": 0.05,
  "credit:capital_one_travel": 0.5,
  "credit:citi_relationship": 0.02,
  "credit:citi_travel_hotel": 0.1,
  "credit:delta_resy": 0.25,
  "credit:delta_stays": 0.15,
  "credit:disney_bundle": 0.2,
  "credit:dunkin": 0.2,
  "credit:grubhub": 0.2,
  "credit:hilton_resort": 0.15,
  "credit:hotel_portal": 0.1,
  "credit:inkind": 0.1,
  "credit:jsx": 0.05,
  "credit:marriott_dining": 0.35,
  "credit:meal_delivery": 0.2,
  "credit:renowned_hotels_united": 0.1,
  "credit:rideshare": 0.25,
  "credit:southwest_anniversary": 0.5,
  "credit:splurge": 0.1,
  "credit:squarespace": 0.05,
  "credit:streaming_general": 0.25,
  "credit:turo": 0.05,
  "credit:united_farelock": 0.02,
  "credit:united_hotels": 0.1,
  "credit:united_rideshare": 0.25,
  "credit:us_bank_travel": 0.5,
  "credit:wholesale_club": 0.25,
  "credit:wyndham_hotel": 0.15,
  "membership:wyndham_insider": 0.1
};
// More fixed values: perks with no face value found across the catalog.
Object.assign(FIXED, {
  "credit:booking_com_travel_credits": [
    5,
    100,
    "Rewards on Booking.com that need that booking channel and a trip."
  ],
  "credit:flight_delay_voucher_alaska": [
    2,
    100,
    "Paid only after a long delay, which is rare."
  ],
  "credit:hilton_luxury_property": [
    15,
    300,
    "Tied to a stay at particular Hilton properties; many holders will not use it."
  ],
  "credit:marriott_property": [
    15,
    300,
    "Tied to a stay at particular Marriott properties; many holders will not use it."
  ],
  "discount:alaska_lounge_membership": [
    5,
    150,
    "A discount on a lounge membership that helps only frequent Alaska flyers."
  ],
  "discount:american_vacations": [
    0,
    100,
    "Worth something only to people who book vacation packages."
  ],
  "discount:cultivist": [
    0,
    200,
    "Worth something only to people who would join a fitness-and-wellness club."
  ],
  "discount:fox_one": [
    5,
    100,
    "Worth something only to people who would subscribe anyway."
  ],
  "discount:inflight_alaska": [
    2,
    50,
    "Small discount on onboard purchases; worth little unless you buy often."
  ],
  "discount:inflight_american": [
    2,
    50,
    "Small discount on onboard purchases; worth little unless you buy often."
  ],
  "discount:inflight_delta": [
    2,
    50,
    "Small discount on onboard purchases; worth little unless you buy often."
  ],
  "discount:inflight_southwest": [
    2,
    50,
    "Small discount on onboard purchases; worth little unless you buy often."
  ],
  "discount:inflight_united": [
    2,
    50,
    "Small discount on onboard purchases; worth little unless you buy often."
  ],
  "discount:marriott_room_rate": [
    5,
    100,
    "A modest discount that helps only people who stay at Marriott."
  ],
  "discount:wyndham_room_rate": [
    5,
    100,
    "A modest discount that helps only people who stay at Wyndham."
  ],
  "earn_boost:us.amex.marriott-bonvoy-bevy.stay-bonus": [
    0,
    100,
    "Bonus points on Marriott stays; worth something only to frequent guests."
  ],
  "earn_boost:us.bilt.obsidian": [
    0,
    200,
    "Extra points under conditions; worth something only to high spenders."
  ],
  "earn_boost:us.bilt.palladium": [
    0,
    200,
    "Extra points under conditions; worth something only to high spenders."
  ],
  "earn_boost:us.bofa.atmos-ascent": [
    0,
    300,
    "Bonus requires a large Bank of America balance, so it applies to few holders."
  ],
  "earn_boost:us.bofa.atmos-summit": [
    0,
    300,
    "Bonus requires a large Bank of America balance, so it applies to few holders."
  ],
  "earn_boost:us.bofa.customized-cash": [
    0,
    300,
    "Bonus requires a large Bank of America balance, so it applies to few holders."
  ],
  "earn_boost:us.bofa.premium-rewards": [
    0,
    300,
    "Bonus requires a large Bank of America balance, so it applies to few holders."
  ],
  "earn_boost:us.bofa.premium-rewards-elite": [
    0,
    300,
    "Bonus requires a large Bank of America balance, so it applies to few holders."
  ],
  "earn_boost:us.chase.amazon-prime-visa": [
    0,
    100,
    "Bonus earning on Amazon; worth something only to heavy Amazon shoppers."
  ],
  "earn_boost:us.chase.marriott-bonvoy-bountiful.stay-bonus": [
    0,
    100,
    "Bonus points on Marriott stays; worth something only to frequent guests."
  ],
  "fee_waiver:checked_bag_alaska": [
    40,
    300,
    "Free first bag saves the fee only on trips where you would check one; discounted for prepay."
  ],
  "fee_waiver:checked_bag_american": [
    40,
    300,
    "Free first bag saves the fee only on trips where you would check one; discounted for prepay."
  ],
  "fee_waiver:checked_bag_delta": [
    40,
    300,
    "Free first bag saves the fee only on trips where you would check one; discounted for prepay."
  ],
  "fee_waiver:checked_bag_delta_second": [
    10,
    150,
    "A second free bag helps only travelers who check two bags, a minority of trips."
  ],
  "fee_waiver:checked_bag_southwest": [
    40,
    300,
    "Free first bag saves the fee only on trips where you would check one; discounted for prepaying."
  ],
  "fee_waiver:checked_bag_united": [
    40,
    300,
    "Free first bag saves the fee only on trips where you would check one; discounted for prepay."
  ],
  "fee_waiver:partner_award_booking_atmos": [
    0,
    100,
    "Saves a fee only on partner award bookings, made by few."
  ],
  "fee_waiver:same_day_change_alaska": [
    3,
    50,
    "Saves a fee only when you change flights, which is infrequent."
  ],
  "inflight_wifi:alaska": [
    5,
    50,
    "A few passes help only if you fly that airline and want wifi."
  ],
  "lounge_guests:delta_sky_club": [
    5,
    200,
    "Only for Delta flyers with the club who travel with guests."
  ],
  "membership:dashpass": [
    12,
    120,
    "Worth its price only to people who would subscribe anyway."
  ],
  "membership:uber_one": [
    10,
    100,
    "Worth its price only to people who would subscribe anyway."
  ],
  "membership:walmart_plus": [
    10,
    100,
    "Worth its price only to people who would subscribe anyway."
  ],
  "priority_boarding:alaska": [
    5,
    100,
    "Earlier boarding mainly secures overhead space; few would prepay much."
  ],
  "priority_boarding:american": [
    5,
    100,
    "Earlier boarding mainly secures overhead space; few would prepay much."
  ],
  "priority_boarding:delta": [
    5,
    100,
    "Earlier boarding mainly secures overhead space; few would prepay much."
  ],
  "priority_boarding:southwest": [
    5,
    100,
    "Earlier boarding mainly improves seat choice; few would prepay much."
  ],
  "priority_boarding:united": [
    5,
    100,
    "Earlier boarding mainly secures overhead space; few would prepay much."
  ],
  "program:bilt_housing_payments": [
    0,
    300,
    "Worth something only to renters who would otherwise pay a fee to earn points on rent."
  ],
  "program:capital_one_lifestyle": [
    0,
    100,
    "Perks on bookings through a portal for people who book such stays."
  ],
  "program:capital_one_premier": [
    5,
    150,
    "Perks on luxury hotel bookings for people who book such hotels."
  ],
  "program:cardmember_offers": [
    0,
    50,
    "Offers vary and must be used; few would prepay for them."
  ],
  "program:dining_reservations": [
    5,
    100,
    "Access to hard-to-get tables helps only people who dine out often."
  ],
  "program:expanded_award_availability_united": [
    5,
    200,
    "Extra award seats help only frequent award bookers."
  ],
  "program:hertz_apple_card": [
    3,
    75,
    "Perks useful only to people who rent from Hertz."
  ],
  "program:points_sharing_atmos": [
    0,
    50,
    "Helps only people who pool points with others."
  ],
  "program:presale_tickets": [
    0,
    100,
    "Presale access helps only people who buy tickets to popular events; availability is uncertain."
  ],
  "program:visa_infinite_lhc": [
    5,
    150,
    "Perks on luxury hotel bookings for people who book such hotels."
  ],
  "program:wyndham_points_no_expiration": [
    0,
    50,
    "Matters only to people who let points sit idle for years."
  ],
  "protection:price_protection": [
    0,
    50,
    "Claims are rare; few would prepay for it."
  ],
  "protection:travel_medical": [
    0,
    100,
    "Claims are rare; peace of mind on trips."
  ],
  "seat_selection:southwest": [
    5,
    100,
    "Seat choice matters to some travelers; few would prepay much for it."
  ],
  "status:omni": [
    5,
    100,
    "Mid-tier status adds little unless you stay at Omni often."
  ],
  "status:wyndham": [
    5,
    100,
    "Mid-tier status adds little unless you stay at Wyndham often."
  ],
  "upgrade_priority:delta": [
    0,
    100,
    "Upgrades clear rarely for cardholders without status; worth something only to frequent flyers."
  ],
  "upgrade_priority:southwest": [
    0,
    100,
    "Space-available upgrades clear rarely; worth something only to frequent flyers."
  ]
});
// Per-card certificates and exceptions: [value, high, note].
const BY_BENEFIT = {
  "us.amex.delta-platinum-business/companion-certificate": [
    100,
    400,
    "A companion fare worth a typical domestic fare saved, discounted for restrictions and non-use."
  ],
  "us.amex.delta-platinum/companion-certificate": [
    100,
    400,
    "A companion fare worth a typical domestic fare saved, discounted for restrictions and non-use."
  ],
  "us.amex.delta-reserve-business/companion-certificate": [
    125,
    600,
    "A companion fare worth a typical fare saved, discounted for restrictions and non-use."
  ],
  "us.amex.delta-reserve/companion-certificate": [
    125,
    600,
    "A companion fare worth a typical fare saved, discounted for restrictions and non-use."
  ],
  "us.amex.hilton-aspire/annual-free-night": [
    150,
    450,
    "A free night at almost any Hilton, discounted for the chance it expires unused."
  ],
  "us.amex.marriott-bonvoy-brilliant/free-night": [
    200,
    600,
    "A free night worth what you would otherwise pay, discounted for the chance it expires unused."
  ],
  "us.amex.marriott-bonvoy-business/free-night": [
    100,
    300,
    "A free night worth what you would otherwise pay, discounted for the chance it expires unused."
  ],
  "us.bofa.atmos-ascent/companion-fare": [
    75,
    400,
    "A discounted companion fare that needs a spend threshold and travel on one airline family."
  ],
  "us.bofa.atmos-summit/global-companion-25k": [
    75,
    400,
    "Covers a companion on an award booking; helps only people who book awards."
  ],
  "us.chase.marriott-bonvoy-boundless/free-night": [
    100,
    300,
    "A free night worth what you would otherwise pay, discounted for the chance it expires unused."
  ],
  "us.chase.ritz-carlton/club-upgrades": [
    15,
    400,
    "Upgrades help only on paid Ritz-Carlton stays with a club level, subject to availability."
  ],
  "us.chase.ritz-carlton/free-night": [
    200,
    600,
    "A free night worth what you would otherwise pay, discounted for the chance it expires unused."
  ],
  "us.chase.southwest-priority/tqp-boost-2027": [
    0,
    100,
    "Helps only status chasers who reach the threshold."
  ],
  "us.chase.world-of-hyatt/anniversary-free-night": [
    75,
    250,
    "A free night at a lower-category Hyatt, discounted for the chance of not using it."
  ],
  "us.citi.aadvantage-executive/omni-free-night": [
    50,
    200,
    "A free night after a two-night direct Omni stay; useful only to people who stay at Omni."
  ],
  "us.citi.aadvantage-globe/companion-certificate": [
    100,
    400,
    "A companion fare worth a typical domestic fare saved, discounted for restrictions and non-use."
  ],
  "us.citi.prestige/fourth-night-free": [
    10,
    300,
    "Saves a night on stays of four or more nights booked through Citi Travel."
  ]
};
// Perks that should have no default.
const SKIP = {
  "us.citi.costco-anywhere/annual-reward": "Cash-back payout of earned rewards as a certificate, not a separate perk; no prepay value."
};
// A free night is worth what you'd otherwise pay, discounted for the chance it expires unused.
const CERT = { 40000: 100, 50000: 125, 60000: 150 };

const out = {};
const miss = [];
for (const id of CARDS) {
  // Every benefit the card has ever had, at its newest version, so existing holders' older perks are reviewed too.
  const card = cat.cards.find(c => c.id === id);
  for (const rec of card.benefits) {
    const b = { ...rec.versions.at(-1), id: rec.id, kind: rec.kind };
    const key = b.grants[0]?.entitlement ?? '';
    const face = b.face_value?.amount ? b.face_value.amount / (b.period.cadence === 'every_n_years' ? (b.period.n ?? 1) : 1) / 100 : null;
    if (SKIP[b.id]) continue;
    const assigned = b.grants.map(g => ASSIGN[g.entitlement]).find(x => x !== undefined);
    const listed = [...USAGE, ...MEMBERSHIP].find(([, , keys]) => b.grants.some(g => keys.includes(g.entitlement)));
    // A credit type classified by share alone gets a note that states the share rather than another class's reason.
    const usage = listed ?? (assigned !== undefined ? [assigned, `Worth up to face value to holders who use it fully and little to others; a typical holder would prepay about ${Math.round(assigned * 100)}% of face.`, []] : undefined);
    let e;
    if (BY_BENEFIT[b.id]) { const [v, hi, note] = BY_BENEFIT[b.id]; out[b.id] = { personal_value: usd(v), low: usd(0), high: usd(hi), note }; continue; }
    // Spend-gated and points-paid perks keep their own values; redemption perks count only from a user's own value.
    if (b.kind === 'milestone' || b.kind === 'anniversary' || b.kind === 'redemption_modifier' || b.unlocked_only && !FIXED[key]) continue;
    // On an airline card the main network is the airline's own club, which is why people hold the card: a typical
    // holder flies that airline often and would prepay a real share of the membership's price.
    if (isPasses(b)) {
      const n = b.limit.count;
      out[b.id] = { personal_value: usd(15 * n), low: usd(0), high: usd(50 * n), note: 'One-time lounge passes: worth a little to occasional flyers who would otherwise buy a day pass.' };
      continue;
    }
    const AIRLINE_CLUBS = ['lounge_network:united_club', 'lounge_network:delta_sky_club', 'lounge_network:admirals_club', 'lounge_network:alaska_lounge'];
    if (card.cobrand && AIRLINE_CLUBS.includes(mainLounge(card)) && b.grants.some(g => g.entitlement === mainLounge(card)))
      e = { personal_value: usd(300), low: usd(0), high: usd(750), note: 'The airline\'s own club, the reason most holders have the card: worth a large share of a membership to people who fly the airline often.' };
    else if (mainLounge(card) && b.grants.some(g => g.entitlement === mainLounge(card)))
      e = { personal_value: usd(100), low: usd(0), high: usd(600), note: 'The card\'s main lounge network: worth a lot to frequent flyers at airports that have one, nothing to others.' };
    else if (usage && face) e = { usage_probability: String(usage[0]), low: usd(0), high: usd(face), note: usage[1] };
    else if (FIXED[key]) e = { personal_value: usd(FIXED[key][0]), low: usd(0), high: usd(FIXED[key][1]), note: FIXED[key][2] };
    else if (b.kind === 'certificate' && b.cap?.points && CERT[b.cap.points]) e = { personal_value: usd(CERT[b.cap.points]), low: usd(0), high: usd(CERT[b.cap.points] * 3), note: 'A free night is worth what you would otherwise pay, if you use it before it expires.' };
    else { miss.push(`${b.id} ${b.kind} ${key} face ${face}`); continue; }
    out[b.id] = e;
  }
}
console.log(`${Object.keys(out).length} defaults; ${miss.length} perks no rule covers${miss.length ? ':\n' + miss.join('\n') : ''}`);
if (!process.argv.includes('--check')) {
  const file = path.join(ROOT, 'examples', 'value-sets', 'benefit-values.yaml');
  const doc = YAML.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(doc.values, out);
  doc.values = Object.fromEntries(Object.entries(doc.values).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, YAML.stringify(doc, { singleQuote: true, anchorPrefix: 'id00' }).replace(/^as_of: (\d{4}-\d\d-\d\d)$/m, "as_of: '$1'"));
}
