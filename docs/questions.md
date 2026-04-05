# Business Logic Questions Log (HarborOps)

This document records business-logic questions identified while interpreting the task prompt and validating against the current implementation in `repo/`.

Format used for each item:

- **Question**
- **My Understanding / Hypothesis**
- **Solution**

---

## 1) Low-stock threshold rule: strict `<` or inclusive `<=`?

**Question:** The prompt says low-stock alerts should trigger when on-hand drops below the threshold (max of 10 units or 7-day usage). Should exactly-equal stock trigger an alert?

**My Understanding / Hypothesis:** “Drops below” implies strict `<`, but operations teams often prefer inclusive `<=` to get an earlier warning.

**Solution:** Current API logic uses strict `<` in `inventory.service.ts` (`isLowStock: onHand < threshold`), while nightly scheduler uses `<= safety_threshold`. Keep API behavior as source of truth for UI alerts and document scheduler’s inclusive check as an operational early-warning variant.

---

## 2) Dynamic threshold source for scheduled low-stock jobs

**Question:** Should nightly low-stock checks use dynamic threshold `max(safetyThreshold, avgDailyUsage * 7)` or only static `safetyThreshold`?

**My Understanding / Hypothesis:** Prompt requires dynamic threshold logic universally for alerts.

**Solution:** Current implementation is split: API uses dynamic threshold; scheduled job currently compares only `on_hand <= safety_threshold`. Treat this as a known decision gap and prioritize aligning the scheduled job with dynamic threshold logic in a follow-up change.

---

## 3) Stock count approval trigger scope

**Question:** For “variance exceeds 5% or $250,” should approval be triggered per line item or on total count document variance?

**My Understanding / Hypothesis:** The prompt is ambiguous; either interpretation is plausible.

**Solution:** Current implementation uses aggregate variance across all lines (`overallVariancePct` and `totalVarianceUsd`) in `finalizeStockCount`. Accept this as the operational rule and document it explicitly to avoid line-level expectation mismatch.

---

## 4) Lot tracking requirement for non-receiving movements

**Question:** For lot-controlled items, should `issue` and `transfer` always require lot selection, or can FIFO auto-selection be used?

**My Understanding / Hypothesis:** Prompt emphasizes traceability, which favors explicit lot selection.

**Solution:** Current implementation requires `lotId` for lot-controlled items in both `issue` and `transfer`; no implicit FIFO lot picking is performed. Keep explicit user selection as the confirmed rule.

---

## 5) Expiration requirement semantics

**Question:** Is expiration tracking always coupled to lot control, or can an item require expiration without lot control?

**My Understanding / Hypothesis:** Prompt says lot-controlled items must record lot and expiration “when applicable,” but does not define strict coupling.

**Solution:** Current implementation treats `requiresExpiration` as independent from `isLotControlled` (see schema comments and `receive` validation). Keep this flexible model and surface this rule in product documentation.

---

## 6) Vendor unit cost visibility boundaries

**Question:** Which roles are allowed to view unit cost in receiving/ledger flows?

**My Understanding / Hypothesis:** Prompt explicitly restricts non-admin users from viewing vendor costs.

**Solution:** Current implementation masks `unitCostUsd` for non-admins in ledger and movement responses, and only exposes vendor encrypted contact to admins. Keep ADMIN-only cost visibility as the enforced rule.

---

## 7) Follow-up review cardinality

**Question:** Can a guest post multiple follow-up reviews within 7 days, or only one?

**My Understanding / Hypothesis:** “Optionally post a follow-up review” sounds singular.

**Solution:** Current implementation allows exactly one follow-up per parent review (`DUPLICATE` check). Keep one-follow-up-only policy and document this as intentional.

---

## 8) Rate limit scope (top-level reviews vs follow-ups/replies)

**Question:** Does the 3 reviews/hour anti-spam limit apply only to initial reviews, or also to follow-ups and host replies?

**My Understanding / Hypothesis:** Business wording implies all review submissions should be rate-limited.

**Solution:** Current implementation enforces 3/hour on `createReview` only (rateLimitLog action `create_review`), not on follow-ups/replies. Record this as an open policy decision; recommended direction is to apply the same limit to follow-ups for consistency.

---

## 9) Review moderation trigger for image content

