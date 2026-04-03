import apiClient from './client';
import type { SearchProduct, SuggestedTerm, PaginatedResponse } from '../types';

export const searchApi = {
  async searchProducts(params?: {
    q?: string;
    category?: string;
    attributeName?: string;
    attributeValue?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<SearchProduct>> {
    const res = await apiClient.get('/search/products', { params });
    return res.data.data;
  },

  async getCategories(): Promise<string[]> {
    const res = await apiClient.get('/search/categories');
    return res.data.data;
  },

  async getSuggestions(): Promise<SuggestedTerm[]> {
    const res = await apiClient.get('/search/suggestions');
    return res.data.data;
  },

  async getTrending(): Promise<SuggestedTerm[]> {
    const res = await apiClient.get('/search/trending');
    return res.data.data;
  },

  async markTrending(term: string, isTrending: boolean): Promise<SuggestedTerm> {
    const res = await apiClient.patch(`/search/trending/${encodeURIComponent(term)}`, { isTrending });
    return res.data.data;
  },
};
