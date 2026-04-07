# HarborOps — Design Documentation

## KPI Definitions

All five KPI fields are computed nightly (2 AM UTC) by the `nightly-kpi-aggregation`
scheduler job via `backend/src/lib/kpiDailyAggregator.ts`. Each row in `kpi_daily`
covers one UTC calendar day and is written idempotently (upsert by `date`).

Because HarborOps is a lodging & supply management system rather than a traditional
e-commerce platform, it has no Order, Checkout, or Refund models. The KPIs below use
**proxy formulas** derived from the available domain data (inventory ledger, activity
logs, stock levels). The proxy interpretation is noted for each metric.

---

### DAU — Daily Active Users

**Formula:**
```
DAU = count(distinct userId in rate_limit_log WHERE date = target_day)
```

**Source:** `rate_limit_log` table — every authenticated API call writes an entry.
**Interpretation:** Number of distinct users who made at least one API request on the
target day. Accurate for any role.

---

### conversionRate — Inventory Turnover Rate

**Formula:**
```
conversionRate = SUM(quantity WHERE movementType='ISSUE' AND date=target_day)
                 / AVG(onHand) across all stock_levels
```

**Source:** `inventory_ledger` (ISSUE movements) + `stock_levels`.
**Interpretation:** Proxy for demand fulfillment throughput — how many units were
issued relative to average inventory on hand. Higher values indicate stronger demand
satisfaction relative to available stock.

---

### AOV — Average Order Value (Supply Disbursement Value)

**Formula:**
```
AOV = SUM(|quantity| × item.unitPrice  for ISSUE rows on target_day)
      / COUNT(ISSUE rows on target_day)
```

**Source:** `inventory_ledger` (ISSUE movements joined to `items.unit_price`).
**Interpretation:** Because there are no orders, each ISSUE ledger entry is treated as
one "transaction". AOV measures the average monetary value of a single supply
disbursement event. Items with no `unitPrice` contribute zero value but are still
counted in the denominator.

**Returns 0** when there are no ISSUE movements on the target day.

---

### repurchaseRate — Returning-User Retention Rate

**Formula:**
```
repurchaseRate =
  |{users active on target_day} ∩ {users active in prior 30 days}|
  / |users active on target_day|  × 100
```

**Source:** `rate_limit_log` — active users on the target day vs. users active in the
30-day window immediately before it.
**Interpretation:** Percentage of yesterday's active users who were also active at
some point in the preceding 30 days. A value of 100 % means every active user was a
returning user; 0 % means all users are new to the window.

**Returns 0** when DAU is 0 (avoids division-by-zero).

---

### refundRate — Inventory Return Rate

**Formula:**
```
refundRate =
  COUNT(ADJUSTMENT rows with quantity < 0 on target_day)
  / COUNT(ISSUE rows on target_day)  × 100
```

**Source:** `inventory_ledger` — negative-quantity ADJUSTMENT movements (stock
corrections / supplier returns) as a fraction of ISSUE movements on the same day.
**Interpretation:** Proxy for how often issued stock is returned or corrected. A high
refund rate may indicate quality issues or incorrect initial disbursements.

**Returns 0** when there are no ISSUE movements on the target day (denominator guard).

---

## Implementation Notes

| Concern | Approach |
|---------|----------|
| Pure functions | `computeAov`, `computeRepurchaseRate`, `computeRefundRate` in `kpiDailyAggregator.ts` accept plain data — no Prisma dependency — making them trivially unit-testable |
| Idempotency | `kpiDaily.upsert({ where: { date } })` — safe to re-run for the same day |
| Backward compat | No schema changes; all five fields already existed in `kpi_daily` with `DEFAULT 0`. The scheduler previously left `aov`, `repurchaseRate`, `refundRate` as placeholder zeros and only partially updated on re-run. Both issues are now fixed. |
| Day boundary | All aggregations use UTC midnight (`setUTCHours(0,0,0,0)`) for consistency across time zones |
| Prisma type cast | The aggregator calls Prisma via `const p = prisma as any` to decouple from the generated client version; all field names match the Prisma schema exactly |

---

---

## Risk Report (REVIEW_RISK)

### Overview

`REVIEW_RISK` is a scheduled-report type that produces a 30-day rolling risk
analytics snapshot. It is generated on demand (via `POST /api/reports/schedule`
with `reportType: "REVIEW_RISK"`) and downloaded as CSV or Excel.

### Column definitions

| Column | Type | Definition |
|--------|------|-----------|
| `date` | string (YYYY-MM-DD) | UTC calendar day |
| `flaggedContentCount` | integer | Count of `Report` rows created on this day |
| `hideRemoveRate` | decimal (%) | `count(HIDE + REMOVE actions) / count(all actions) × 100` — 0 if no actions |
| `appealOverturnRate` | decimal (%) | `count(OVERTURNED) / count(UPHELD + OVERTURNED appeals finalised today) × 100` — 0 if no finalised appeals |
| `windowRepeatOffenders` | integer | Distinct review authors with ≥2 HIDE/REMOVE actions in the full 30-day window (same snapshot value on every row) |

### Data sources

| Metric | Source tables |
|--------|--------------|
| flaggedContentCount | `reports` |
| hideRemoveRate | `moderation_actions` (action enum: HIDE, REMOVE, WARN, RESTORE) |
| appealOverturnRate | `appeals` (status: UPHELD, OVERTURNED; resolvedAt within day window) |
| windowRepeatOffenders | `moderation_actions` → `reports` → `reviews` (authorId chain) |

### Pure formula functions

All four formulas live in `backend/src/modules/reports/riskReportAggregator.ts`
as exported pure functions with no Prisma dependency, enabling isolated unit tests:

- `computeHideRemoveRate(hideRemoveCount, totalActionCount)` — returns 0 when denominator is 0
- `computeAppealOverturnRate(overturnedCount, finalisedAppealCount)` — returns 0 when denominator is 0
- `computeRepeatOffenderCount(authorActionCounts: Map<authorId, count>)` — counts authors with ≥2 actions
- `buildAuthorActionMap(windowStart, windowEnd, prisma)` — constructs the author→count map from DB
- `fetchRiskDay(dayStart, dayEnd, prisma)` — fetches raw counts for one calendar day

### No schema changes

`ScheduledReport.reportType` is a `VarChar(100)` string field (not a DB enum), so
`REVIEW_RISK` requires no migration. All source data tables (`reports`,
`moderation_actions`, `appeals`) already exist in the schema.

---

## Upgrading to First-Party Metrics

If HarborOps is extended with an Order or Transaction model, the proxy formulas
above can be replaced without any breaking API or schema changes — only the body of
`aggregateKpiDaily()` needs updating. The `kpi_daily` table shape, the
`/api/reports/kpi/dashboard` response contract, and the frontend dashboard all remain
unchanged.
