import cron from 'node-cron';
import { logger } from './logger';

interface ScheduledJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
}

const jobs: ScheduledJob[] = [];

export function registerJob(name: string, schedule: string, task: () => Promise<void>): void {
  jobs.push({ name, schedule, task });
}

export function startScheduler(): void {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      logger.info({ job: job.name }, `Running scheduled job: ${job.name}`);
      try {
        await job.task();
        logger.info({ job: job.name }, `Completed job: ${job.name}`);
      } catch (error) {
        logger.error({ job: job.name, error }, `Job failed: ${job.name}`);
      }
    });
    logger.info({ job: job.name, schedule: job.schedule }, `Registered job: ${job.name}`);
  }
}

// ─── Nightly KPI aggregation (2 AM) ─────────────────────────────
registerJob('nightly-kpi-aggregation', '0 2 * * *', async () => {
  const prisma = (await import('./prisma')).default;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const today = new Date(yesterday);
  today.setDate(today.getDate() + 1);

  // DAU: count distinct users who generated rate limit log entries yesterday
  const dauRows = await prisma.rateLimitLog.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: yesterday, lt: today } },
  });
  const dau = dauRows.length;

  // Inventory turnover proxy: total ISSUE qty yesterday / avg onHand
  const issueAgg = await prisma.inventoryLedger.aggregate({
    _sum: { quantity: true },
    where: { movementType: 'ISSUE', createdAt: { gte: yesterday, lt: today } },
  });
  const totalIssues = issueAgg._sum.quantity ?? 0;

  const avgStockResult = await prisma.stockLevel.aggregate({ _avg: { onHand: true } });
  const avgStock = Number(avgStockResult._avg.onHand ?? 1);
  const conversionRate = avgStock > 0 ? totalIssues / avgStock : 0;

  await prisma.kpiDaily.upsert({
    where: { date: yesterday },
    create: {
      date: yesterday,
      dau,
      conversionRate,
      aov: 0,
      repurchaseRate: 0,
      refundRate: 0,
    },
    update: { dau, conversionRate },
  });

  logger.info({ date: yesterday.toISOString().slice(0, 10), dau, conversionRate }, 'KPI aggregation completed');
});

// ─── Nightly average daily usage update (3 AM) ──────────────────
registerJob('nightly-avg-usage-update', '0 3 * * *', async () => {
  const prisma = (await import('./prisma')).default;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Aggregate ISSUE quantities per (itemId, fromLocationId, lotId) over last 30 days
  const grouped = await prisma.inventoryLedger.groupBy({
    by: ['itemId', 'fromLocationId', 'lotId'],
    _sum: { quantity: true },
    where: { movementType: 'ISSUE', createdAt: { gte: thirtyDaysAgo } },
  });

  let updated = 0;
  for (const row of grouped) {
    if (row.fromLocationId === null) continue;
    const avgDailyUsage = (row._sum.quantity ?? 0) / 30;

    await prisma.stockLevel.updateMany({
      where: {
        itemId: row.itemId,
        locationId: row.fromLocationId,
        lotId: row.lotId ?? null,
      },
      data: { avgDailyUsage },
    });
    updated++;
  }

  logger.info({ updated }, 'Avg daily usage update completed');
});

// ─── Nightly low-stock reorder check (4 AM) ────────────────────
registerJob('nightly-low-stock-reorder', '0 4 * * *', async () => {
  const prisma = (await import('./prisma')).default;

  const lowStockItems = await prisma.stockLevel.findMany({
    where: {
      onHand: { lte: prisma.stockLevel.fields.safetyThreshold },
    },
    include: {
      item: { select: { id: true, name: true, sku: true } },
      location: { select: { id: true, name: true } },
    },
  });

  // Workaround: raw query for column-to-column comparison
  const lowStock = await prisma.$queryRaw<Array<{
    id: number;
    itemId: number;
    locationId: number;
    onHand: number;
    safetyThreshold: number;
    itemName: string;
    itemSku: string;
    locationName: string;
  }>>`
    SELECT sl.id, sl.item_id AS itemId, sl.location_id AS locationId,
           sl.on_hand AS onHand, sl.safety_threshold AS safetyThreshold,
           i.name AS itemName, i.sku AS itemSku, l.name AS locationName
    FROM stock_levels sl
    JOIN items i ON i.id = sl.item_id
    JOIN locations l ON l.id = sl.location_id
    WHERE sl.on_hand <= sl.safety_threshold
  `;

  if (lowStock.length > 0) {
    logger.warn(
      { count: lowStock.length, items: lowStock.map(s => ({ sku: s.itemSku, location: s.locationName, onHand: s.onHand, threshold: s.safetyThreshold })) },
      `Low-stock alert: ${lowStock.length} item(s) below safety threshold`
    );
  } else {
    logger.info('Low-stock check: all items above safety thresholds');
  }
});

// ─── Cache cleanup every 30 minutes ─────────────────────────────
registerJob('cache-cleanup', '*/30 * * * *', async () => {
  const { cache } = await import('./cache');
  cache.cleanup();
  logger.info('Cache cleanup completed');
});
