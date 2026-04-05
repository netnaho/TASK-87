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

// Prisma client for direct DB lookups in tests
const { PrismaClient } = backendRequire('@prisma/client') as typeof import('@prisma/client');
const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'mysql://harborops:harborops_pass@localhost:3307/harborops' } },
});

export async function clearRateLimits(username?: string): Promise<void> {
  if (username) {
    const user = await testPrisma.user.findUnique({ where: { username } });
    if (user) {
      await testPrisma.rateLimitLog.deleteMany({ where: { userId: user.id } });
    }
  } else {
    await testPrisma.rateLimitLog.deleteMany({});
  }
}

export async function clearTaskRatings(): Promise<void> {
  await testPrisma.creditHistory.deleteMany({ where: { sourceType: 'TASK_RATING' } });
  await testPrisma.taskRating.deleteMany({});
}

export async function getInteractionId(
  requesterUsername: string,
  providerUsername: string,
  status: string
): Promise<number> {
  const interaction = await (testPrisma.serviceInteraction as any).findFirst({
    where: {
      requester: { username: requesterUsername },
      provider: { username: providerUsername },
      status,
    },
  });
  if (!interaction) throw new Error(`No ${status} interaction between ${requesterUsername} and ${providerUsername}`);
  return interaction.id;
}

export async function createProductAttribute(
  itemName: string,
  attributeName: string,
  attributeValue: string
): Promise<number> {
  const item = await testPrisma.item.findFirst({ where: { name: itemName } });
  if (!item) throw new Error(`Item not found: ${itemName}`);
  const attr = await testPrisma.productAttribute.create({
    data: { itemId: item.id, attributeName, attributeValue },
  });
  return attr.id;
}

export async function deleteProductAttribute(id: number): Promise<void> {
  await testPrisma.productAttribute.deleteMany({ where: { id } });
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
