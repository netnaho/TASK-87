import apiClient from './client';
import type { Location } from '../types';

export const locationsApi = {
  async listLocations(): Promise<Location[]> {
    const res = await apiClient.get('/locations');
    return res.data.data;
  },

  async createLocation(data: { name: string; address?: string }): Promise<Location> {
    const res = await apiClient.post('/locations', data);
    return res.data.data;
  },

  async updateLocation(id: number, data: { name?: string; address?: string }): Promise<Location> {
    const res = await apiClient.patch(`/locations/${id}`, data);
    return res.data.data;
  },
};
