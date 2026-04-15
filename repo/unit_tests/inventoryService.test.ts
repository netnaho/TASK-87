import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  default: {
    item: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    vendor: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    lot: { findMany: vi.fn(), upsert: vi.fn() },
    stockLevel: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    inventoryLedger: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    stockCount: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    stockCountLine: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((text: string) => `enc:${text}`),
  decrypt: vi.fn((text: string) => text.replace('enc:', '')),
  maskPhone: vi.fn(() => '***-1234'),
}));

vi.mock('@/lib/exporter', () => ({
  exportToCsv: vi.fn().mockResolvedValue(Buffer.from('csv')),
  exportToExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx')),
}));

import prisma from '@/lib/prisma';
import { inventoryService } from '@/modules/inventory/inventory.service';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── listItems ────────────────────────────────────────────────────────────────

describe('InventoryService - listItems', () => {
  it('returns paginated active items by default', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([{ id: 1, name: 'Towel' }] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(1);

    const result = await inventoryService.listItems({});

    expect(prisma.item.findMany).toHaveBeenCalledOnce();
    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.isActive).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('filters by isActive=false when explicitly specified', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await inventoryService.listItems({ isActive: 'false' });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.isActive).toBe(false);
  });

  it('applies text search filter on name, sku, description', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await inventoryService.listItems({ search: 'towel' });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR[0].name.contains).toBe('towel');
  });

  it('applies category filter when provided', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.item.count).mockResolvedValue(0);

    await inventoryService.listItems({ category: 'Linen' });

    const call = vi.mocked(prisma.item.findMany).mock.calls[0][0] as any;
    expect(call.where.category).toBe('Linen');
  });
});

// ─── createItem / getItem / updateItem ───────────────────────────────────────

describe('InventoryService - item CRUD', () => {
  it('createItem passes data directly to prisma', async () => {
    vi.mocked(prisma.item.create).mockResolvedValue({ id: 5, name: 'New Item' } as any);

    const result = await inventoryService.createItem({
      name: 'New Item', sku: 'NI-001', category: 'Supplies',
    });

    expect(prisma.item.create).toHaveBeenCalledOnce();
    expect(result.id).toBe(5);
  });

  it('getItem throws NOT_FOUND when item does not exist', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null);

    await expect(inventoryService.getItem(999)).rejects.toMatchObject({
      code: 'NOT_FOUND', statusCode: 404,
    });
  });

  it('getItem returns item with stock levels and lots', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 3, name: 'Towel', stockLevels: [], lots: [],
    } as any);

    const result = await inventoryService.getItem(3);
    expect(result.id).toBe(3);
  });

  it('getItemByBarcode throws BARCODE_NOT_FOUND for unknown barcode', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null);

    await expect(inventoryService.getItemByBarcode('UNKNOWN')).rejects.toMatchObject({
      code: 'BARCODE_NOT_FOUND', statusCode: 400,
    });
  });

  it('getItemByBarcode returns item for valid barcode', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 7, barcode: 'ABC123', stockLevels: [], lots: [],
    } as any);

    const result = await inventoryService.getItemByBarcode('ABC123');
    expect(result.barcode).toBe('ABC123');
  });

  it('updateItem delegates to prisma.item.update', async () => {
    vi.mocked(prisma.item.update).mockResolvedValue({ id: 1, name: 'Updated' } as any);

    const result = await inventoryService.updateItem(1, { name: 'Updated' });
    expect(prisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { name: 'Updated' } })
    );
    expect(result.name).toBe('Updated');
  });

  it('listCategories returns distinct category strings', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValue([
      { category: 'Linen' }, { category: 'Supplies' },
    ] as any);

    const cats = await inventoryService.listCategories();
    expect(cats).toEqual(['Linen', 'Supplies']);
  });
});

// ─── Vendor CRUD ──────────────────────────────────────────────────────────────