**Question:** Should sensitive-word filtering apply only to text or also OCR/text extracted from images?

**My Understanding / Hypothesis:** Prompt explicitly states sensitive-word dictionary filtering but does not mention OCR.

**Solution:** Current implementation filters text fields only; image files are validated for type/size/count. Keep text-only filtering for offline simplicity and note OCR as out-of-scope unless explicitly required.

---

## 10) Host reply authorization model

**Question:** Can any HOST reply to any review, or only the host being reviewed?

**My Understanding / Hypothesis:** Prompt implies object-level ownership (“hosts can reply once”) rather than global host permissions.

**Solution:** Current implementation enforces object-level ownership for HOST and allows ADMIN/MANAGER override. Keep this as the final authorization rule.

---

## 11) Promotion conflict resolution granularity

**Question:** Should conflict/exclusion be evaluated globally across cart or independently per line item?

**My Understanding / Hypothesis:** Prompt asks for deterministic best offer with itemized breakdown but does not specify optimization scope.

**Solution:** Current implementation tracks globally applied promotions and enforces exclusions across subsequent lines, then uses priority and max-savings tie-break per line. Accept this deterministic approach and document that it is greedy + global-exclusion, not full cart optimization.

---

## 12) Promotion tie-break details beyond savings

**Question:** If priority ties and savings tie too, what final tie-breaker should be used (e.g., earliest start date, lowest ID)?

**My Understanding / Hypothesis:** Prompt only defines max-savings tie-break when priorities tie; equal-savings case is unspecified.

**Solution:** Current ordering uses priority and discount value; runtime pick logic updates on strictly greater savings. Preserve deterministic DB ordering for equal outcomes and document this as implicit behavior.

---

## 13) Search suggestion/trending lifecycle

**Question:** Should trending be auto-derived by frequency windows only, or manually curated by managers/admins?

**My Understanding / Hypothesis:** Prompt says trending keywords are visible to managers; it does not prescribe how terms become trending.

**Solution:** Current implementation logs terms automatically and supports explicit trending flag toggling (ADMIN) plus manager visibility. Keep hybrid model (automatic frequency + manual curation).

---

## 14) Scheduled report delivery timing and timezone

**Question:** “Prepared at a chosen time” — is chosen time interpreted in server timezone, location timezone, or user profile timezone?

**My Understanding / Hypothesis:** Multi-location operations usually require explicit timezone semantics.

**Solution:** Current implementation processes reports when `scheduledTime <= now` (server-side). Mark timezone policy as an open clarification and recommend storing timezone per scheduled report to avoid cross-location ambiguity.

---

## 15) KPI definitions for conversion/AOV/repurchase/refund

**Question:** Prompt lists KPIs (DAU, conversion, AOV, repurchase, refund rate) but does not provide exact formulas.

**My Understanding / Hypothesis:** Without strict formulas, dashboards can diverge by team interpretation.

**Solution:** Current implementation computes DAU and a conversion proxy from issue quantity vs average stock; AOV/repurchase/refund are placeholders in nightly job. Record formulas as pending product clarification before strict analytics sign-off.

---

## 16) Appeal workflow ownership and SLA

**Question:** Who can move appeals between statuses, and are SLA deadlines required for arbitration?

**My Understanding / Hypothesis:** Prompt requires triage + arbitration notes + final outcomes, but not explicit SLA timings.

**Solution:** Current implementation supports appeal statuses and moderation outcomes for audit. Keep role-restricted moderation flow as baseline and treat SLA timing as a future policy layer.

---

## 17) Immutable ledger correction strategy

**Question:** If a receiving/issue/transfer entry was created in error, should records be editable, or corrected only by reversal entries?

**My Understanding / Hypothesis:** Prompt requires immutable ledger for traceability.

**Solution:** Current design is append-only ledger; corrections should be done via compensating movements/stock count adjustments, not in-place edits. Keep immutable model as mandatory.

---

## 18) Export governance for sensitive fields

**Question:** Should exported reports ever include sensitive fields (vendor costs, phone data) for non-admin roles?

**My Understanding / Hypothesis:** Prompt explicitly forbids non-admin access for sensitive financial/governance data.

**Solution:** Current implementation enforces role-based field masking and watermarks (`username + timestamp`) in CSV/Excel. Keep this as compliance baseline for offline sharing/audits.
