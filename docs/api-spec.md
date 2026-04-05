# HarborOps API Specification (As Implemented)

## 1) Overview

This document describes the **implemented** backend REST API in `repo/backend/src`.

- Base URL (local): `http://localhost:3000/api`
- Content types:
  - `application/json` (default)
  - `multipart/form-data` (review + follow-up image uploads)
- Auth: Bearer JWT (`Authorization: Bearer <token>`)

Public static uploads are served at:

- `GET /uploads/<filename>`

---

## 2) Standard Response Envelope

All API endpoints use a common response envelope.

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

`details` is optional (commonly included for validation errors).

---

## 3) Authentication and Authorization

## 3.1 Bearer token behavior

- Missing/invalid header → `401 UNAUTHORIZED`
- Invalid/expired token → `401 TOKEN_INVALID`
- Authenticated but lacking role permission → `403 FORBIDDEN`

## 3.2 Role model

Supported roles:

- `ADMIN`
- `MANAGER`
- `INVENTORY_CLERK`
- `FRONT_DESK`
- `HOST`
- `GUEST`
- `MODERATOR`

---

## 4) Global Error Semantics

Common status patterns:

- `400` invalid request/query/body shape (`VALIDATION_ERROR`)
- `401` authentication failures
- `403` authorization/object-level permission failures
- `404` missing resources
- `409` conflicts/duplicates
- `422` business-rule state violations
- `500` unexpected server errors (`INTERNAL_ERROR`)

---

## 5) Health

## `GET /health`

- Auth: none
- Description: service liveness/metadata check
- Response `200`:
  - `status`
  - `timestamp`
  - `version`
  - `uptime`

---

## 6) Auth APIs (`/auth`)

## `POST /auth/register`

- Auth: none
- Body:
  - `username` (3..100, alphanumeric + underscore)
  - `password` (8..128)
  - `displayName` (1..200)
  - `phone?`
- Behavior:
  - creates user with role `GUEST`
  - creates initial trust score (50)
- Response: `201`, returns `{ user, token }`

## `POST /auth/login`

- Auth: none
- Body: `username`, `password`
- Response: `200`, returns `{ user, token }`

## `GET /auth/me`

- Auth: required
- Response: current user profile (safe fields only)

---

## 7) Users (`/users`)

## `GET /users`

- Auth: `ADMIN`
- Query: `page?`, `pageSize?`
- Response: paginated user list (`items`, `total`, `page`, `pageSize`, `totalPages`)

## `PATCH /users/:id/role`

- Auth: `ADMIN`
- Body: `{ "role": "<Role>" }`
- Response: updated user summary

---

## 8) Locations (`/locations`)

## `GET /locations`

- Auth: required
- Response: active locations (sorted by name)

## `POST /locations`

- Auth: `ADMIN`, `MANAGER`
- Body: `{ name, address? }`
- Response: `201`, created location

## `PATCH /locations/:id`

- Auth: `ADMIN`, `MANAGER`
- Body: partial `{ name?, address? }`
- Response: updated location

---

## 9) Inventory (`/inventory`)

## 9.1 Items

### `GET /inventory/items`

- Auth: required
- Query:
  - `page?`, `pageSize?`
  - `category?`
  - `search?`
  - `isActive?` (`true|false`)
- Response: paginated items

### `POST /inventory/items`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body:
  - `name`, `sku`, `category`
  - `barcode?`, `description?`
  - `isLotControlled?`, `requiresExpiration?`
  - `unitOfMeasure?`, `unitPrice?`
- Response: `201`, created item

### `GET /inventory/items/categories`

- Auth: required
- Response: string[] categories

### `GET /inventory/items/by-barcode/:barcode`

- Auth: required
- Response: item with stock levels/lots

### `GET /inventory/items/:id`

- Auth: required
- Response: item with stock levels/lots

### `PATCH /inventory/items/:id`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body: partial item fields
- Response: updated item

## 9.2 Vendors

### `GET /inventory/vendors`

