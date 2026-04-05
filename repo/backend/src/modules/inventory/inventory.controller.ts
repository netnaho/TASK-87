import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, successResponse, errorResponse } from '../../types';
import { inventoryService } from './inventory.service';
import {
  itemsQuerySchema,
  createItemSchema,
  updateItemSchema,
  createVendorSchema,
  updateVendorSchema,
  updateThresholdSchema,
  receiveSchema,
  issueSchema,
  transferSchema,
  createStockCountSchema,
  updateLinesSchema,
  stockCountQuerySchema,
  ledgerQuerySchema,
} from './inventory.schema';

class InventoryController {
  // ─── Items ───────────────────────────────────────────────────

  listItems = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = itemsQuerySchema.parse(req.query);
      const result = await inventoryService.listItems(query);
      res.json(successResponse(result));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  createItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createItemSchema.parse(req.body);
      const item = await inventoryService.createItem(input);
      res.status(201).json(successResponse(item));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const item = await inventoryService.getItem(id);
      res.json(successResponse(item));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  getItemByBarcode = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const barcode = req.params.barcode as string;
      const item = await inventoryService.getItemByBarcode(barcode);
      res.json(successResponse(item));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  updateItem = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = updateItemSchema.parse(req.body);
      const item = await inventoryService.updateItem(id, input);
      res.json(successResponse(item));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  listCategories = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await inventoryService.listCategories();
      res.json(successResponse(categories));
    } catch (err: any) {
      next(err);
    }
  };

  // ─── Vendors ─────────────────────────────────────────────────

  listVendors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isAdmin = req.user!.role === 'ADMIN';
      const vendors = await inventoryService.listVendors(isAdmin);
      res.json(successResponse(vendors));
    } catch (err: any) {
      next(err);
    }
  };

  createVendor = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createVendorSchema.parse(req.body);
      const vendor = await inventoryService.createVendor(input);
      res.status(201).json(successResponse(vendor));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  updateVendor = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = updateVendorSchema.parse(req.body);
      const vendor = await inventoryService.updateVendor(id, input);
      res.json(successResponse(vendor));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  // ─── Lots & stock levels ─────────────────────────────────────

  listLots = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const itemId = req.query.itemId ? parseInt(req.query.itemId as string, 10) : undefined;
      const lots = await inventoryService.listLots(itemId);
      res.json(successResponse(lots));
    } catch (err: any) {
      next(err);
    }
  };

  listStockLevels = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const itemId = req.query.itemId ? parseInt(req.query.itemId as string, 10) : undefined;
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const levels = await inventoryService.listStockLevels(itemId, locationId);
      res.json(successResponse(levels));
    } catch (err: any) {
      next(err);
    }
  };

  updateThreshold = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = updateThresholdSchema.parse(req.body);
      const level = await inventoryService.updateThreshold(id, input);
      res.json(successResponse(level));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  // ─── Movements ───────────────────────────────────────────────

  receive = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = receiveSchema.parse(req.body);
      const ledgerEntry = await inventoryService.receive(input, req.user!.userId);
      const isAdmin = req.user!.role === 'ADMIN';
      res.status(201).json(successResponse({ ...ledgerEntry, unitCostUsd: isAdmin ? ledgerEntry.unitCostUsd : null }));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  issue = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = issueSchema.parse(req.body);
      const ledgerEntry = await inventoryService.issue(input, req.user!.userId);
      const isAdmin = req.user!.role === 'ADMIN';
      res.status(201).json(successResponse({ ...ledgerEntry, unitCostUsd: isAdmin ? ledgerEntry.unitCostUsd : null }));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  transfer = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = transferSchema.parse(req.body);
      const ledgerEntry = await inventoryService.transfer(input, req.user!.userId);
      const isAdmin = req.user!.role === 'ADMIN';
      res.status(201).json(successResponse({ ...ledgerEntry, unitCostUsd: isAdmin ? ledgerEntry.unitCostUsd : null }));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  // ─── Stock counts ─────────────────────────────────────────────

  listStockCounts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = stockCountQuerySchema.parse(req.query);
      const result = await inventoryService.listStockCounts(query);
      res.json(successResponse(result));
    } catch (err: any) {
      next(err);
    }
  };

  createStockCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createStockCountSchema.parse(req.body);
      const stockCount = await inventoryService.createStockCount(input, req.user!.userId);
      res.status(201).json(successResponse(stockCount));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  updateLines = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const input = updateLinesSchema.parse(req.body);
      const stockCount = await inventoryService.updateLines(id, input);
      res.json(successResponse(stockCount));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  finalizeStockCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const stockCount = await inventoryService.finalizeStockCount(id);
      res.json(successResponse(stockCount));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  approveStockCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const stockCount = await inventoryService.approveStockCount(id, req.user!.userId);
      res.json(successResponse(stockCount));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  rejectStockCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const stockCount = await inventoryService.rejectStockCount(id);
      res.json(successResponse(stockCount));
    } catch (err: any) {
      if (err.statusCode) { res.status(err.statusCode).json(errorResponse(err.code, err.message)); return; }
      next(err);
    }
  };

  // ─── Low-stock & ledger ───────────────────────────────────────

  getLowStock = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string, 10) : undefined;
      const alerts = await inventoryService.getLowStock(locationId);
      res.json(successResponse(alerts));
    } catch (err: any) {
      next(err);
    }
  };

  getLedger = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ledgerQuerySchema.parse(req.query);
      const isAdmin = req.user!.role === 'ADMIN';
      const result = await inventoryService.getLedger(query, isAdmin);
      res.json(successResponse(result));
    } catch (err: any) {
      next(err);
    }
  };

  exportLedger = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ledgerQuerySchema.parse(req.query);
      const isAdmin = req.user!.role === 'ADMIN';
      const username = req.user!.username;

      const result = await inventoryService.exportLedger(query, isAdmin, username);

      if (result.format === 'excel') {
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
      } else {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(result.data);
      }
    } catch (err: any) {
      next(err);
    }
  };
}

export const inventoryController = new InventoryController();
