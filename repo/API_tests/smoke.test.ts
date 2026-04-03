import { describe, it, expect } from 'vitest';
import { api, loginAs, demoUsers } from './helpers';

describe('Smoke Tests - All Major Endpoints', () => {
  let adminToken: string;
  let managerToken: string;
  let clerkToken: string;
  let guestToken: string;

  it('should login all demo users for subsequent tests', async () => {
    adminToken = await loginAs(demoUsers.admin.username, demoUsers.admin.password);
    managerToken = await loginAs(demoUsers.manager.username, demoUsers.manager.password);
    clerkToken = await loginAs(demoUsers.clerk.username, demoUsers.clerk.password);
    guestToken = await loginAs(demoUsers.guest.username, demoUsers.guest.password);

    expect(adminToken).toBeTruthy();
    expect(managerToken).toBeTruthy();
    expect(clerkToken).toBeTruthy();
    expect(guestToken).toBeTruthy();
  });

  it('GET /api/locations should return locations', async () => {
    const res = await api
      .get('/api/locations')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('name');
  });

  it('GET /api/inventory/items should return paginated items', async () => {
    const res = await api
      .get('/api/inventory/items')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
    expect(res.body.data).toHaveProperty('pageSize');
  });

  it('GET /api/inventory/vendors should return vendors', async () => {
    const res = await api
      .get('/api/inventory/vendors')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/inventory/low-stock should return alerts', async () => {
    const res = await api
      .get('/api/inventory/low-stock')
      .set('Authorization', `Bearer ${clerkToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/reviews should return reviews list', async () => {
    const res = await api
      .get('/api/reviews')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
  });

  it('GET /api/trust/score should return trust score', async () => {
    const res = await api
      .get('/api/trust/score')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('score');
  });

  it('GET /api/promotions should return promotions list', async () => {
    const res = await api
      .get('/api/promotions')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
  });

  it('GET /api/search/products should return products', async () => {
    const res = await api
      .get('/api/search/products?q=towel')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
  });

  it('GET /api/search/suggestions should return terms', async () => {
    const res = await api
      .get('/api/search/suggestions')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/reports/kpi/dashboard should return KPIs for managers', async () => {
    const res = await api
      .get('/api/reports/kpi/dashboard')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('should return 404 for unknown routes', async () => {
    const res = await api
      .get('/api/nonexistent/route')
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
