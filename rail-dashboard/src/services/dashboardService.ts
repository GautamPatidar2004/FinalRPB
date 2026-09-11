import apiClient from './apiClient';
import type {
  DashboardSummary,
  DashboardPlanningKpis,
  DashboardCorridor,
  DashboardPlanSummary,
  DashboardActivityItem,
  DashboardAlertItem,
} from '../types';

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  model_loaded: boolean;
}

export const dashboardService = {
  // Real aggregated operational metrics from database layer
  async getSummary(): Promise<DashboardSummary> {
    const res = await apiClient.get<DashboardSummary>('/api/v1/dashboard/summary');
    return res.data;
  },

  // Derived planning KPIs (scheduled vs unscheduled, duration, utilization, scores)
  async getPlanningKpis(): Promise<DashboardPlanningKpis> {
    const res = await apiClient.get<DashboardPlanningKpis>('/api/v1/dashboard/planning-kpis');
    return res.data;
  },

  // Corridor availability, scheduled block load, and timetable train counts
  async getCorridors(): Promise<DashboardCorridor[]> {
    const res = await apiClient.get<DashboardCorridor[]>('/api/v1/dashboard/corridors');
    return res.data;
  },

  // Operational plans filtered by review status
  async getDashboardPlans(status?: string): Promise<DashboardPlanSummary[]> {
    const params = status ? { status } : undefined;
    const res = await apiClient.get<DashboardPlanSummary[]>('/api/v1/dashboard/plans', { params });
    return res.data;
  },

  // Chronological operational activity feed (plan generation, reviews, submissions)
  async getRecentActivity(limit: number = 10): Promise<DashboardActivityItem[]> {
    const res = await apiClient.get<DashboardActivityItem[]>('/api/v1/dashboard/recent-activity', {
      params: { limit },
    });
    return res.data;
  },

  // Actionable operational alerts (hard conflicts & overdue critical requests)
  async getAlerts(): Promise<DashboardAlertItem[]> {
    const res = await apiClient.get<DashboardAlertItem[]>('/api/v1/dashboard/alerts');
    return res.data;
  },

  // System health probe
  async getHealth(): Promise<SystemHealth> {
    const res = await apiClient.get<SystemHealth>('/health');
    return res.data;
  },
};
