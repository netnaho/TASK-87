import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export interface ExportOptions {
  username: string;
  timestamp: string;
}

export function exportToCsv(
  data: Record<string, unknown>[],
  columns: string[],
  options: ExportOptions
): string {
  const watermark = `# Exported by: ${options.username} | Timestamp: ${options.timestamp}`;
  const csvContent = stringify(data, {
    header: true,
    columns,
  });
  return `${watermark}\n${csvContent}`;
}

export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: string[],
  sheetName: string,
  options: ExportOptions
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = options.username;
  workbook.created = new Date(options.timestamp);

  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col,
    key: col,
    width: 20,
  }));

  data.forEach((row) => sheet.addRow(row));

  // Watermark in header/footer
  sheet.headerFooter.oddHeader = `&L${options.username}&R${options.timestamp}`;
  sheet.headerFooter.oddFooter = `&LHARBOROPS CONFIDENTIAL&RPage &P of &N`;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
