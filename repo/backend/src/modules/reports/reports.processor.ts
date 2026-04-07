import path from 'path';
import fs from 'fs';
import prisma from '../../lib/prisma';
import { exportToCsv, exportToExcel } from '../../lib/exporter';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import {
  fetchRiskDay,
  buildAuthorActionMap,
  computeHideRemoveRate,
  computeAppealOverturnRate,
  computeRepeatOffenderCount,
} from './riskReportAggregator';

async function generateKpiSummary(): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
  const kpis = await prisma.kpiDaily.findMany({ orderBy: { date: 'desc' }, take: 30 });
  const columns = ['date', 'dau', 'conversionRate', 'aov', 'repurchaseRate', 'refundRate'];
  const data = kpis.map((k) => ({
    date: k.date.toISOString().slice(0, 10),
    dau: k.dau,
    conversionRate: Number(k.conversionRate),
    aov: Number(k.aov),
    repurchaseRate: Number(k.repurchaseRate),
    refundRate: Number(k.refundRate),
  }));
  return { data, columns };
}

async function generateReviewEfficiency(): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
  const reports = await prisma.reportReviewEfficiency.findMany({ orderBy: { date: 'desc' }, take: 30 });
  const columns = ['date', 'avgModerationTimeHrs', 'flaggedCount', 'resolvedCount', 'appealRate'];
  const data = reports.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    avgModerationTimeHrs: Number(r.avgModerationTimeHrs),
    flaggedCount: r.flaggedCount,
    resolvedCount: r.resolvedCount,
    appealRate: Number(r.appealRate),
  }));
  return { data, columns };
}

async function generateInventorySnapshot(): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
  const stocks = await prisma.stockLevel.findMany({
    include: {
      item: { select: { name: true, sku: true, category: true } },
      location: { select: { name: true } },
    },
  });
  const columns = ['sku', 'itemName', 'category', 'location', 'onHand', 'safetyThreshold', 'avgDailyUsage'];
  const data = stocks.map((s) => ({
    sku: s.item.sku,
    itemName: s.item.name,
    category: s.item.category,
    location: s.location.name,
    onHand: s.onHand,
    safetyThreshold: s.safetyThreshold,
    avgDailyUsage: Number(s.avgDailyUsage),
  }));
  return { data, columns };
}

/**
 * REVIEW_RISK — 30-day rolling risk analytics.
 *
 * Columns:
 *   date                  — UTC calendar day
 *   flaggedContentCount   — reports filed on this day
 *   hideRemoveRate        — % of moderation actions that were HIDE or REMOVE
 *   appealOverturnRate    — % of finalised appeals that were OVERTURNED
 *   windowRepeatOffenders — distinct review authors with ≥2 HIDE/REMOVE
 *                           actions in the full 30-day window (snapshot,
 *                           same value on every row)
 *
 * Each row covers one UTC calendar day; newest day is the last row.
 */
async function generateReviewRisk(): Promise<{ data: Record<string, unknown>[]; columns: string[] }> {
  const DAYS = 30;
  const columns = [
    'date',
    'flaggedContentCount',
    'hideRemoveRate',
    'appealOverturnRate',
    'windowRepeatOffenders',
  ];

  // Window boundaries: today 00:00 UTC back 30 days
  const windowEnd = new Date();
  windowEnd.setUTCHours(0, 0, 0, 0);
  const windowStart = new Date(windowEnd);
  windowStart.setUTCDate(windowStart.getUTCDate() - DAYS);

  // Compute window-level repeat offenders once (same value on every row)
  const authorMap = await buildAuthorActionMap(windowStart, windowEnd, prisma);
  const windowRepeatOffenders = computeRepeatOffenderCount(authorMap);

  // Build one row per day, oldest → newest
  const data: Record<string, unknown>[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const dayStart = new Date(windowEnd);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const raw = await fetchRiskDay(dayStart, dayEnd, prisma);

    data.push({
      date: dayStart.toISOString().slice(0, 10),
      flaggedContentCount: raw.flaggedContentCount,
      hideRemoveRate: Number(
        computeHideRemoveRate(raw.hideRemoveActionCount, raw.totalActionCount).toFixed(2),
      ),
      appealOverturnRate: Number(
        computeAppealOverturnRate(raw.overturnedAppeals, raw.finalisedAppeals).toFixed(2),
      ),
      windowRepeatOffenders,
    });
  }

  return { data, columns };
}

const generators: Record<string, () => Promise<{ data: Record<string, unknown>[]; columns: string[] }>> = {
  KPI_SUMMARY: generateKpiSummary,
  REVIEW_EFFICIENCY: generateReviewEfficiency,
  INVENTORY_SNAPSHOT: generateInventorySnapshot,
  REVIEW_RISK: generateReviewRisk,
};

export async function processScheduledReport(reportId: number) {
  const report = await prisma.scheduledReport.findUnique({
    where: { id: reportId },
    include: { requester: { select: { username: true } } },
  });
  if (!report) throw Object.assign(new Error('Report not found'), { statusCode: 404, code: 'NOT_FOUND' });

  // Mark as PROCESSING
  await prisma.scheduledReport.update({
    where: { id: reportId },
    data: { status: 'PROCESSING' },
  });

  try {
    const generator = generators[report.reportType];
    if (!generator) throw new Error(`Unknown report type: ${report.reportType}`);

    const { data, columns } = await generator();
    const timestamp = new Date().toISOString();
    const options = { username: report.requester.username, timestamp };

    // Use the persisted format; fall back to csv for pre-migration rows (null/empty)
    const format: 'excel' | 'csv' = (report.format === 'excel') ? 'excel' : 'csv';

    const reportsDir = path.join(config.upload.dir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    let filePath: string;
    if (format === 'excel') {
      const buffer = await exportToExcel(data, columns, report.reportType, options);
      filePath = path.join(reportsDir, `report_${reportId}.xlsx`);
      fs.writeFileSync(filePath, buffer);
    } else {
      const csv = exportToCsv(data, columns, options);
      filePath = path.join(reportsDir, `report_${reportId}.csv`);
      fs.writeFileSync(filePath, csv);
    }

    const updated = await prisma.scheduledReport.update({
      where: { id: reportId },
      data: { status: 'READY', filePath, completedAt: new Date() },
    });

    logger.info({ reportId, reportType: report.reportType }, 'Scheduled report generated');
    return updated;
  } catch (error) {
    await prisma.scheduledReport.update({
      where: { id: reportId },
      data: { status: 'FAILED' },
    });
    logger.error({ reportId, error }, 'Failed to generate scheduled report');
    throw error;
  }
}
