import apiClient from './client';
import type { KpiDaily, ReviewEfficiencyReport, ScheduledReport } from '../types';

export const reportsApi = {
  async getKpiDashboard(): Promise<KpiDaily[]> {
    const res = await apiClient.get('/reports/kpi/dashboard');
    return res.data.data;
  },

  async getReviewEfficiency(): Promise<ReviewEfficiencyReport[]> {
    const res = await apiClient.get('/reports/review-efficiency');
    return res.data.data;
  },

  async getScheduledReports(): Promise<ScheduledReport[]> {
    const res = await apiClient.get('/reports/scheduled');
    return res.data.data;
  },
};
