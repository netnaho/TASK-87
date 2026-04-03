import apiClient from './client';
import type { Review, ReviewTag, HostReply, PaginatedResponse } from '../types';

export const reviewsApi = {
  async listTags(): Promise<ReviewTag[]> {
    const res = await apiClient.get('/reviews/tags');
    return res.data.data;
  },

  async listReviews(params?: {
    page?: number;
    pageSize?: number;
    targetType?: string;
    status?: string;
    revieweeId?: number;
  }): Promise<PaginatedResponse<Review>> {
    const res = await apiClient.get('/reviews', { params });
    return res.data.data;
  },

  async getReview(id: number): Promise<Review> {
    const res = await apiClient.get(`/reviews/${id}`);
    return res.data.data;
  },

  async createReview(formData: FormData): Promise<Review> {
    const res = await apiClient.post('/reviews', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async createFollowUp(id: number, formData: FormData): Promise<Review> {
    const res = await apiClient.post(`/reviews/${id}/follow-up`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async createHostReply(id: number, data: { text: string }): Promise<HostReply> {
    const res = await apiClient.post(`/reviews/${id}/reply`, data);
    return res.data.data;
  },
};
