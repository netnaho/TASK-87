import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

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
});
