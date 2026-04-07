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
  const { aggregateKpiDaily } = await import('./kpiDailyAggregator');

  // Compute for yesterday (UTC midnight boundaries)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  await aggregateKpiDaily(yesterday, prisma);
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

  // Dynamic threshold mirrors computeLowStockThreshold() in inventory.utils.ts:
  //   threshold = max(safetyThreshold, avgDailyUsage * LOW_STOCK_DAYS_COVER[=7])
  // If LOW_STOCK_DAYS_COVER ever changes, update the multiplier below to match.
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
    WHERE sl.on_hand < GREATEST(sl.safety_threshold, sl.avg_daily_usage * 7)
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

// ─── Nightly review-efficiency aggregation (1 AM) ───────────────
registerJob('nightly-review-efficiency-aggregation', '0 1 * * *', async () => {
  const prisma = (await import('./prisma')).default;
  const { aggregateReviewEfficiency } = await import('../modules/reports/reviewEfficiencyAggregator');

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  logger.info(
    { date: yesterday.toISOString().slice(0, 10) },
    'review-efficiency aggregation job started',
  );
  try {
    await aggregateReviewEfficiency(yesterday, prisma);
    logger.info(
      { date: yesterday.toISOString().slice(0, 10) },
      'review-efficiency aggregation job completed',
    );
  } catch (error) {
    logger.error({ error }, 'review-efficiency aggregation job failed');
    throw error;
  }
});

// ─── Process due scheduled reports (every 1 minute) ────────────
registerJob('process-scheduled-reports', '* * * * *', async () => {
  const prisma = (await import('./prisma')).default;
  const { processScheduledReport } = await import('../modules/reports/reports.processor');

  const dueReports = await prisma.scheduledReport.findMany({
    where: {
      status: 'PENDING',
      scheduledTime: { lte: new Date() },
    },
    take: 5,
  });

  for (const report of dueReports) {
    try {
      await processScheduledReport(report.id);
    } catch (error) {
      logger.error({ reportId: report.id, error }, 'Failed to process scheduled report');
    }
  }
});

// ─── Cache cleanup every 30 minutes ─────────────────────────────
registerJob('cache-cleanup', '*/30 * * * *', async () => {
  const { cache } = await import('./cache');
  cache.cleanup();
  logger.info('Cache cleanup completed');
});