- Auth: required
- Response: active vendors
- Note: encrypted contact field only included for admins

### `POST /inventory/vendors`

- Auth: `ADMIN`, `MANAGER`
- Body: `{ name, contact? }`
- Response: `201`, created vendor

### `PATCH /inventory/vendors/:id`

- Auth: `ADMIN`, `MANAGER`
- Body: partial `{ name?, contact? }`
- Response: updated vendor

## 9.3 Lots and stock levels

### `GET /inventory/lots`

- Auth: required
- Query: `itemId?`

### `GET /inventory/stock-levels`

- Auth: required
- Query: `itemId?`, `locationId?`
- Response: array of stock levels

### `PATCH /inventory/stock-levels/:id/threshold`

- Auth: `ADMIN`, `MANAGER`
- Body: `{ safetyThreshold: integer >= 0 }`
- Response: updated stock level

## 9.4 Movements

### `POST /inventory/receive`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body:
  - `vendorId`, `locationId`, `quantity`
  - `itemId?` or `barcode?` (one required)
  - `unitCostUsd?`, `packSize?`, `deliveryDatetime?`
  - `lotNumber?`, `expirationDate?`, `notes?`
- Response: `201`, ledger entry
- Business notes:
  - lot required for lot-controlled items
  - expiration required when item `requiresExpiration = true`
  - `unitCostUsd` is masked to `null` for non-admin responses

### `POST /inventory/issue`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body:
  - `locationId`, `quantity`
  - `itemId?` or `barcode?`
  - `lotId?`, `notes?`
- Response: `201`, ledger entry
- Business notes:
  - rejects insufficient stock
  - lot required for lot-controlled items
  - `unitCostUsd` masked for non-admins

### `POST /inventory/transfer`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body:
  - `fromLocationId`, `toLocationId`, `quantity`
  - `itemId?` or `barcode?`
  - `lotId?`, `notes?`
- Response: `201`, ledger entry
- Business notes:
  - source and destination must differ
  - rejects insufficient source stock
  - transactionally updates source/destination
  - `unitCostUsd` masked for non-admins

## 9.5 Stock counts

### `GET /inventory/stock-counts`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Query: `locationId?`, `status?`, `page?`, `pageSize?`
- Response: paginated stock counts

### `POST /inventory/stock-counts`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body: `{ locationId }`
- Response: `201`, created draft stock count

### `PUT /inventory/stock-counts/:id/lines`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Body:
  ```json
  {
    "lines": [{ "lineId": 1, "countedQty": 100 }]
  }
  ```

### `POST /inventory/stock-counts/:id/finalize`

- Auth: `ADMIN`, `MANAGER`, `INVENTORY_CLERK`
- Behavior:
  - computes aggregate variance
  - transitions to `PENDING_APPROVAL` if thresholds exceeded
  - otherwise auto-approves and applies adjustments

### `POST /inventory/stock-counts/:id/approve`

- Auth: `ADMIN`, `MANAGER`

### `POST /inventory/stock-counts/:id/reject`

- Auth: `ADMIN`, `MANAGER`

## 9.6 Low stock and ledger

### `GET /inventory/low-stock`

- Auth: required
- Query: `locationId?`
- Response: low-stock stock levels (dynamic threshold logic)

### `GET /inventory/ledger`

- Auth: `MANAGER`, `ADMIN`
- Query:
  - paging: `page`, `pageSize`
  - filters: `itemId`, `locationId`, `vendorId`, `lotId`, `movementType`, `startDate`, `endDate`
  - sorting: `sortField` (`createdAt|quantity|movementType`), `sortDir` (`asc|desc`)
- Response: paginated ledger + visible columns metadata
- Note: cost values masked for non-admins

### `GET /inventory/ledger/export`

- Auth: `MANAGER`, `ADMIN`
- Query: same filters as ledger + `format=csv|excel`
- Response: file download (`text/csv` or Excel MIME)

---

## 10) Reviews (`/reviews`)

