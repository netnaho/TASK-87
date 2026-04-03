import apiClient from './client';
import type { Promotion, CheckoutResult, PaginatedResponse } from '../types';

export const promotionsApi = {
  async listPromotions(params?: {
    isActive?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Promotion>> {
    const res = await apiClient.get('/promotions', { params });
    return res.data.data;
  },

  async createPromotion(data: {
    name: string;
    description?: string;
    discountType: string;
    discountValue: number;
    effectiveStart: string;
    effectiveEnd: string;
    priority?: number;
    isActive?: boolean;
    conditions?: Record<string, unknown>;
    itemIds?: number[];
    exclusions?: number[];
  }): Promise<Promotion> {
    const res = await apiClient.post('/promotions', data);
    return res.data.data;
  },

  async updatePromotion(
    id: number,
    data: Partial<{
      name: string;
      description: string;
      discountType: string;
      discountValue: number;
      effectiveStart: string;
      effectiveEnd: string;
      priority: number;
      isActive: boolean;
    }>
  ): Promise<Promotion> {
    const res = await apiClient.patch(`/promotions/${id}`, data);
    return res.data.data;
  },

  async checkout(items: { itemId: number; quantity: number }[]): Promise<CheckoutResult> {
    const res = await apiClient.post('/promotions/checkout', { items });
    return res.data.data;
  },
};
