import apiClient from './client';
import type { TrustScore, CreditHistory, PaginatedResponse } from '../types';

export const trustApi = {
  async getMyScore(): Promise<TrustScore> {
    const res = await apiClient.get('/trust/score');
    return res.data.data;
  },

  async getMyHistory(params?: { page?: number; pageSize?: number }): Promise<PaginatedResponse<CreditHistory>> {
    const res = await apiClient.get('/trust/history', { params });
    return res.data.data;
  },

  async getUserScore(userId: number): Promise<TrustScore> {
    const res = await apiClient.get(`/trust/users/${userId}/score`);
    return res.data.data;
  },

  async rateTask(data: {
    rateeId: number;
    taskId: number;
    rating: number;
    comment?: string;
  }): Promise<{ message: string; delta: number; explanation: string }> {
    const res = await apiClient.post('/trust/rate-task', data);
    return res.data.data;
  },

  async adminAdjust(data: {
    userId: number;
    changeAmount: number;
    reason: string;
  }): Promise<{ userId: number; previousScore: number; newScore: number }> {
    const res = await apiClient.post('/trust/admin-adjust', data);
    return res.data.data;
  },
};
