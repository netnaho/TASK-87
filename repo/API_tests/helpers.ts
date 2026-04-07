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

/** Seed N rate-limit log entries for a specific user+action within the current hour. */
export async function seedRateLimitLogs(
  username: string,
  action: string,
  count: number,
): Promise<void> {
  const user = await testPrisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`User not found: ${username}`);
  const now = new Date();
  await testPrisma.rateLimitLog.createMany({
    data: Array.from({ length: count }, () => ({ userId: user.id, action, createdAt: now })),
  });
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

/** Upsert a KpiDaily row for the given date with known non-zero values for all fields.
 *  Returns the UTC-midnight date used so callers can reference the exact record.
 *  Useful for verifying the dashboard returns populated (non-zero) numeric fields. */
export async function seedKpiRow(opts?: {
  dau?: number;
  conversionRate?: number;
  aov?: number;
  repurchaseRate?: number;
  refundRate?: number;
  date?: Date;
}): Promise<Date> {
  const dayStart = opts?.date ? new Date(opts.date) : new Date('2024-01-15T00:00:00.000Z');
  dayStart.setUTCHours(0, 0, 0, 0);
  await (testPrisma as any).kpiDaily.upsert({
    where: { date: dayStart },
    create: {
      date: dayStart,
      dau: opts?.dau ?? 42,
      conversionRate: opts?.conversionRate ?? 0.75,
      aov: opts?.aov ?? 18.50,
      repurchaseRate: opts?.repurchaseRate ?? 63.5,
      refundRate: opts?.refundRate ?? 4.2,
    },
    update: {
      dau: opts?.dau ?? 42,
      conversionRate: opts?.conversionRate ?? 0.75,
      aov: opts?.aov ?? 18.50,
      repurchaseRate: opts?.repurchaseRate ?? 63.5,
      refundRate: opts?.refundRate ?? 4.2,
    },
  });
  return dayStart;
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