describe('InventoryService - vendor management', () => {
  it('listVendors returns all active vendors without contactEncrypted for non-admin', async () => {
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([
      { id: 1, name: 'Acme', isActive: true },
    ] as any);

    const result = await inventoryService.listVendors(false);
    expect(prisma.vendor.findMany).toHaveBeenCalledOnce();
    const call = vi.mocked(prisma.vendor.findMany).mock.calls[0][0] as any;
    expect(call.select).not.toHaveProperty('contactEncrypted');
    expect(result).toHaveLength(1);
  });

  it('listVendors includes contactEncrypted field for admin', async () => {
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([{ id: 1, name: 'V' }] as any);

    await inventoryService.listVendors(true);
    const call = vi.mocked(prisma.vendor.findMany).mock.calls[0][0] as any;
    expect(call.select).toHaveProperty('contactEncrypted', true);
  });

  it('createVendor encrypts contact when provided', async () => {
    vi.mocked(prisma.vendor.create).mockResolvedValue({ id: 10, name: 'New Vendor' } as any);

    const result = await inventoryService.createVendor({ name: 'New Vendor', contact: '555-1234' });

    const createCall = vi.mocked(prisma.vendor.create).mock.calls[0][0] as any;
    expect(createCall.data.contactEncrypted).toBe('enc:555-1234');
    expect(result.id).toBe(10);
  });

  it('createVendor stores undefined for contactEncrypted when no contact provided', async () => {
    vi.mocked(prisma.vendor.create).mockResolvedValue({ id: 11, name: 'No Contact' } as any);

    await inventoryService.createVendor({ name: 'No Contact' });

    const createCall = vi.mocked(prisma.vendor.create).mock.calls[0][0] as any;
    expect(createCall.data.contactEncrypted).toBeUndefined();
  });

  it('updateVendor updates name when provided', async () => {
    vi.mocked(prisma.vendor.update).mockResolvedValue({ id: 2, name: 'Renamed' } as any);

    await inventoryService.updateVendor(2, { name: 'Renamed' });

    const call = vi.mocked(prisma.vendor.update).mock.calls[0][0] as any;
    expect(call.data.name).toBe('Renamed');
  });

  it('updateVendor encrypts contact when provided', async () => {
    vi.mocked(prisma.vendor.update).mockResolvedValue({ id: 3 } as any);

    await inventoryService.updateVendor(3, { contact: '555-9999' });

    const call = vi.mocked(prisma.vendor.update).mock.calls[0][0] as any;
    expect(call.data.contactEncrypted).toBe('enc:555-9999');
  });
});

// ─── Stock levels / lots / threshold ─────────────────────────────────────────

describe('InventoryService - stock levels and lots', () => {
  it('listLots returns all lots when no itemId provided', async () => {
    vi.mocked(prisma.lot.findMany).mockResolvedValue([{ id: 1 }] as any);

    const result = await inventoryService.listLots();
    const call = vi.mocked(prisma.lot.findMany).mock.calls[0][0] as any;
    expect(call.where).toBeUndefined();
    expect(result).toHaveLength(1);
  });

  it('listLots filters by itemId when provided', async () => {
    vi.mocked(prisma.lot.findMany).mockResolvedValue([] as any);

    await inventoryService.listLots(7);
    const call = vi.mocked(prisma.lot.findMany).mock.calls[0][0] as any;
    expect(call.where).toEqual({ itemId: 7 });
  });

  it('listStockLevels applies itemId and locationId filters', async () => {
    vi.mocked(prisma.stockLevel.findMany).mockResolvedValue([] as any);

    await inventoryService.listStockLevels(3, 5);
    const call = vi.mocked(prisma.stockLevel.findMany).mock.calls[0][0] as any;
    expect(call.where.itemId).toBe(3);
    expect(call.where.locationId).toBe(5);
  });

  it('updateThreshold updates safetyThreshold on stock level', async () => {
    vi.mocked(prisma.stockLevel.update).mockResolvedValue({
      id: 9, safetyThreshold: 25,
    } as any);

    const result = await inventoryService.updateThreshold(9, { safetyThreshold: 25 });
    expect(prisma.stockLevel.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { safetyThreshold: 25 },
    });
    expect(result.safetyThreshold).toBe(25);
  });
});

// ─── receive ─────────────────────────────────────────────────────────────────

