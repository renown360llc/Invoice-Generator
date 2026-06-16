# Analytics — Brutal Review & Redesign Notes

_Reviewed as an owner who actually runs the business on this page. Grounded in
`analytics.html` and `src/analytics-main.js` (2,542 lines)._

## 1. What's on the page today

**Filters:** search, status, client, W2, currency, period (month/year + "All
months" toggle), saved views, clear, refresh. (+ mobile filter sheet.)

**Overview tab**
- 6 KPI cards: **Hours**, **Projected**, **Collected**, **Cash Flow**, **Consultants**, **Coverage**.
- Charts: **Accrual vs Collections** (grouped bars), **Invoice Status Distribution**, **Cash Flow Trend**, **Collections Aging**.
- 5 insight cards: Top Client, Top Consultant, Billing Status, Commission Tracking, Unbilled Hours Alert.

**Clients tab:** Client Revenue Breakdown table + CSV export.
**Pivot tab:** Consultant × Month pivot. **Detail drawer** for drill-downs.

## 2. Brutal opinion

It's a *capable but confusing* page. It shows a lot, but it doesn't **answer
questions in priority order**, and its headline money numbers are subtly
different from each other, inconsistently named, and built on fragile parsing.
An invested owner stares at it and can't confidently say "this is what I earned,
this is what I'm owed, this is what hit the bank." That's the cardinal sin of a
finance dashboard.

## 3. The real problems (ranked)

1. **Three "revenue" numbers nobody can tell apart.**
   - *Projected* (KPI) = invoice value of hours logged. The chart calls the
     same thing *Accrual*. Two names, one concept.
   - *Collected* (KPI) tooltip literally says "(Accrual basis)" — but it's cash
     collected, attributed to the **work** month. Mislabeled and a weird hybrid.
   - *Cash Flow* = cash received, attributed to the **received** month.
   → Same invoice lands in different months in different cards. No owner can
   reconcile these. **This is problem #1.**

2. **The numbers rest on fragile heuristics.** `getInvoiceDistribution()`
   regex-parses free-text line-item `period` strings ("jan", "2026-01-…") to
   spread an invoice across months. Type a period differently and money silently
   lands in the wrong month (or a paid_date fallback). Analytics you can't trust
   are worse than none.

3. **No hierarchy / overload.** 6 KPIs + 4 charts + 5 insight cards, all equal
   weight. Nothing says "look here first."

4. **Mixed accounting bases with no frame.** Accrual (Projected) sits next to
   cash (Cash Flow) with no grouping/labels — invites apples-to-oranges reading.

5. **The same idea is shown 3×.** "Coverage (Invoiced)" KPI + "Billing Status"
   insight + "Unbilled Hours Alert" insight all describe billed-vs-unbilled hours.

6. **Definitions hidden in hover tooltips.** The one place the critical meaning
   lives is the place you can't see at a glance (and one tooltip is wrong).

7. **Cross-currency comparison risk.** The Accrual-vs-Collections bars compare
   projected vs collected even when currencies are mixed (CAD bar vs USD bar).
   Per-currency stacking is right elsewhere; this chart breaks the rule.

8. **Inconsistent interactivity.** Some KPIs are clickable filters (Hours,
   Projected, Consultants, Coverage), others aren't (Collected, Cash Flow). No
   visual rule tells you which.

9. **Framed as "timesheets view," not a business dashboard.** Subtitle says
   "Read-only performance view from timesheets." Owner wants money + AR +
   profit. The **referral cut you keep** and **commissions** never show as margin.

## 4. What I'd build instead

**Principle: answer the owner's questions, in order.**
1. How much cash did I take in? 2. How much am I owed, and how overdue?
3. How much did I earn vs actually bill (leakage)? 4. Who/what drives it?

**Principle: one time model, labeled.** Every metric states its basis *on the
card* (e.g. "cash · received month", "accrual · work month"). Pick one rule and
stick to it.

**Principle: progressive disclosure.** A 4-number headline → themed sections →
tabs for depth. No more flat wall.

**Principle: currency discipline.** Never compare across currencies in one bar.
Default to per-currency stacks or a chosen currency; cash is USD-only (done).

### Proposed Overview layout

- **Headline strip (max 4):**
  `Collected (USD, period)` · `Outstanding AR (per ccy + overdue)` ·
  `Earned/Accrued (per ccy)` · `Billing coverage %`.
- **Revenue funnel:** Logged → Invoiced → Collected as one funnel per currency,
  showing **leakage** at each step (this replaces "Accrual vs Collections" and
  makes the 3 numbers finally make sense as *stages*, not rivals).
- **Receivables module:** Aging buckets + status distribution + a "Who owes you"
  top-5 list, together.
- **Delivery module:** hours, active consultants, run-rate, utilization.
- **Profit lens (later):** Collected − referral pass-through − commissions =
  **your kept margin**. This is the number an owner actually cares about.
- **Tabs:** Clients · Consultants (pivot) · Trends (rolling 12-mo).

**Merge/kill:** Coverage KPI + Billing Status + Unbilled Alert → one Billing
module. Unify "Projected/Accrual" to a single name. Move definitions out of
hovers into small captions.

## 5. Phased plan (low risk → high value first) — ✅ all delivered

- **Phase 1 — Clarity (no data changes):** ✅ unified terminology
  (Projected/Accrual → Earned), bases as visible captions, fixed the wrong
  Collected tooltip, dropped the redundant Billing Status insight + dead drill,
  cross-currency warning on the Earned-vs-Collected bars, fixed label overlap.
- **Phase 2 — Revenue funnel + Receivables:** ✅ Earned→Invoiced→Collected
  funnel with leakage + "Who owes you" list. Pure module `analytics-money.js`
  (`buildFunnel`, `topOutstanding`) + tests.
- **Phase 3 — Attribution at the source:** ✅ line items persist a canonical
  `work_month`; `getInvoiceDistribution` prefers it over regex (legacy still
  falls back — no migration needed).
- **Phase 4 — Margin lens:** ✅ "Your kept margin" = collected − referral
  payouts − commissions (USD, currency-safe). `keptMargin()` + tests.

## 6. Quick wins shippable today
- Rename "Projected" ⇆ "Accrual" to one term everywhere.
- Fix the wrong "Collected = Accrual basis" tooltip.
- Captions under each KPI stating currency + basis + period.
- Collapse the 3 billing-coverage surfaces into 1.
