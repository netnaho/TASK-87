import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers, seedKpiRow } from './helpers';

describe('Reports API', () => {
  let managerToken: string;
  let guestToken: string;
  let adminToken: string;
  let hostToken: string;
  let frontdeskToken: string;

  let scheduledReportId: number;

  beforeAll(async () => {
    [managerToken, guestToken, adminToken, hostToken, frontdeskToken] = await Promise.all([
      loginAs(demoUsers.manager.username, demoUsers.manager.password),
      loginAs(demoUsers.guest.username, demoUsers.guest.password),
      loginAs(demoUsers.admin.username, demoUsers.admin.password),
      loginAs(demoUsers.host.username, demoUsers.host.password),
      loginAs(demoUsers.frontdesk.username, demoUsers.frontdesk.password),
    ]);
  });

  // ─── Role-based access control ───────────────────────────────

  describe('RBAC enforcement', () => {
    const restrictedRoles = [
      { name: 'guest', token: () => guestToken },
      { name: 'host', token: () => hostToken },
      { name: 'frontdesk', token: () => frontdeskToken },
    ];

    for (const role of restrictedRoles) {
      it(`${role.name} cannot schedule a report (403)`, async () => {
        await api
          .post('/api/reports/schedule')
          .set('Authorization', `Bearer ${role.token()}`)
          .send({ reportType: 'KPI_SUMMARY', scheduledFor: new Date().toISOString() })
          .expect(403);
      });

      it(`${role.name} cannot process a report (403)`, async () => {
        // Role check fires before DB lookup — any numeric ID works
        await api
          .post('/api/reports/scheduled/1/process')
          .set('Authorization', `Bearer ${role.token()}`)
          .expect(403);
      });

      it(`${role.name} cannot download a report (403)`, async () => {
        await api
          .get('/api/reports/scheduled/1/download')
          .set('Authorization', `Bearer ${role.token()}`)
          .expect(403);
      });
    }

    it('manager can schedule a report (201)', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reportType: 'REVIEW_EFFICIENCY', scheduledFor: new Date().toISOString() })
        .expect(201);
      expect(res.body.success).toBe(true);
    });

    it('admin can schedule a report (201)', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reportType: 'REVIEW_EFFICIENCY', scheduledFor: new Date().toISOString() })
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Existing endpoints still work ────────────────────────────

  describe('Existing endpoints', () => {
    it('GET /api/reports/kpi/dashboard returns data for manager', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/reports/kpi/dashboard returns 403 for guest', async () => {
      await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('GET /api/reports/scheduled returns list for authenticated user', async () => {
      const res = await api
        .get('/api/reports/scheduled')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── KPI field shape and populated-value contract ──────────────

  describe('KPI dashboard — all five fields populated (not placeholder zeros)', () => {
    let seededDate: Date;

    beforeAll(async () => {
      // Seed a row with known non-zero values for all five KPI fields.
      // This simulates what the nightly aggregation job now writes.
      seededDate = await seedKpiRow({
        dau: 55,
        conversionRate: 0.82,
        aov: 22.75,
        repurchaseRate: 71.4,
        refundRate: 3.1,
      });
    });

    it('dashboard response is an array', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('each KPI row has all five required fields', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const row of res.body.data) {
        expect(row).toHaveProperty('dau');
        expect(row).toHaveProperty('conversionRate');
        expect(row).toHaveProperty('aov');
        expect(row).toHaveProperty('repurchaseRate');
        expect(row).toHaveProperty('refundRate');
      }
    });

    it('all five KPI fields are numeric (not null, not undefined)', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      for (const row of res.body.data) {
        expect(typeof Number(row.dau)).toBe('number');
        expect(typeof Number(row.conversionRate)).toBe('number');
        expect(typeof Number(row.aov)).toBe('number');
        expect(typeof Number(row.repurchaseRate)).toBe('number');
        expect(typeof Number(row.refundRate)).toBe('number');
        expect(isNaN(Number(row.aov))).toBe(false);
        expect(isNaN(Number(row.repurchaseRate))).toBe(false);
        expect(isNaN(Number(row.refundRate))).toBe(false);
      }
    });

    it('seeded row has non-zero aov, repurchaseRate, refundRate (not placeholder zeros)', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const seededDateStr = seededDate.toISOString().slice(0, 10);
      const row = res.body.data.find(
        (r: any) => String(r.date).slice(0, 10) === seededDateStr
      );
      expect(row).toBeDefined();
      expect(Number(row.dau)).toBe(55);
      expect(Number(row.aov)).toBeCloseTo(22.75, 1);
      expect(Number(row.repurchaseRate)).toBeCloseTo(71.4, 1);
      expect(Number(row.refundRate)).toBeCloseTo(3.1, 1);
    });

    it('GET /api/reports/kpi/dashboard returns 401 without auth', async () => {
      await api.get('/api/reports/kpi/dashboard').expect(401);
    });

    it('GET /api/reports/kpi/dashboard returns 403 for INVENTORY_CLERK', async () => {
      const clerkToken = await import('./helpers').then((h) =>
        h.loginAs(h.demoUsers.clerk.username, h.demoUsers.clerk.password)
      );
      await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${clerkToken}`)
        .expect(403);
    });

    it('GET /api/reports/kpi/dashboard is accessible for ADMIN', async () => {
      const res = await api
        .get('/api/reports/kpi/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ─── Schedule report creation ─────────────────────────────────

  describe('POST /api/reports/schedule', () => {
    it('creates a scheduled report successfully', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'KPI_SUMMARY',
          scheduledFor: new Date(Date.now() - 60000).toISOString(), // past time (due immediately)
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reportType).toBe('KPI_SUMMARY');
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.id).toBeTypeOf('number');
      scheduledReportId = res.body.data.id;
    });

    it('rejects invalid report type', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'INVALID_TYPE',
          scheduledFor: new Date().toISOString(),
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated requests', async () => {
      await api
        .post('/api/reports/schedule')
        .send({
          reportType: 'KPI_SUMMARY',
          scheduledFor: new Date().toISOString(),
        })
        .expect(401);
    });
  });

  // ─── Process and download ─────────────────────────────────────

  describe('Report processing and download', () => {
    it('processes a scheduled report to READY', async () => {
      const res = await api
        .post(`/api/reports/scheduled/${scheduledReportId}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.filePath).toBeTruthy();
      expect(res.body.data.completedAt).toBeTruthy();
    });

    it('rejects re-processing an already processed report', async () => {
      const res = await api
        .post(`/api/reports/scheduled/${scheduledReportId}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(422);

      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('downloads a READY report', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${scheduledReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('KPI_SUMMARY');
    });

    it('returns 403 when another user tries to download', async () => {
      await api
        .get(`/api/reports/scheduled/${scheduledReportId}/download`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(403);
    });

    it('returns 403 when another user tries to process', async () => {
      // Create a new report as manager
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'INVENTORY_SNAPSHOT',
          scheduledFor: new Date().toISOString(),
        })
        .expect(201);

      // Host (non-admin, non-manager, not owner) tries to process
      await api
        .post(`/api/reports/scheduled/${createRes.body.data.id}/process`)
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(403);
    });

    it('admin can access another user scheduled report', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${scheduledReportId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('KPI_SUMMARY');
    });
  });

  // ─── Object-level authorization: manager cannot access another user's report ──

  describe('Cross-user report access security', () => {
    let adminOwnedReportId: number;

    it('admin creates and processes a report (owned by admin)', async () => {
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reportType: 'KPI_SUMMARY',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);
      adminOwnedReportId = createRes.body.data.id;

      await api
        .post(`/api/reports/scheduled/${adminOwnedReportId}/process`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('manager cannot process a report owned by admin (403)', async () => {
      // Create a fresh pending report as admin to target with process
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reportType: 'REVIEW_EFFICIENCY',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);

      const res = await api
        .post(`/api/reports/scheduled/${createRes.body.data.id}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('manager cannot download a report owned by admin (403)', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${adminOwnedReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('admin can still download their own report (200)', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${adminOwnedReportId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-disposition']).toContain('KPI_SUMMARY');
    });
  });

  // ─── Format-specific behaviour ───────────────────────────────

  describe('Excel format scheduling and download', () => {
    let excelReportId: number;

    it('creates a scheduled report with format=excel', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'INVENTORY_SNAPSHOT',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
          format: 'excel',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.format).toBe('excel');
      excelReportId = res.body.data.id;
    });

    it('processes the excel report to READY', async () => {
      const res = await api
        .post(`/api/reports/scheduled/${excelReportId}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.filePath).toMatch(/\.xlsx$/);
    });

    it('downloads excel report with correct content-type and .xlsx filename', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${excelReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.headers['content-disposition']).toMatch(/\.xlsx/);
      expect(res.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });

  // ─── List includes new scheduled reports ──────────────────────

  describe('GET /api/reports/scheduled includes created reports', () => {
    it('returns the created scheduled report in list', async () => {
      const res = await api
        .get('/api/reports/scheduled')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const report = res.body.data.find((r: any) => r.id === scheduledReportId);
      expect(report).toBeDefined();
      expect(report.status).toBe('READY');
    });

    it('other users do not see the report in their list', async () => {
      const res = await api
        .get('/api/reports/scheduled')
        .set('Authorization', `Bearer ${hostToken}`)
        .expect(200);

      const report = res.body.data.find((r: any) => r.id === scheduledReportId);
      expect(report).toBeUndefined();
    });
  });

  // ─── REVIEW_RISK report — schedule / process / download ──────────

  describe('REVIEW_RISK report — full lifecycle', () => {
    let riskReportId: number;

    it('POST /api/reports/schedule accepts REVIEW_RISK type (201)', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'REVIEW_RISK',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reportType).toBe('REVIEW_RISK');
      expect(res.body.data.status).toBe('PENDING');
      riskReportId = res.body.data.id;
    });

    it('POST /api/reports/scheduled/:id/process generates REVIEW_RISK report (READY)', async () => {
      const res = await api
        .post(`/api/reports/scheduled/${riskReportId}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.filePath).toBeTruthy();
    });

    it('GET /api/reports/scheduled/:id/download returns a downloadable risk report', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${riskReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // Filename must include the report type
      expect(res.headers['content-disposition']).toContain('REVIEW_RISK');
    });

    it('downloaded CSV contains expected risk report columns', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${riskReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const csv: string = res.text;
      // Header row (after optional watermark comment line) must contain all columns
      const lines = csv.split('\n').filter((l) => !l.startsWith('#') && l.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      const header = lines[0];
      expect(header).toContain('date');
      expect(header).toContain('flaggedContentCount');
      expect(header).toContain('hideRemoveRate');
      expect(header).toContain('appealOverturnRate');
      expect(header).toContain('windowRepeatOffenders');
    });

    it('downloaded CSV has 30 data rows (one per day in the rolling window)', async () => {
      const res = await api
        .get(`/api/reports/scheduled/${riskReportId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const csv: string = res.text;
      // Strip watermark comment and header; count data rows
      const dataLines = csv
        .split('\n')
        .filter((l) => !l.startsWith('#') && l.trim().length > 0)
        .slice(1); // skip header row
      expect(dataLines.length).toBe(30);
    });

    it('POST /api/reports/schedule rejects unknown report type (400)', async () => {
      const res = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'UNKNOWN_TYPE',
          scheduledFor: new Date().toISOString(),
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('REVIEW_RISK excel format is also supported', async () => {
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'REVIEW_RISK',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
          format: 'excel',
        })
        .expect(201);

      expect(createRes.body.data.format).toBe('excel');
      const excelId: number = createRes.body.data.id;

      const processRes = await api
        .post(`/api/reports/scheduled/${excelId}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(processRes.body.data.status).toBe('READY');
      expect(processRes.body.data.filePath).toMatch(/\.xlsx$/);

      const dlRes = await api
        .get(`/api/reports/scheduled/${excelId}/download`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(dlRes.headers['content-disposition']).toMatch(/\.xlsx/);
      expect(dlRes.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });
  });

  // ─── Existing report types still work after adding REVIEW_RISK ───

  describe('Existing report types remain functional after REVIEW_RISK addition', () => {
    it('KPI_SUMMARY can still be scheduled and processed', async () => {
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'KPI_SUMMARY',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);
      expect(createRes.body.data.reportType).toBe('KPI_SUMMARY');

      const processRes = await api
        .post(`/api/reports/scheduled/${createRes.body.data.id}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(processRes.body.data.status).toBe('READY');
    });

    it('REVIEW_EFFICIENCY can still be scheduled and processed', async () => {
      const createRes = await api
        .post('/api/reports/schedule')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          reportType: 'REVIEW_EFFICIENCY',
          scheduledFor: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);
      expect(createRes.body.data.reportType).toBe('REVIEW_EFFICIENCY');

      const processRes = await api
        .post(`/api/reports/scheduled/${createRes.body.data.id}/process`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(processRes.body.data.status).toBe('READY');
    });
  });
});
