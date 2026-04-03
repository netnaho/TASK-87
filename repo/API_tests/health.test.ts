import { describe, it, expect } from 'vitest';
import { api } from './helpers';

describe('Health Endpoint', () => {
  it('GET /api/health should return healthy status', async () => {
    const res = await api.get('/api/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.version).toBe('1.0.0');
    expect(res.body.data.timestamp).toBeTruthy();
    expect(res.body.data.uptime).toBeGreaterThan(0);
  });
});
