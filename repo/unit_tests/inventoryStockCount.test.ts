/**
 * Unit tests for inventory service stock count workflow:
 * createStockCount, updateLines, listStockCounts, finalizeStockCount,
 * approveStockCount, rejectStockCount
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    item: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    vendor: { findMany: vi.fn() },
    lot: { findMany: vi.fn() },
    stockLevel: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    inventoryLedger: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    stockCount: {
      findMany: vi.fn(), count: vi.fn(), create: vi.fn(),
      findUnique: vi.fn(), update: vi.fn(),
    },
    stockCountLine: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((t: string) => `enc:${t}`),
  decrypt: vi.fn((t: string) => t),
  maskPhone: vi.fn(() => '***'),
}));

vi.mock('@/lib/exporter', () => ({
  exportToCsv: vi.fn().mockResolvedValue(Buffer.from('csv')),
  exportToExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx')),
}));

import prisma from '@/lib/prisma';
import { inventoryService } from '@/modules/inventory/inventory.service';

const txMock = {
  stockCount: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  stockCountLine: { createMany: vi.fn(), update: vi.fn() },
  stockLevel: { findFirst: vi.fn(), update: vi.fn() },
  inventoryLedger: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMock));
  txMock.stockCount.create.mockResolvedValue({ id: 1 });
  txMock.stockCount.update.mockResolvedValue({ id: 1, status: 'APPROVED' });
  txMock.stockCountLine.createMany.mockResolvedValue({ count: 0 });
  txMock.stockLevel.findFirst.mockResolvedValue(null);
  txMock.stockLevel.update.mockResolvedValue({});
  txMock.inventoryLedger.create.mockResolvedValue({});
});

// ─── listStockCounts ──────────────────────────────────────────────────────────

describe('InventoryService - listStockCounts', () => {
  it('returns paginated list of all stock counts', async () => {
    vi.mocked(prisma.stockCount.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(prisma.stockCount.count).mockResolvedValue(1);

    const result = await inventoryService.listStockCounts({});
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('applies status filter when provided', async () => {
    vi.mocked(prisma.stockCount.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.stockCount.count).mockResolvedValue(0);

    await inventoryService.listStockCounts({ status: 'DRAFT' });
    const call = vi.mocked(prisma.stockCount.findMany).mock.calls[0][0] as any;
    expect(call.where.status).toBe('DRAFT');
  });
});

// ─── createStockCount ─────────────────────────────────────────────────────────

describe('InventoryService - createStockCount', () => {
  it('creates stock count with lines from current stock levels', async () => {
    vi.mocked(prisma.stockLevel.findMany).mockResolvedValue([
      { id: 1, itemId: 10, lotId: null, onHand: 50, item: { unitPrice: '5.00' } },
    ] as any);

    txMock.stockCount.findUnique.mockResolvedValue({
      id: 1, status: 'DRAFT', location: {}, initiator: {}, lines: [],
    });

    const result = await inventoryService.createStockCount({ locationId: 3 }, 1);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txMock.stockCount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { locationId: 3, initiatedBy: 1 } })
    );
    expect(txMock.stockCountLine.createMany).toHaveBeenCalledOnce();
  });

  it('creates stock count with no lines when location has no stock', async () => {
    vi.mocked(prisma.stockLevel.findMany).mockResolvedValue([] as any);

    txMock.stockCount.findUnique.mockResolvedValue({
      id: 2, status: 'DRAFT', location: {}, initiator: {}, lines: [],
    });

    await inventoryService.createStockCount({ locationId: 99 }, 2);

    expect(txMock.stockCountLine.createMany).not.toHaveBeenCalled();
  });
});

// ─── updateLines ─────────────────────────────────────────────────────────────

describe('InventoryService - updateLines', () => {
  it('throws NOT_FOUND when stock count does not exist', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue(null);

    await expect(
      inventoryService.updateLines(999, { lines: [{ lineId: 1, countedQty: 5 }] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INVALID_STATE when count is not in DRAFT status', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 1, status: 'APPROVED', lines: [],
    } as any);

    await expect(
      inventoryService.updateLines(1, { lines: [{ lineId: 1, countedQty: 5 }] })
    ).rejects.toMatchObject({ code: 'INVALID_STATE', statusCode: 422 });
  });

  it('updates counted quantity and computes variance for each line', async () => {
    vi.mocked(prisma.stockCount.findUnique)
      .mockResolvedValueOnce({
        id: 1, status: 'DRAFT',
        lines: [
          { id: 10, systemQty: 50, item: { unitPrice: '2.00' } },
        ],
      } as any)
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT', lines: [] } as any);
    vi.mocked(prisma.stockCountLine.update).mockResolvedValue({} as any);

    await inventoryService.updateLines(1, { lines: [{ lineId: 10, countedQty: 45 }] });

    expect(prisma.stockCountLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          countedQty: 45,
          varianceQty: -5,
        }),
      })
    );
  });

  it('throws NOT_FOUND when a lineId is not found in this count', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 1, status: 'DRAFT', lines: [{ id: 5, systemQty: 10, item: { unitPrice: null } }],
    } as any);

    await expect(
      inventoryService.updateLines(1, { lines: [{ lineId: 999, countedQty: 5 }] })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── finalizeStockCount ───────────────────────────────────────────────────────
// NOTE: finalizeStockCount(stockCountId) takes only ONE argument.
// When needsApproval=true it calls prisma.stockCount.update directly.
// When needsApproval=false it uses prisma.$transaction for auto-approve.

describe('InventoryService - finalizeStockCount', () => {
  it('throws NOT_FOUND when stock count does not exist', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue(null);

    await expect(inventoryService.finalizeStockCount(999)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('throws INVALID_STATE when count is not DRAFT', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 1, status: 'APPROVED', lines: [],
    } as any);

    await expect(inventoryService.finalizeStockCount(1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('auto-approves via transaction when all lines have zero variance', async () => {
    vi.mocked(prisma.stockCount.findUnique)
      .mockResolvedValueOnce({
        id: 1, status: 'DRAFT', locationId: 3, initiatedBy: 1,
        lines: [{ id: 1, itemId: 10, lotId: null, varianceQty: 0, varianceUsd: 0 }],
      } as any)
      .mockResolvedValueOnce({ id: 1, status: 'APPROVED', lines: [], location: {} } as any);

    await inventoryService.finalizeStockCount(1);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('sets PENDING_APPROVAL directly (no transaction) when variance exceeds threshold', async () => {
    // 12/100 = 12% variance > 5% threshold → needsApproval = true → direct prisma.update
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValueOnce({
      id: 2, status: 'DRAFT', locationId: 3, initiatedBy: 1,
      lines: [{ id: 1, itemId: 10, lotId: null, systemQty: 100, varianceQty: -12, varianceUsd: 120 }],
    } as any);
    vi.mocked(prisma.stockCount.update).mockResolvedValue({
      id: 2, status: 'PENDING_APPROVAL', lines: [], location: {},
    } as any);

    await inventoryService.finalizeStockCount(2);

    // Uses direct prisma.stockCount.update, NOT the transaction mock
    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_APPROVAL' }),
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── approveStockCount ────────────────────────────────────────────────────────

describe('InventoryService - approveStockCount', () => {
  it('throws NOT_FOUND when stock count does not exist', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue(null);

    await expect(inventoryService.approveStockCount(999, 1)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('throws INVALID_STATE when count is not PENDING_APPROVAL', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 1, status: 'DRAFT', lines: [], locationId: 1, initiatedBy: 2,
    } as any);

    await expect(inventoryService.approveStockCount(1, 1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('approves count and applies adjustments in a transaction', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 3, status: 'PENDING_APPROVAL', locationId: 2, initiatedBy: 1,
      lines: [
        { id: 1, itemId: 10, lotId: null, varianceQty: 5 },
      ],
    } as any);
    txMock.stockCount.update.mockResolvedValue({ id: 3, status: 'APPROVED' });

    const result = await inventoryService.approveStockCount(3, 5);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(txMock.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', approvedBy: 5 }),
      })
    );
  });
});

// ─── rejectStockCount ─────────────────────────────────────────────────────────

describe('InventoryService - rejectStockCount', () => {
  it('throws NOT_FOUND when stock count does not exist', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue(null);

    await expect(inventoryService.rejectStockCount(999)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('throws INVALID_STATE when count is not PENDING_APPROVAL', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 1, status: 'APPROVED',
    } as any);

    await expect(inventoryService.rejectStockCount(1)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('rejects and returns updated stock count', async () => {
    vi.mocked(prisma.stockCount.findUnique).mockResolvedValue({
      id: 4, status: 'PENDING_APPROVAL',
    } as any);
    vi.mocked(prisma.stockCount.update).mockResolvedValue({ id: 4, status: 'REJECTED' } as any);

    const result = await inventoryService.rejectStockCount(4);
    expect(prisma.stockCount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      })
    );
  });
});
