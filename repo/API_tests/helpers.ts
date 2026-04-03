import { createRequire } from 'module';
import path from 'path';
// Resolve from backend/node_modules since that's where supertest is installed
const backendRequire = createRequire(path.resolve(__dirname, '../backend/package.json'));
const supertest = backendRequire('supertest') as typeof import('supertest').default;

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export const api = supertest(BASE_URL);

export async function loginAs(username: string, password: string): Promise<string> {
  const res = await api
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);

  return res.body.data.token;
}

export const demoUsers = {
  admin: { username: 'admin', password: 'admin123!' },
  manager: { username: 'manager', password: 'manager123!' },
  clerk: { username: 'clerk', password: 'clerk123!' },
  frontdesk: { username: 'frontdesk', password: 'frontdesk123!' },
  host: { username: 'host', password: 'host123!' },
  guest: { username: 'guest', password: 'guest123!' },
  moderator: { username: 'moderator', password: 'moderator123!' },
};
