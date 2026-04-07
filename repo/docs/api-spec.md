# HarborOps — API Specification

## Authentication

All endpoints require a JWT bearer token obtained from `POST /api/auth/login`.
Include it as `Authorization: Bearer <token>` on every request.

Role abbreviations used below: **A** = ADMIN, **M** = MANAGER,
**C** = INVENTORY_CLERK, **H** = HOST, **G** = GUEST, **Mo** = MODERATOR.

---

## Reports API

Base path: `/api/reports`

### GET /api/reports/kpi/dashboard

Returns the 30 most recent daily KPI rows, newest first.

**Auth:** M, A  
**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2024-08-20",
      "dau": 42,
      "conversionRate": "0.75",
      "aov": "18.50",
      "repurchaseRate": "63.50",
      "refundRate": "4.20"
    }
  ]
}
```

---

### GET /api/reports/review-efficiency

Returns the 30 most recent review-efficiency rows, newest first.

**Auth:** M, A  
**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2024-08-20",
      "avgModerationTimeHrs": "2.50",
      "flaggedCount": 12,
      "resolvedCount": 10,
      "appealRate": "20.00"
    }
  ]
}
```

---

### GET /api/reports/scheduled

Returns all scheduled reports owned by the authenticated user.

**Auth:** any authenticated role  
**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "reportType": "REVIEW_RISK",
      "format": "csv",
      "requestedBy": 1,
      "scheduledTime": "2024-08-20T10:00:00.000Z",
      "status": "READY",
      "filePath": "/app/uploads/reports/report_5.csv",
      "createdAt": "2024-08-20T09:55:00.000Z",
      "completedAt": "2024-08-20T09:55:03.000Z"
    }
  ]
}
```

---

### POST /api/reports/schedule

Create a new scheduled report.

**Auth:** M, A

**Report types:**

| Value | Description |
|-------|-------------|
| `KPI_SUMMARY` | 30-day KPI metrics (dau, conversionRate, aov, repurchaseRate, refundRate) |
| `REVIEW_EFFICIENCY` | 30-day moderation efficiency (avgModerationTimeHrs, flaggedCount, resolvedCount, appealRate) |
| `INVENTORY_SNAPSHOT` | Current stock levels for all items across all locations |
| `REVIEW_RISK` | 30-day risk analytics (flaggedContentCount, hideRemoveRate, appealOverturnRate, windowRepeatOffenders) |

**Request body:**
```json
{
  "reportType": "REVIEW_RISK",
  "scheduledFor": "2024-08-20T10:00:00.000Z",
  "format": "csv"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `reportType` | string enum | yes | One of the four types above |
| `scheduledFor` | ISO 8601 datetime | yes | When to process the report |
| `format` | `"csv"` \| `"excel"` | no | Defaults to `"csv"` |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "reportType": "REVIEW_RISK",
    "format": "csv",
    "status": "PENDING",
    "scheduledTime": "2024-08-20T10:00:00.000Z",
    "requestedBy": 1,
    "filePath": null,
    "createdAt": "2024-08-20T09:55:00.000Z",
    "completedAt": null
  }
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `ZodError` | 400 | Invalid `reportType` or missing required fields |
| `UNAUTHORIZED` | 401 | No valid token |
| `FORBIDDEN` | 403 | Role is not MANAGER or ADMIN |

---

### POST /api/reports/scheduled/:id/process

Trigger immediate processing of a PENDING scheduled report.

**Auth:** M, A — owner or ADMIN only

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "status": "READY",
    "filePath": "/app/uploads/reports/report_5.csv",
    "completedAt": "2024-08-20T09:55:03.000Z"
  }
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `NOT_FOUND` | 404 | Report ID does not exist |
| `FORBIDDEN` | 403 | Not the owner and not ADMIN |
| `INVALID_STATE` | 422 | Report is not in PENDING status |

---

### GET /api/reports/scheduled/:id/download

Stream the file for a READY report.

**Auth:** M, A — owner or ADMIN only

**Response 200:** file stream with `Content-Disposition: attachment; filename="<TYPE>_<id>.<ext>"`

For REVIEW_RISK CSV, the file contains:
- Line 1: `# Exported by: <username> | Timestamp: <ISO>`
- Line 2: header row — `date,flaggedContentCount,hideRemoveRate,appealOverturnRate,windowRepeatOffenders`
- Lines 3–32: 30 data rows (one per UTC calendar day, oldest first)

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `NOT_FOUND` | 404 | Report ID does not exist or file missing on disk |
| `FORBIDDEN` | 403 | Not the owner and not ADMIN |
| `NOT_READY` | 422 | Report status is not READY |

---

## Error envelope

All error responses use:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```
