import { describe, it, expect } from 'vitest';
import { exportToCsv, exportToExcel } from '@/lib/exporter';

const sampleData = [
  { name: 'Item A', quantity: 10, location: 'Main' },
  { name: 'Item B', quantity: 5, location: 'Annex' },
];
const columns = ['name', 'quantity', 'location'];
const options = { username: 'testuser', timestamp: '2026-04-07T00:00:00.000Z' };

// ─── CSV watermark ────────────────────────────────────────────────────────────

describe('Exporter - CSV watermark', () => {
  it('prepends watermark comment as first line', () => {
    const csv = exportToCsv(sampleData, columns, options);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toMatch(/^# Exported by:/);
  });

  it('watermark contains username', () => {
    const csv = exportToCsv(sampleData, columns, options);
    expect(csv).toContain('testuser');
  });

  it('watermark contains timestamp', () => {
    const csv = exportToCsv(sampleData, columns, options);
    expect(csv).toContain('2026-04-07T00:00:00.000Z');
  });

  it('CSV body still includes header row after watermark', () => {
    const csv = exportToCsv(sampleData, columns, options);
    const lines = csv.split('\n').filter(Boolean);
    // lines[0] = watermark, lines[1] = header
    expect(lines[1]).toContain('name');
    expect(lines[1]).toContain('quantity');
    expect(lines[1]).toContain('location');
  });

  it('CSV body includes data rows', () => {
    const csv = exportToCsv(sampleData, columns, options);
    expect(csv).toContain('Item A');
    expect(csv).toContain('Item B');
  });
});

// ─── Excel watermark ─────────────────────────────────────────────────────────

describe('Exporter - Excel watermark', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await exportToExcel(sampleData, columns, 'TestSheet', options);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('Excel file starts with XLSX magic bytes (PK zip header)', async () => {
    const buf = await exportToExcel(sampleData, columns, 'TestSheet', options);
    // XLSX is a ZIP file; ZIP magic bytes are 50 4B 03 04
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });
});

// ─── Options passthrough ──────────────────────────────────────────────────────

describe('Exporter - options passthrough', () => {
  it('different usernames produce different CSV watermarks', () => {
    const csv1 = exportToCsv(sampleData, columns, { username: 'alice', timestamp: 'T1' });
    const csv2 = exportToCsv(sampleData, columns, { username: 'bob', timestamp: 'T1' });
    expect(csv1.split('\n')[0]).toContain('alice');
    expect(csv2.split('\n')[0]).toContain('bob');
    expect(csv1.split('\n')[0]).not.toContain('bob');
  });

  it('empty data produces watermark + header only (no data rows)', () => {
    const csv = exportToCsv([], columns, options);
    const lines = csv.split('\n').filter(Boolean);
    // watermark + header = 2 lines
    expect(lines.length).toBe(2);
  });
});
