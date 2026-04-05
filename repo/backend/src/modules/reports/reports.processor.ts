import path from 'path';
import fs from 'fs';
import prisma from '../../lib/prisma';
import { exportToCsv, exportToExcel } from '../../lib/exporter';
import { config } from '../../config';
import { logger } from '../../lib/logger';

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

const generators: Record<string, () => Promise<{ data: Record<string, unknown>[]; columns: string[] }>> = {
  KPI_SUMMARY: generateKpiSummary,
  REVIEW_EFFICIENCY: generateReviewEfficiency,
  INVENTORY_SNAPSHOT: generateInventorySnapshot,
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
