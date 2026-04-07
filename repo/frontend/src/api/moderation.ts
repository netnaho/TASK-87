import apiClient from './client';
import type {
  ModerationReport,
  ModerationAction,
  Appeal,
  SensitiveWord,
  PaginatedResponse,
} from '../types';

export const moderationApi = {
  // ─── Reports ──────────────────────────────────────────────────────────────
  async fileReport(data: {
    contentType: string;
    contentId: number;
    reviewId?: number;
    reason: string;
  }): Promise<ModerationReport> {
    const res = await apiClient.post('/moderation/reports', data);
    return res.data.data;
  },

  async getQueue(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<ModerationReport>> {
    const res = await apiClient.get('/moderation/reports/queue', { params });
    return res.data.data;
  },

  async assignReport(id: number): Promise<ModerationReport> {
    const res = await apiClient.post(`/moderation/reports/${id}/assign`);
    return res.data.data;
  },

  async takeAction(
    id: number,
    data: { action: string; notes?: string }
  ): Promise<ModerationAction> {
    const res = await apiClient.post(`/moderation/reports/${id}/action`, data);
    return res.data.data;
  },

  // ─── Audit ────────────────────────────────────────────────────────────────
  async getAudit(params?: { page?: number; pageSize?: number }): Promise<PaginatedResponse<ModerationAction>> {
    const res = await apiClient.get('/moderation/audit', { params });
    return res.data.data;
  },

  // ─── Appeals ──────────────────────────────────────────────────────────────
  async fileAppeal(data: {
    moderationActionId: number;
    userStatement: string;
  }): Promise<Appeal> {
    const res = await apiClient.post('/moderation/appeals', data);
    return res.data.data;
  },

  async listAppeals(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Appeal>> {
    const res = await apiClient.get('/moderation/appeals', { params });
    return res.data.data;
  },

  async resolveAppeal(
    id: number,
    data: { status: string; arbitrationNotes?: string; outcome?: string }
  ): Promise<Appeal> {
    const res = await apiClient.post(`/moderation/appeals/${id}/resolve`, data);
    return res.data.data;
  },

  /** List the calling user's own appeals (scoped by JWT identity). */
  async listMyAppeals(params?: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<Appeal>> {
    const res = await apiClient.get('/moderation/appeals/my', { params });
    return res.data.data;
  },

  /** List moderation actions that affected the calling user's own content. */
  async listMyModerationActions(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResponse<ModerationAction>> {
    const res = await apiClient.get('/moderation/actions/my', { params });
    return res.data.data;
  },

  // ─── Sensitive Words ──────────────────────────────────────────────────────
  async listSensitiveWords(params?: { page?: number; pageSize?: number }): Promise<PaginatedResponse<SensitiveWord>> {
    const res = await apiClient.get('/moderation/sensitive-words', { params });
    return res.data.data;
  },

  async addSensitiveWord(data: { word: string; category?: string }): Promise<SensitiveWord> {
    const res = await apiClient.post('/moderation/sensitive-words', data);
    return res.data.data;
  },

  async deleteSensitiveWord(id: number): Promise<void> {
    await apiClient.delete(`/moderation/sensitive-words/${id}`);
  },
};