## `GET /reviews/tags`

- Auth: required
- Response: available predefined tags

## `GET /reviews`

- Auth: required
- Query:
  - `page`, `pageSize`
  - `targetType=STAY|TASK`
  - `status=ACTIVE|FLAGGED|HIDDEN|REMOVED`
  - `revieweeId`
- Response: paginated review list (top-level reviews)

## `POST /reviews`

- Auth: required
- Content-Type: `multipart/form-data`
- Fields:
  - `revieweeId?`
  - `targetType` (`STAY|TASK`)
  - `targetId`
  - `ratingCleanliness`, `ratingCommunication`, `ratingAccuracy` (1..5)
  - `text?`
  - `tagIds?` (array)
  - `images[]` (max 6)
- Response: `201`, created review
- Constraints:
  - sensitive-word filtering
  - 3 reviews/hour rate limit
  - no self-review

## `GET /reviews/:id`

- Auth: required
- Response: detailed review with images/tags/replies/follow-ups

## `POST /reviews/:id/follow-up`

- Auth: required
- Content-Type: `multipart/form-data`
- Fields: same rating/text/tag/image structure as create review
- Response: `201`, follow-up review
- Constraints:
  - must be original reviewer
  - max one follow-up
  - 7-day window

## `POST /reviews/:id/reply`

- Auth: `HOST`, `ADMIN`, `MANAGER`
- Body: `{ text }`
- Response: `201`, created host reply
- Constraints:
  - one reply per review
  - 14-day window
  - object-level check for HOST

---

## 11) Trust (`/trust`)

## 11.1 Read endpoints

- `GET /trust/score` — own score
- `GET /trust/history` — own credit history (paged)
- `GET /trust/leaderboard?limit=` — top trust scores
- `GET /trust/users/:userId/score` — `ADMIN|MANAGER`
- `GET /trust/users/:userId/history` — `ADMIN|MANAGER`
- `GET /trust/admin/scores` — `ADMIN`

## 11.2 Action endpoints

### `POST /trust/rate` and `POST /trust/rate-task` (alias)

- Auth: required
- Body:
  - `rateeId`
  - `taskId`
  - `rating` (1..5)
  - `comment?`
- Response: `201`, `{ message, delta, explanation }`

### `POST /trust/adjust` and `POST /trust/admin-adjust` (alias)

- Auth: `ADMIN`
- Body:
  - `userId`
  - `changeAmount` (-100..100, non-zero)
  - `reason`
- Response: `{ userId, previousScore, newScore }`

---

## 12) Moderation (`/moderation`)

## 12.1 Reports

### `POST /moderation/reports`

- Auth: required
- Body:
  - `contentType`
  - `contentId`
  - `reviewId?`
  - `reason` (10..2000)
- Response: `201`, created report

### `GET /moderation/reports/queue` and `GET /moderation/queue` (alias)

- Auth: `MODERATOR`, `ADMIN`
- Query: `status?`, `page?`, `pageSize?`
- Response: paginated queue

### `POST /moderation/reports/:id/assign`

- Auth: `MODERATOR`, `ADMIN`
- Response: updated report

### `POST /moderation/reports/:id/action`

- Auth: `MODERATOR`, `ADMIN`
- Body: `{ action: WARN|HIDE|REMOVE|RESTORE, notes? }`
- Response: `201`, moderation action record

## 12.2 Audit

### `GET /moderation/audit`

- Auth: `ADMIN`
- Query: `page?`, `pageSize?`
- Response: paginated moderation actions

## 12.3 Appeals

### `POST /moderation/appeals`

- Auth: required
- Body: `{ moderationActionId, userStatement }`
- Response: `201`, created appeal

### `GET /moderation/appeals`

- Auth: `MODERATOR`, `ADMIN`
- Query: `status?`, `page?`, `pageSize?`

### `POST /moderation/appeals/:id/resolve`

- Auth: `ADMIN`
- Body:
  - `status` (`IN_REVIEW|UPHELD|OVERTURNED`)
  - `arbitrationNotes?`
  - `outcome?`

