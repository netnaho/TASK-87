import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { inventoryController } from './inventory.controller';

const router = Router();

// ─── ITEMS ──────────────────────────────────────────────────────
router.get('/items', authenticate, (req, res, next) =>
  inventoryController.listItems(req as any, res, next)
);
router.post(
  '/items',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.createItem(req as any, res, next)
);
// Static route BEFORE dynamic :id to prevent "categories" matching as param
router.get('/items/categories', authenticate, (req, res, next) =>
  inventoryController.listCategories(req as any, res, next)
);
router.get('/items/by-barcode/:barcode', authenticate, (req, res, next) =>
  inventoryController.getItemByBarcode(req as any, res, next)
);
router.get('/items/:id', authenticate, (req, res, next) =>
  inventoryController.getItem(req as any, res, next)
);
router.patch(
  '/items/:id',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.updateItem(req as any, res, next)
);

// ─── VENDORS ────────────────────────────────────────────────────
router.get('/vendors', authenticate, (req, res, next) =>
  inventoryController.listVendors(req as any, res, next)
);
router.post(
  '/vendors',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  (req, res, next) => inventoryController.createVendor(req as any, res, next)
);
router.patch(
  '/vendors/:id',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  (req, res, next) => inventoryController.updateVendor(req as any, res, next)
);

// ─── LOTS & STOCK LEVELS ─────────────────────────────────────────
router.get('/lots', authenticate, (req, res, next) =>
  inventoryController.listLots(req as any, res, next)
);
router.get('/stock-levels', authenticate, (req, res, next) =>
  inventoryController.listStockLevels(req as any, res, next)
);
router.patch(
  '/stock-levels/:id/threshold',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  (req, res, next) => inventoryController.updateThreshold(req as any, res, next)
);

// ─── MOVEMENTS ──────────────────────────────────────────────────
router.post(
  '/receive',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.receive(req as any, res, next)
);
router.post(
  '/issue',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.issue(req as any, res, next)
);
router.post(
  '/transfer',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.transfer(req as any, res, next)
);

// ─── STOCK COUNTS ───────────────────────────────────────────────
router.get(
  '/stock-counts',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.listStockCounts(req as any, res, next)
);
router.post(
  '/stock-counts',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.createStockCount(req as any, res, next)
);
router.put(
  '/stock-counts/:id/lines',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.updateLines(req as any, res, next)
);
router.post(
  '/stock-counts/:id/finalize',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'INVENTORY_CLERK'),
  (req, res, next) => inventoryController.finalizeStockCount(req as any, res, next)
);
router.post(
  '/stock-counts/:id/approve',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  (req, res, next) => inventoryController.approveStockCount(req as any, res, next)
);
router.post(
  '/stock-counts/:id/reject',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  (req, res, next) => inventoryController.rejectStockCount(req as any, res, next)
);

// ─── LOW-STOCK & LEDGER ──────────────────────────────────────────
router.get('/low-stock', authenticate, (req, res, next) =>
  inventoryController.getLowStock(req as any, res, next)
);
// Static route BEFORE dynamic ledger to prevent "export" matching as param
router.get(
  '/ledger/export',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  (req, res, next) => inventoryController.exportLedger(req as any, res, next)
);
router.get(
  '/ledger',
  authenticate,
  authorize('MANAGER', 'ADMIN'),
  (req, res, next) => inventoryController.getLedger(req as any, res, next)
);

export default router;
