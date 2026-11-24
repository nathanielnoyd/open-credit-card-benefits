# Known limitations of the reference engine

The spec describes more than the engine implements yet.

| Area | What the spec says | What the engine does today |
| --- | --- | --- |
| Protections | Valued against travel spend routed to the card that pays | Combined per wallet with the best-one rule |
| Attribute combining | Guests take the max, restaurant access takes any, per attribute | Combines whole entitlements, not attributes |
| Path transitions | Release transition rules apply to redemption paths | Paths change by date only, so existing Preferred holders get the 4:3 Hyatt ratio from June 15, 2026 rather than October 1 |
| Legacy rates and lots | Legacy paths apply to matching points lots | Lots are stored but not valued separately |
| Period schedules | Per-period overrides such as a larger December credit | Valuation uses the annual face value, which already includes them |
| Rolling cadences and visit units | Claims per 12 months; visits per 24 hours | Treated as annual |
| Selections | Conditions such as the chosen airline | Enforced on earn rules (chosen categories, relationship tiers); stored but not enforced on benefits |
| Earn rules | Caps, shared caps, chosen, top-spend and rotating categories, stacking and boost rules | Implemented. Caps are annualized over the horizon; rotating caps count once per scheduled period; `min_transaction` rules never apply, because a spend profile holds category totals, not purchase sizes |
| Spend thresholds | Constraint in spend assignment | Greedy least-cost moves; not optimal with several caps and thresholds |
| Lounge value | Valued against lounges the person can reach | Uses a flat per-benefit value |
| Status goals | Spend routed to reach elite status | Status credits have no cash value unless the user gives them one in `valuations`; then spend moves to the card that earns them |
| Benefit conditions | Typed predicates on every benefit | Benefits are valued from face value and usage odds; their conditions (merchants, booking channel) are not checked against spend |