describe('InventoryService - receive', () => {
  const baseReceive = {
    vendorId: 1,
    itemId: 10,
    locationId: 2,
    quantity: 50,
  };

  it('throws LOT_REQUIRED for lot-controlled item without lotNumber', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 10, isLotControlled: true, requiresExpiration: false,
    } as any);

    await expect(
      inventoryService.receive(baseReceive, 1)
    ).rejects.toMatchObject({ code: 'LOT_REQUIRED', statusCode: 422 });
  });

  it('throws EXPIRATION_REQUIRED for item requiring expiration without expirationDate', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 10, isLotControlled: false, requiresExpiration: true,
    } as any);

    await expect(
      inventoryService.receive(baseReceive, 1)
    ).rejects.toMatchObject({ code: 'EXPIRATION_REQUIRED', statusCode: 422 });
  });

  it('creates ledger entry and updates existing stock level on successful receive', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 10, isLotControlled: false, requiresExpiration: false,
    } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue({
      id: 5, onHand: 10,
    } as any);
    vi.mocked(prisma.stockLevel.update).mockResolvedValue({ id: 5, onHand: 60 } as any);
    vi.mocked(prisma.inventoryLedger.create).mockResolvedValue({
      id: 1, movementType: 'RECEIVING', quantity: 50,
      item: { name: 'Towel', sku: 'T-001' },
      performer: { displayName: 'Admin' },
      vendor: { name: 'Acme' },
    } as any);

    const result = await inventoryService.receive(baseReceive, 1);

    expect(prisma.stockLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { onHand: { increment: 50 } } })
    );
    expect(prisma.inventoryLedger.create).toHaveBeenCalledOnce();
    expect(result.movementType).toBe('RECEIVING');
  });

  it('creates new stock level when none exists for item/location', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      id: 10, isLotControlled: false, requiresExpiration: false,
    } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.stockLevel.create).mockResolvedValue({ id: 99, onHand: 50 } as any);
    vi.mocked(prisma.inventoryLedger.create).mockResolvedValue({
      id: 2, movementType: 'RECEIVING', quantity: 50,
      item: { name: 'Towel', sku: 'T-001' },
      performer: { displayName: 'Admin' },
      vendor: { name: 'Acme' },
    } as any);

    await inventoryService.receive(baseReceive, 1);

    expect(prisma.stockLevel.create).toHaveBeenCalledOnce();
    const createCall = vi.mocked(prisma.stockLevel.create).mock.calls[0][0] as any;
    expect(createCall.data.onHand).toBe(50);
  });

  it('resolves item by barcode when barcode is provided instead of itemId', async () => {
    vi.mocked(prisma.item.findUnique)
      .mockResolvedValueOnce({ id: 10, barcode: 'BARCODE1' } as any) // barcode lookup
      .mockResolvedValueOnce({ id: 10, isLotControlled: false, requiresExpiration: false } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue({ id: 5, onHand: 0 } as any);
    vi.mocked(prisma.stockLevel.update).mockResolvedValue({} as any);
    vi.mocked(prisma.inventoryLedger.create).mockResolvedValue({
      id: 3, movementType: 'RECEIVING', quantity: 5,
      item: { name: 'B', sku: 'B' },
      performer: { displayName: 'Clerk' },
      vendor: { name: 'V' },
    } as any);

    await inventoryService.receive({ vendorId: 1, barcode: 'BARCODE1', locationId: 2, quantity: 5 }, 1);

    expect(prisma.item.findUnique).toHaveBeenCalledWith({ where: { barcode: 'BARCODE1' } });
  });

  it('throws BARCODE_NOT_FOUND when barcode does not match any item', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue(null);

    await expect(
      inventoryService.receive({ vendorId: 1, barcode: 'NOPE', locationId: 2, quantity: 1 }, 1)
    ).rejects.toMatchObject({ code: 'BARCODE_NOT_FOUND' });
  });
});

// ─── issue ────────────────────────────────────────────────────────────────────

