// Types for the OCCB v0.2 catalog bundle (dist/catalog.json) and user layer.
export type Money = { amount: number; currency: string };
export type Condition = { type: string; note?: string; [k: string]: unknown };
export type Grant = { entitlement: string; combine: CombineRule; attributes?: Record<string, unknown>; value_share?: string; stacking_confidence?: string };
export type CombineRule = 'sum' | 'max' | 'any' | 'once_per_beneficiary' | 'primary_then_excess';
export type Period = { cadence: string; anchor?: string; n?: number; window_days?: number; anchor_month?: number; anchor_day?: number; schedule?: Record<string, Money>; tz?: string };

export interface BenefitVersion {
  version: number; supersedes?: number; change_type: string; release: string;
  effective_from?: string | null; effective_to?: string; enroll_by?: string; unlocked_only?: boolean;
  face_value?: Money | null; reward?: { currency: string; points?: number }; reward_cash?: Money;
  period: Period; limit?: Record<string, unknown>; grants: Grant[]; conditions?: Condition[]; beneficiaries?: string[];
  credited_spend_earns?: boolean;
  notes?: string; confidence?: string; sources: { url: string }[];
}
export interface Benefit { id: string; card_id: string; kind: string; name: string; versions: BenefitVersion[]; scope?: 'catalog' | 'user'; wallet_card_id?: string; based_on?: string }
export interface EarnRuleVersion {
  version: number; release: string; multiplier?: string; boost?: string; currency?: string; stacks?: boolean;
  cap?: Money; cap_period?: string; cap_group?: string; conditions?: Condition[];
  schedule?: { from: string; to: string; categories: string[] }[]; effective_from?: string; effective_to?: string; notes?: string;
}
export type EarnChoice = { mode: 'holder_selects' | 'top_spend' | 'rotating'; pick?: number; selection?: string; period?: string; groups?: { id: string; name?: string; categories: string[] }[] };
export interface EarnRule { id: string; categories: string[]; exclude_categories?: string[]; choice?: EarnChoice; versions: EarnRuleVersion[] }
export interface ReleaseChange { target: string; version?: number; change_type?: 'retired'; to?: Money; rate?: string; free_count?: number }
export interface Release {
  id: string; card_id: string; kind: 'baseline' | 'refresh' | 'change'; effective_for_new: string;
  announced_on?: string; first_seen_on?: string; notes?: string; changes: ReleaseChange[];
  transition?: { applies_to: string[]; on?: string; next_renewal_on_or_after?: string; never?: true }[];
  legacy?: { path: string; rate?: string; applies_to_lots?: { earned_before?: string }; effective_to: string; notes?: string }[];
}
export interface Card { id: string; issuer_id: string; name: string; earns: string; family?: string; tier?: string; segment?: string; based_on?: { card: string; exclude?: string[]; not_followed?: { release: string; reason: string }[] }; benefits: Benefit[]; earn_rules: EarnRule[]; releases: Release[] }
export interface Path { id: string; kind: string; rate?: string; rate_expected?: string; to?: string; ratio?: string; requires?: Condition[]; effective_from?: string; effective_to?: string }
export interface Currency { id: string; name: string; kind?: string; cents_per_point?: string; paths: Path[] }
export interface Catalog {
  occb: string; cards: Card[]; currencies: Currency[];
  entitlement_types: { id: string; combine: CombineRule; spend_category?: string }[];
  spend_categories: { id: string; parent?: string; name: string; explicit_only?: boolean }[];
}

/** A value set (spec section 11): one publisher's or user's values for perks and points. Never part of the catalog. */
export interface ValueSet {
  benefit_values?: { scope?: string; source?: string; as_of?: string; method?: string; values: Record<string, PersonalValue & { usage_probability?: string; low?: Money; high?: Money }> };
  valuations?: { currency: string; cpp: string; method: string; scope: string; as_of: string }[];
  /** Finance assumptions (spec section 12): discount rate, devaluation by currency, holding period. */
  finance?: { discount_rate?: string; devaluation?: Record<string, string>; holding_period_months?: number };
}

export interface Holder { opened_on: string; fee_post_dates?: string[] }
export interface WalletCard extends Holder {
  /** Fees actually paid, after waivers and retention offers; a recorded amount on a fee date replaces the catalog fee. */
  fee_paid?: { date: string; amount: Money }[];
  id: string; card_id: string; holder: string; status?: 'open' | 'closed'; selections?: Record<string, unknown>;
  /** Acquisition offers this person received (spec Appendix F); offers are never catalog data. */
  offers?: Offer[];
}
/** A user's own value for a benefit or earn rule. `basis: present_value` means a price paid up front, not discounted again. */
export type PersonalValue = { personal_value?: Money; basis?: 'annual' | 'present_value'; note?: string };
export interface Wallet {
  occb: '0.2';
  people: { id: string; label?: string; home_airports?: string[] }[];
  cards: WalletCard[];
  spend_profile?: { amounts: Record<string, number> };
  valuations?: { currency: string; cpp: string; method: string; scope: string; as_of: string }[];
  benefit_values?: Record<string, PersonalValue & { usage_probability?: string }>;
  /** The user's values by entitlement key; one answer applies to every benefit that grants it (section 10). */
  entitlement_values?: Record<string, PersonalValue & { usage_probability?: string }>;
  /** Direct values for earn rules, for users who value a bonus category instead of giving a spend profile (section 10). */
  earn_values?: Record<string, PersonalValue & { personal_value: Money }>;
  custom_benefits?: (Benefit & { versions: (Omit<BenefitVersion, 'release' | 'sources' | 'period' | 'grants'> & Partial<Pick<BenefitVersion, 'release' | 'sources' | 'period' | 'grants'>>)[] })[];
  redemption_mix?: Record<string, Record<string, string>>;
  goals?: { spend_thresholds?: string[] };
  finance?: { discount_rate?: string; devaluation?: Record<string, string>; holding_period_months?: number; horizon_months?: number; include_offers?: boolean };
}

/** An acquisition offer (spec Appendix F). */
export interface OfferComponent {
  type: 'bonus' | 'fee_waiver' | 'intro_apr' | 'intro_earn' | 'other';
  reward?: { currency: string; points?: number }; reward_max?: { currency: string; points?: number }; reward_cash?: Money;
  spend_required?: Money; window_days?: number;
  fee?: string; amount?: Money; card_years?: number[];
  applies_to?: string; rate?: string; months?: number;
  categories?: string[]; multiplier?: string; boost?: string; stacks?: boolean; cap?: Money;
}
export interface Offer { id?: string; card_id: string; components: OfferComponent[]; earned_on?: string; accepted_on?: string; summary?: string }
