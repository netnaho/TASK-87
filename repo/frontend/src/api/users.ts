import apiClient from './client';
import type { User, PaginatedResponse, Role } from '../types';

export const usersApi = {
  async listUsers(params?: { page?: number; pageSize?: number }): Promise<PaginatedResponse<User>> {
    const res = await apiClient.get('/users', { params });
    return res.data.data;
  },

  async changeRole(id: number, role: Role): Promise<User> {
    const res = await apiClient.patch(`/users/${id}/role`, { role });
    return res.data.data;
  },
};