describe('InventoryService - issue', () => {
  it('throws INSUFFICIENT_STOCK when onHand is less than requested', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 5, isLotControlled: false } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue({ id: 1, onHand: 3 } as any);

    await expect(
      inventoryService.issue({ itemId: 5, locationId: 1, quantity: 10 }, 1)
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', statusCode: 422 });
  });

  it('creates ISSUE ledger entry and decrements stock', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 5, isLotControlled: false } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue({ id: 2, onHand: 20 } as any);
    vi.mocked(prisma.stockLevel.update).mockResolvedValue({ id: 2, onHand: 15 } as any);
    vi.mocked(prisma.inventoryLedger.create).mockResolvedValue({
      id: 4, movementType: 'ISSUE', quantity: 5,
      item: { name: 'X', sku: 'X' },
      performer: { displayName: 'Y' },
    } as any);

    const result = await inventoryService.issue({ itemId: 5, locationId: 1, quantity: 5 }, 2);

    expect(prisma.stockLevel.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { onHand: { decrement: 5 } } })
    );
    expect(result.movementType).toBe('ISSUE');
  });

  it('throws NOT_FOUND when no stock level exists for item/location', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 5, isLotControlled: false } as any);
    vi.mocked(prisma.stockLevel.findFirst).mockResolvedValue(null);

    await expect(
      inventoryService.issue({ itemId: 5, locationId: 99, quantity: 1 }, 1)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── transfer ─────────────────────────────────────────────────────────────────

describe('InventoryService - transfer', () => {
  it('throws INVALID_TRANSFER when source and destination are the same location', async () => {
    // INVALID_TRANSFER check happens before item lookup, no prisma needed
    await expect(
      inventoryService.transfer({ itemId: 1, fromLocationId: 5, toLocationId: 5, quantity: 1 }, 1)
    ).rejects.toMatchObject({ code: 'INVALID_TRANSFER', statusCode: 422 });
  });

  it('throws INSUFFICIENT_STOCK when source has less than requested', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValue({ id: 1, isLotControlled: false } as any);
    // Transfer uses $transaction internally; mock it to call the callback with a tx object
    const txMockTransfer = {
      stockLevel: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, onHand: 2 }),
        update: vi.fn(),
        create: vi.fn(),
      },
      inventoryLedger: { create: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(txMockTransfer));

    await expect(
      inventoryService.transfer({ itemId: 1, fromLocationId: 1, toLocationId: 2, quantity: 10 }, 1)
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
});

// ─── getLedger ────────────────────────────────────────────────────────────────

describe('InventoryService - getLedger', () => {
  it('returns paginated ledger entries', async () => {
    vi.mocked(prisma.inventoryLedger.findMany).mockResolvedValue([
      { id: 1, movementType: 'RECEIVING', unitCostUsd: '9.99' },
    ] as any);
    vi.mocked(prisma.inventoryLedger.count).mockResolvedValue(1);

    const result = await inventoryService.getLedger({} as any, false);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('masks unitCostUsd to null for non-admin', async () => {
    vi.mocked(prisma.inventoryLedger.findMany).mockResolvedValue([
      { id: 1, movementType: 'RECEIVING', unitCostUsd: '19.99' },
    ] as any);
    vi.mocked(prisma.inventoryLedger.count).mockResolvedValue(1);

    const result = await inventoryService.getLedger({} as any, false);
    expect(result.items[0].unitCostUsd).toBeNull();
    expect(result.columns).not.toContain('unitCostUsd');
  });

  it('exposes unitCostUsd for admin', async () => {
    vi.mocked(prisma.inventoryLedger.findMany).mockResolvedValue([
      { id: 1, movementType: 'RECEIVING', unitCostUsd: '19.99' },
    ] as any);
    vi.mocked(prisma.inventoryLedger.count).mockResolvedValue(1);

    const result = await inventoryService.getLedger({} as any, true);
    expect(result.items[0].unitCostUsd).toBe('19.99');
    expect(result.columns).toContain('unitCostUsd');
  });
});

// ─── getLowStock ──────────────────────────────────────────────────────────────

describe('InventoryService - getLowStock', () => {
  it('returns only items flagged as low stock', async () => {
    vi.mocked(prisma.stockLevel.findMany).mockResolvedValue([
      { id: 1, onHand: 2, safetyThreshold: 10, avgDailyUsage: 1,
        item: { name: 'Towel', sku: 'T-001' }, location: { name: 'L1' }, lot: null },
      { id: 2, onHand: 100, safetyThreshold: 10, avgDailyUsage: 1,
        item: { name: 'Sheet', sku: 'S-001' }, location: { name: 'L1' }, lot: null },
    ] as any);

    const result = await inventoryService.getLowStock();
    expect(result.every((r: any) => r.isLowStock)).toBe(true);
    // Only 1 of 2 items is low stock
    expect(result).toHaveLength(1);
  });
});
