import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { encrypt } from '../../lib/encryption';
import { exportToCsv, exportToExcel } from '../../lib/exporter';
import { paginate } from '../../types';
import { config } from '../../config';
import {
  CreateItemInput,
  UpdateItemInput,
  CreateVendorInput,
  UpdateVendorInput,
  UpdateThresholdInput,
  ReceiveInput,
  IssueInput,
  TransferInput,
  CreateStockCountInput,
  UpdateLinesInput,
  ItemsQuery,
  StockCountQuery,
  LedgerQuery,
} from './inventory.schema';

function businessError(code: string, message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

const LEDGER_INCLUDE = {
  item: { select: { name: true, sku: true } },
  lot: { select: { lotNumber: true } },
  fromLocation: { select: { name: true } },
  toLocation: { select: { name: true } },
  vendor: { select: { name: true } },
  performer: { select: { displayName: true } },
} as const;

class InventoryService {
  // ─── Private helpers ─────────────────────────────────────────

  private generateRefNum(type: 'RCV' | 'ISS' | 'TRF' | 'STC' | 'ADJ'): string {
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${type}-${yyyymmdd}-${rand}`;
  }

  private buildLedgerWhere(query: LedgerQuery) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (query.itemId) where.itemId = parseInt(query.itemId, 10);
    if (query.vendorId) where.vendorId = parseInt(query.vendorId, 10);
    if (query.lotId) where.lotId = parseInt(query.lotId, 10);
    if (query.movementType) where.movementType = query.movementType;

    if (query.locationId) {
      const locId = parseInt(query.locationId, 10);
      where.OR = [{ fromLocationId: locId }, { toLocationId: locId }];
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) dateFilter.gte = new Date(query.startDate);
      if (query.endDate) dateFilter.lte = new Date(query.endDate);
      where.createdAt = dateFilter;
    }

    return where;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async applyStockCountAdjustments(
    tx: any,
    stockCountId: number,
    locationId: number,
    initiatedBy: number,
    lines: Array<{ id: number; itemId: number; lotId: number | null; varianceQty: number }>,
    approvedBy: number | null
  ): Promise<void> {
    for (const line of lines) {
      if (line.varianceQty === 0) continue;

      // Find the stock level by matching itemId + locationId + lotId
      const stockLevel = await tx.stockLevel.findFirst({
        where: { itemId: line.itemId, locationId, lotId: line.lotId },
      });

      if (stockLevel) {
        await tx.stockLevel.update({
          where: { id: stockLevel.id },
          data: { onHand: { increment: line.varianceQty } },
        });
      }

      await tx.inventoryLedger.create({
        data: {
          itemId: line.itemId,
          lotId: line.lotId,
          toLocationId: locationId,
          movementType: 'STOCK_COUNT',
          quantity: line.varianceQty,
          referenceNumber: this.generateRefNum('STC'),
          performedBy: initiatedBy,
          approvedBy,
          notes: `Stock count adjustment (count id: ${stockCountId})`,
        },
      });
    }
  }

  // ─── Master data ─────────────────────────────────────────────

  async listItems(query: ItemsQuery) {
    const { page, pageSize, skip, take } = paginate(query.page, query.pageSize);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true';
    } else {
      where.isActive = true;
    }

    if (query.category) where.category = query.category;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { sku: { contains: query.search } },
        { description: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.item.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.item.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createItem(input: CreateItemInput) {
    return prisma.item.create({ data: input });
  }

  async getItem(id: number) {
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        stockLevels: { include: { location: true, lot: true } },
        lots: true,
      },
    });
    if (!item) businessError('NOT_FOUND', 'Item not found', 404);
    return item;
  }

  async updateItem(id: number, input: UpdateItemInput) {
    return prisma.item.update({ where: { id }, data: input });
  }

  async listCategories(): Promise<string[]> {
    const result = await prisma.item.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return result.map((r) => r.category);
  }

  async listVendors(isAdmin: boolean) {
    return prisma.vendor.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        ...(isAdmin ? { contactEncrypted: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createVendor(input: CreateVendorInput) {
    const contactEncrypted = input.contact ? encrypt(input.contact) : undefined;
    return prisma.vendor.create({
      data: { name: input.name, contactEncrypted },
    });
  }

  async updateVendor(id: number, input: UpdateVendorInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.contact !== undefined) data.contactEncrypted = encrypt(input.contact as string);
    return prisma.vendor.update({ where: { id }, data });
  }

  async listLots(itemId?: number) {
    return prisma.lot.findMany({
      where: itemId ? { itemId } : undefined,
      include: { item: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listStockLevels(itemId?: number, locationId?: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (locationId) where.locationId = locationId;
    return prisma.stockLevel.findMany({
      where,
      include: { item: true, location: true, lot: true },
    });
  }

  async updateThreshold(id: number, input: UpdateThresholdInput) {
    return prisma.stockLevel.update({
      where: { id },
      data: { safetyThreshold: input.safetyThreshold },
    });
  }

  // ─── Movements ───────────────────────────────────────────────

  async receive(input: ReceiveInput, performedBy: number) {
    const item = await prisma.item.findUnique({ where: { id: input.itemId } });
    if (!item) businessError('NOT_FOUND', 'Item not found', 404);
    if (item!.isLotControlled && !input.lotNumber) {
      businessError('LOT_REQUIRED', 'Lot number required for lot-controlled item', 422);
    }

    let lotId: number | null = null;
    if (input.lotNumber) {
      const lot = await prisma.lot.upsert({
        where: { itemId_lotNumber: { itemId: input.itemId, lotNumber: input.lotNumber } },
        create: {
          itemId: input.itemId,
          lotNumber: input.lotNumber,
          expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
        },
        update: {},
      });
      lotId = lot.id;
    }

    // Upsert stock level using findFirst + create/update for reliable null lotId handling
    const existingLevel = await prisma.stockLevel.findFirst({
      where: { itemId: input.itemId, locationId: input.locationId, lotId },
    });

    if (existingLevel) {
      await prisma.stockLevel.update({
        where: { id: existingLevel.id },
        data: { onHand: { increment: input.quantity } },
      });
    } else {
      await prisma.stockLevel.create({
        data: {
          itemId: input.itemId,
          locationId: input.locationId,
          lotId,
          onHand: input.quantity,
          safetyThreshold: config.inventory.defaultSafetyThreshold,
          avgDailyUsage: 0,
        },
      });
    }

    const ledgerEntry = await prisma.inventoryLedger.create({
      data: {
        itemId: input.itemId,
        lotId,
        toLocationId: input.locationId,
        movementType: 'RECEIVING',
        quantity: input.quantity,
        unitCostUsd: input.unitCostUsd ?? null,
        vendorId: input.vendorId,
        packSize: input.packSize ?? null,
        deliveryDatetime: input.deliveryDatetime ? new Date(input.deliveryDatetime) : null,
        referenceNumber: this.generateRefNum('RCV'),
        performedBy,
        notes: input.notes ?? null,
      },
      include: LEDGER_INCLUDE,
    });

    logger.info({ ledgerId: ledgerEntry.id, itemId: input.itemId, qty: input.quantity }, 'Stock received');
    return ledgerEntry;
  }

  async issue(input: IssueInput, performedBy: number) {
    const item = await prisma.item.findUnique({ where: { id: input.itemId } });
    if (!item) businessError('NOT_FOUND', 'Item not found', 404);
    if (item!.isLotControlled && !input.lotId) {
      businessError('LOT_REQUIRED', 'Lot ID required for lot-controlled item', 422);
    }

    const stockLevel = await prisma.stockLevel.findFirst({
      where: { itemId: input.itemId, locationId: input.locationId, lotId: input.lotId ?? null },
    });
    if (!stockLevel) businessError('NOT_FOUND', 'Stock level not found for this item/location', 404);
    if (stockLevel!.onHand < input.quantity) {
      businessError('INSUFFICIENT_STOCK', `Insufficient stock: ${stockLevel!.onHand} available, ${input.quantity} requested`, 422);
    }

    await prisma.stockLevel.update({
      where: { id: stockLevel!.id },
      data: { onHand: { decrement: input.quantity } },
    });

    const ledgerEntry = await prisma.inventoryLedger.create({
      data: {
        itemId: input.itemId,
        lotId: input.lotId ?? null,
        fromLocationId: input.locationId,
        movementType: 'ISSUE',
        quantity: input.quantity,
        referenceNumber: this.generateRefNum('ISS'),
        performedBy,
        notes: input.notes ?? null,
      },
      include: LEDGER_INCLUDE,
    });

    logger.info({ ledgerId: ledgerEntry.id, itemId: input.itemId, qty: input.quantity }, 'Stock issued');
    return ledgerEntry;
  }

  async transfer(input: TransferInput, performedBy: number) {
    if (input.fromLocationId === input.toLocationId) {
      businessError('INVALID_TRANSFER', 'Source and destination locations must be different', 422);
    }

    const item = await prisma.item.findUnique({ where: { id: input.itemId } });
    if (!item) businessError('NOT_FOUND', 'Item not found', 404);
    if (item!.isLotControlled && !input.lotId) {
      businessError('LOT_REQUIRED', 'Lot ID required for lot-controlled item', 422);
    }

    const ledgerEntry = await prisma.$transaction(async (tx) => {
      const source = await tx.stockLevel.findFirst({
        where: { itemId: input.itemId, locationId: input.fromLocationId, lotId: input.lotId ?? null },
      });
      if (!source) {
        businessError('NOT_FOUND', 'Source stock level not found', 404);
      }
      if (source!.onHand < input.quantity) {
        businessError('INSUFFICIENT_STOCK', `Insufficient stock: ${source!.onHand} available, ${input.quantity} requested`, 422);
      }

      await tx.stockLevel.update({
        where: { id: source!.id },
        data: { onHand: { decrement: input.quantity } },
      });

      const destExisting = await tx.stockLevel.findFirst({
        where: { itemId: input.itemId, locationId: input.toLocationId, lotId: input.lotId ?? null },
      });

      if (destExisting) {
        await tx.stockLevel.update({
          where: { id: destExisting.id },
          data: { onHand: { increment: input.quantity } },
        });
      } else {
        await tx.stockLevel.create({
          data: {
            itemId: input.itemId,
            locationId: input.toLocationId,
            lotId: input.lotId ?? null,
            onHand: input.quantity,
            safetyThreshold: config.inventory.defaultSafetyThreshold,
            avgDailyUsage: 0,
          },
        });
      }

      return tx.inventoryLedger.create({
        data: {
          itemId: input.itemId,
          lotId: input.lotId ?? null,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          movementType: 'TRANSFER',
          quantity: input.quantity,
          referenceNumber: this.generateRefNum('TRF'),
          performedBy,
          notes: input.notes ?? null,
        },
        include: LEDGER_INCLUDE,
      });
    });

    logger.info({ ledgerId: ledgerEntry.id, itemId: input.itemId, qty: input.quantity }, 'Stock transferred');
    return ledgerEntry;
  }

  // ─── Stock counts ─────────────────────────────────────────────

  async listStockCounts(query: StockCountQuery) {
    const { page, pageSize, skip, take } = paginate(query.page, query.pageSize);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (query.locationId) where.locationId = parseInt(query.locationId, 10);
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      prisma.stockCount.findMany({
        where,
        skip,
        take,
        include: {
          location: true,
          initiator: { select: { displayName: true } },
          approver: { select: { displayName: true } },
          lines: {
            include: {
              item: { select: { name: true, sku: true } },
              lot: { select: { lotNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockCount.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async createStockCount(input: CreateStockCountInput, initiatedBy: number) {
    const stockLevels = await prisma.stockLevel.findMany({
      where: { locationId: input.locationId },
      include: { item: true },
    });

    const stockCount = await prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: { locationId: input.locationId, initiatedBy },
      });

      if (stockLevels.length > 0) {
        await tx.stockCountLine.createMany({
          data: stockLevels.map((sl) => ({
            stockCountId: count.id,
            itemId: sl.itemId,
            lotId: sl.lotId,
            systemQty: sl.onHand,
            countedQty: sl.onHand,
            varianceQty: 0,
            variancePct: 0,
            varianceUsd: sl.item.unitPrice ? 0 : null,
          })),
        });
      }

      return tx.stockCount.findUnique({
        where: { id: count.id },
        include: {
          location: true,
          initiator: { select: { displayName: true } },
          lines: {
            include: {
              item: { select: { name: true, sku: true } },
              lot: { select: { lotNumber: true } },
            },
          },
        },
      });
    });

    return stockCount;
  }

  async updateLines(stockCountId: number, input: UpdateLinesInput) {
    const stockCount = await prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: {
        lines: {
          include: { item: { select: { unitPrice: true } } },
        },
      },
    });
    if (!stockCount) businessError('NOT_FOUND', 'Stock count not found', 404);
    if (stockCount!.status !== 'DRAFT') {
      businessError('INVALID_STATE', 'Stock count lines can only be updated in DRAFT status', 422);
    }

    for (const { lineId, countedQty } of input.lines) {
      const existing = stockCount!.lines.find((l) => l.id === lineId);
      if (!existing) businessError('NOT_FOUND', `Stock count line ${lineId} not found`, 404);

      const varianceQty = countedQty - existing!.systemQty;
      const variancePct =
        existing!.systemQty === 0
          ? null
          : (Math.abs(varianceQty) / existing!.systemQty) * 100;
      const varianceUsd =
        existing!.item.unitPrice !== null
          ? Math.abs(varianceQty) * Number(existing!.item.unitPrice)
          : null;

      await prisma.stockCountLine.update({
        where: { id: lineId },
        data: { countedQty, varianceQty, variancePct, varianceUsd },
      });
    }

    return prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: {
        lines: {
          include: {
            item: { select: { name: true, sku: true } },
            lot: { select: { lotNumber: true } },
          },
        },
      },
    });
  }

  async finalizeStockCount(stockCountId: number) {
    const stockCount = await prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: { lines: true },
    });
    if (!stockCount) businessError('NOT_FOUND', 'Stock count not found', 404);
    if (stockCount!.status !== 'DRAFT') {
      businessError('INVALID_STATE', 'Only DRAFT stock counts can be finalized', 422);
    }

    const lines = stockCount!.lines;
    const totalSystemQty = lines.reduce((s, l) => s + l.systemQty, 0);
    const totalAbsVarianceQty = lines.reduce((s, l) => s + Math.abs(l.varianceQty), 0);
    const totalVarianceUsd = lines.reduce((s, l) => s + (l.varianceUsd ? Number(l.varianceUsd) : 0), 0);
    const overallVariancePct =
      totalSystemQty === 0 ? 0 : (totalAbsVarianceQty / totalSystemQty) * 100;

    const needsApproval =
      overallVariancePct > config.inventory.varianceApprovalPct ||
      totalVarianceUsd > config.inventory.varianceApprovalUsd;

    if (needsApproval) {
      return prisma.stockCount.update({
        where: { id: stockCountId },
        data: {
          status: 'PENDING_APPROVAL',
          variancePct: overallVariancePct,
          varianceUsd: totalVarianceUsd,
        },
        include: { lines: true, location: true },
      });
    }

    // Auto-approve
    await prisma.$transaction(async (tx) => {
      await this.applyStockCountAdjustments(
        tx,
        stockCountId,
        stockCount!.locationId,
        stockCount!.initiatedBy,
        lines,
        null
      );
      await tx.stockCount.update({
        where: { id: stockCountId },
        data: {
          status: 'APPROVED',
          variancePct: overallVariancePct,
          varianceUsd: totalVarianceUsd,
          completedAt: new Date(),
        },
      });
    });

    return prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: { lines: true, location: true },
    });
  }

  async approveStockCount(stockCountId: number, approvedBy: number) {
    const stockCount = await prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: { lines: true },
    });
    if (!stockCount) businessError('NOT_FOUND', 'Stock count not found', 404);
    if (stockCount!.status !== 'PENDING_APPROVAL') {
      businessError('INVALID_STATE', 'Only PENDING_APPROVAL stock counts can be approved', 422);
    }

    await prisma.$transaction(async (tx) => {
      await this.applyStockCountAdjustments(
        tx,
        stockCountId,
        stockCount!.locationId,
        stockCount!.initiatedBy,
        stockCount!.lines,
        approvedBy
      );
      await tx.stockCount.update({
        where: { id: stockCountId },
        data: { status: 'APPROVED', approvedBy, completedAt: new Date() },
      });
    });

    logger.info({ stockCountId, approvedBy }, 'Stock count approved');
    return prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: { lines: true, location: true },
    });
  }

  async rejectStockCount(stockCountId: number) {
    const stockCount = await prisma.stockCount.findUnique({ where: { id: stockCountId } });
    if (!stockCount) businessError('NOT_FOUND', 'Stock count not found', 404);
    if (stockCount!.status !== 'PENDING_APPROVAL') {
      businessError('INVALID_STATE', 'Only PENDING_APPROVAL stock counts can be rejected', 422);
    }

    return prisma.stockCount.update({
      where: { id: stockCountId },
      data: { status: 'REJECTED' },
      include: { lines: true, location: true },
    });
  }

  // ─── Low-stock & ledger ───────────────────────────────────────

  async getLowStock(locationId?: number) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (locationId) where.locationId = locationId;

    const stockLevels = await prisma.stockLevel.findMany({
      where,
      include: { item: true, location: true, lot: true },
    });

    return stockLevels
      .map((sl) => {
        const threshold = Math.max(sl.safetyThreshold, Number(sl.avgDailyUsage) * 7);
        return { ...sl, threshold, isLowStock: sl.onHand < threshold };
      })
      .filter((sl) => sl.isLowStock);
  }

  async getLedger(query: LedgerQuery, isAdmin: boolean) {
    const { page, pageSize, skip, take } = paginate(query.page, query.pageSize);
    const where = this.buildLedgerWhere(query);

    const [rawItems, total] = await Promise.all([
      prisma.inventoryLedger.findMany({
        where,
        skip,
        take,
        include: LEDGER_INCLUDE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderBy: { [query.sortField]: query.sortDir } as any,
      }),
      prisma.inventoryLedger.count({ where }),
    ]);

    const items = rawItems.map((e) => ({
      ...e,
      unitCostUsd: isAdmin ? e.unitCostUsd : null,
    }));

    const baseColumns = [
      'id',
      'referenceNumber',
      'movementType',
      'quantity',
      'createdAt',
      'notes',
    ];
    const columns = isAdmin ? ['unitCostUsd', ...baseColumns] : baseColumns;

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize), columns };
  }

  async exportLedger(query: LedgerQuery, isAdmin: boolean, username: string) {
    const where = this.buildLedgerWhere(query);
    const format = query.format ?? 'csv';

    const entries = await prisma.inventoryLedger.findMany({
      where,
      include: LEDGER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const flatData = entries.map((e) => ({
      id: e.id,
      referenceNumber: e.referenceNumber,
      movementType: e.movementType,
      itemName: e.item?.name ?? '',
      itemSku: e.item?.sku ?? '',
      quantity: e.quantity,
      ...(isAdmin ? { unitCostUsd: e.unitCostUsd ? Number(e.unitCostUsd) : null } : {}),
      fromLocation: e.fromLocation?.name ?? '',
      toLocation: e.toLocation?.name ?? '',
      vendor: e.vendor?.name ?? '',
      lot: e.lot?.lotNumber ?? '',
      performer: e.performer?.displayName ?? '',
      createdAt: e.createdAt.toISOString(),
    }));

    const cols = isAdmin
      ? ['id', 'referenceNumber', 'movementType', 'itemName', 'itemSku', 'quantity', 'unitCostUsd', 'fromLocation', 'toLocation', 'vendor', 'lot', 'performer', 'createdAt']
      : ['id', 'referenceNumber', 'movementType', 'itemName', 'itemSku', 'quantity', 'fromLocation', 'toLocation', 'vendor', 'lot', 'performer', 'createdAt'];

    const timestamp = new Date().toISOString();
    const options = { username, timestamp };

    if (format === 'excel') {
      const buffer = await exportToExcel(flatData, cols, 'Inventory Ledger', options);
      return { data: buffer, format: 'excel' as const, filename: 'ledger.xlsx' };
    }

    const csv = exportToCsv(flatData, cols, options);
    return { data: csv, format: 'csv' as const, filename: 'ledger.csv' };
  }
}

export const inventoryService = new InventoryService();