## 12.4 Sensitive words

### `GET /moderation/sensitive-words`

- Auth: `ADMIN`
- Query: `page?`, `pageSize?`

### `POST /moderation/sensitive-words`

- Auth: `ADMIN`
- Body: `{ word, category? }`
- Response: `201`

### `DELETE /moderation/sensitive-words/:id`

- Auth: `ADMIN`

---

## 13) Promotions (`/promotions`)

## `GET /promotions`

- Auth: required
- Query: `isActive?`, `page?`, `pageSize?`
- Response: paginated promotions

## `POST /promotions/checkout`

- Auth: required
- Body:
  ```json
  {
    "items": [{ "itemId": 101, "quantity": 2 }]
  }
  ```
- Response: cart line breakdown with chosen promotion and discount explanation

## `POST /promotions`

- Auth: `ADMIN`, `MANAGER`
- Body:
  - `name`, `discountType`, `discountValue`, `effectiveStart`, `effectiveEnd`
  - optional: `description`, `priority`, `isActive`, `conditions`, `itemIds`, `exclusions`
- Validations:
  - `effectiveStart < effectiveEnd`
  - percentage discount <= 100

## `PATCH /promotions/:id`

- Auth: `ADMIN`, `MANAGER`
- Body: partial promotion update

---

## 14) Search (`/search`)

## `GET /search/products`

- Auth: required
- Query:
  - required `q`
  - optional `category`, `attributeName`, `attributeValue`
  - optional sorting: `sortBy`, `sortDir`
  - pagination: `page`, `pageSize`
- Errors:
  - missing/empty `q` → `400 VALIDATION_ERROR`

## `GET /search/categories`

- Auth: required

## `GET /search/suggestions`

- Auth: required

## `GET /search/trending`

- Auth: `MANAGER`, `ADMIN`

## `PATCH /search/trending/:term`

- Auth: `ADMIN`
- Body: `{ isTrending: boolean }`

---

## 15) Reports (`/reports`)

## `GET /reports/kpi/dashboard`

- Auth: `MANAGER`, `ADMIN`
- Response: latest 30 KPI daily rows

## `GET /reports/review-efficiency`

- Auth: `MANAGER`, `ADMIN`
- Response: latest 30 review-efficiency rows

## `GET /reports/scheduled`

- Auth: required
- Response: scheduled reports requested by current user

## `POST /reports/schedule`

- Auth: `MANAGER`, `ADMIN`
- Body:
  - `reportType`: `KPI_SUMMARY | REVIEW_EFFICIENCY | INVENTORY_SNAPSHOT`
  - `scheduledFor`: ISO datetime
  - `format?`: `csv | excel` (default `csv`)
- Response: `201`, scheduled report row

## `POST /reports/scheduled/:id/process`

- Auth: `MANAGER`, `ADMIN`
- Purpose: immediate trigger (testing/ops)
- Constraints:
  - must be `PENDING`
  - must be accessible by requester/manager/admin

## `GET /reports/scheduled/:id/download`

- Auth: `MANAGER`, `ADMIN`
- Constraints:
  - report must be `READY`
  - file path must exist on disk
- Response: file download (csv/xlsx)

---

## 16) Pagination Convention

Most list endpoints use:

- query: `page`, `pageSize`
- response:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 0
}
```

Internal bounds:

- `page >= 1`
- `1 <= pageSize <= 100`

---

## 17) Upload Constraints (Reviews)

For `POST /reviews` and `POST /reviews/:id/follow-up`:

- accepted image MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- max file size per image: 5 MB
- max image count per request: 6

---

## 18) Notable Endpoint Aliases

Implemented aliases for compatibility:

- `POST /trust/rate-task` → same behavior as `POST /trust/rate`
- `POST /trust/admin-adjust` → same behavior as `POST /trust/adjust`
- `GET /moderation/queue` → same behavior as `GET /moderation/reports/queue`
