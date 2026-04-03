import apiClient from './client';
import type {
  InventoryItem,
  Vendor,
  Lot,
  StockLevel,
  LedgerEntry,
  StockCount,
  PaginatedResponse,
} from '../types';

export const inventoryApi = {
  // ─── Items ───────────────────────────────────────────────────────────────
  async listItems(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    isActive?: string;
  }): Promise<PaginatedResponse<InventoryItem>> {
    const res = await apiClient.get('/inventory/items', { params });
    return res.data.data;
  },

  async createItem(data: Partial<InventoryItem>): Promise<InventoryItem> {
    const res = await apiClient.post('/inventory/items', data);
    return res.data.data;
  },

  async updateItem(id: number, data: Partial<InventoryItem>): Promise<InventoryItem> {
    const res = await apiClient.patch(`/inventory/items/${id}`, data);
    return res.data.data;
  },

  async getItem(id: number): Promise<InventoryItem> {
    const res = await apiClient.get(`/inventory/items/${id}`);
    return res.data.data;
  },

  async listCategories(): Promise<string[]> {
    const res = await apiClient.get('/inventory/items/categories');
    return res.data.data;
  },

  // ─── Vendors ─────────────────────────────────────────────────────────────
  async listVendors(): Promise<Vendor[]> {
    const res = await apiClient.get('/inventory/vendors');
    return res.data.data;
  },

  async createVendor(data: { name: string; contact?: string }): Promise<Vendor> {
    const res = await apiClient.post('/inventory/vendors', data);
    return res.data.data;
  },

  async updateVendor(id: number, data: { name?: string; contact?: string }): Promise<Vendor> {
    const res = await apiClient.patch(`/inventory/vendors/${id}`, data);
    return res.data.data;
  },

  // ─── Lots ─────────────────────────────────────────────────────────────────
  async listLots(params?: { itemId?: number }): Promise<Lot[]> {
    const res = await apiClient.get('/inventory/lots', { params });
    return res.data.data;
  },

  // ─── Stock Levels ─────────────────────────────────────────────────────────
  async listStockLevels(params?: {
    itemId?: number;
    locationId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<StockLevel>> {
    const res = await apiClient.get('/inventory/stock-levels', { params });
    // Backend returns array, wrap if needed
    const d = res.data.data;
    if (Array.isArray(d)) {
      return { items: d, total: d.length, page: 1, pageSize: d.length, totalPages: 1 };
    }
    return d;
  },

  async updateThreshold(id: number, data: { safetyThreshold: number }): Promise<StockLevel> {
    const res = await apiClient.patch(`/inventory/stock-levels/${id}/threshold`, data);
    return res.data.data;
  },

  // ─── Movements ────────────────────────────────────────────────────────────
  async receive(data: {
    vendorId: number;
    itemId: number;
    locationId: number;
    quantity: number;
    unitCostUsd?: number;
    packSize?: number;
    deliveryDatetime?: string;
    lotNumber?: string;
    expirationDate?: string;
    notes?: string;
  }): Promise<LedgerEntry> {
    const res = await apiClient.post('/inventory/receive', data);
    return res.data.data;
  },

  async issue(data: {
    itemId: number;
    locationId: number;
    quantity: number;
    lotId?: number;
    notes?: string;
  }): Promise<LedgerEntry> {
    const res = await apiClient.post('/inventory/issue', data);
    return res.data.data;
  },

  async transfer(data: {
    itemId: number;
    fromLocationId: number;
    toLocationId: number;
    quantity: number;
    lotId?: number;
    notes?: string;
  }): Promise<LedgerEntry> {
    const res = await apiClient.post('/inventory/transfer', data);
    return res.data.data;
  },

  // ─── Stock Counts ─────────────────────────────────────────────────────────
  async listStockCounts(params?: {
    locationId?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<StockCount>> {
    const res = await apiClient.get('/inventory/stock-counts', { params });
    return res.data.data;
  },

  async createStockCount(data: { locationId: number }): Promise<StockCount> {
    const res = await apiClient.post('/inventory/stock-counts', data);
    return res.data.data;
  },

  async updateStockCountLines(
    id: number,
    data: { lines: { lineId: number; countedQty: number }[] }
  ): Promise<StockCount> {
    const res = await apiClient.put(`/inventory/stock-counts/${id}/lines`, data);
    return res.data.data;
  },

  async finalizeStockCount(id: number): Promise<StockCount> {
    const res = await apiClient.post(`/inventory/stock-counts/${id}/finalize`);
    return res.data.data;
  },

  async approveStockCount(id: number): Promise<StockCount> {
    const res = await apiClient.post(`/inventory/stock-counts/${id}/approve`);
    return res.data.data;
  },

  async rejectStockCount(id: number): Promise<StockCount> {
    const res = await apiClient.post(`/inventory/stock-counts/${id}/reject`);
    return res.data.data;
  },

  // ─── Alerts & Ledger ──────────────────────────────────────────────────────
  async getLowStock(params?: { locationId?: number }): Promise<StockLevel[]> {
    const res = await apiClient.get('/inventory/low-stock', { params });
    return res.data.data;
  },

  async getLedger(params?: {
    itemId?: number;
    locationId?: number;
    vendorId?: number;
    lotId?: number;
    movementType?: string;
    startDate?: string;
    endDate?: string;
    sortField?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<LedgerEntry>> {
    const res = await apiClient.get('/inventory/ledger', { params });
    return res.data.data;
  },

  async exportLedger(params?: {
    format?: 'csv' | 'excel';
    itemId?: number;
    locationId?: number;
    movementType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ data: Blob; format: string }> {
    const res = await apiClient.get('/inventory/ledger/export', {
      params,
      responseType: 'blob',
    });
    const format = params?.format ?? 'csv';
    return { data: res.data, format };
  },
};
