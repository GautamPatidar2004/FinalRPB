import apiClient from './apiClient';
import type {
  Corridor,
  DashboardCorridor,
  Asset,
  DashboardAsset,
  Train,
  MaintenanceRequest,
  CorridorAvailability,
  Department,
  Priority,
  RequestFilters,
  AssetFilters,
} from '../types';

export interface CreateRequestPayload {
  request_id: string;
  department: Department;
  corridor_id: string;
  asset_id: string;
  required_duration_minutes: number;
  earliest_start_minute?: number;
  latest_end_minute?: number;
  is_power_block_required?: boolean;
  is_traffic_block_required?: boolean;
  urgency?: Priority;
  linked_defect_id?: string;
}

export interface CreateAssetPayload {
  asset_id: string;
  corridor_id: string;
  department: Department;
  start_km: number;
  end_km: number;
  track_type: 'UP' | 'DOWN' | 'BOTH' | 'SINGLE';
}

export const operationalService = {
  // Corridors
  async getCorridors(): Promise<Corridor[]> {
    const res = await apiClient.get<Corridor[]>('/api/v1/corridors');
    return res.data;
  },

  async getDashboardCorridors(): Promise<DashboardCorridor[]> {
    const res = await apiClient.get<DashboardCorridor[]>('/api/v1/dashboard/corridors');
    return res.data;
  },

  async getCorridor(corridorId: string): Promise<Corridor> {
    const res = await apiClient.get<Corridor>(`/api/v1/corridors/${corridorId}`);
    return res.data;
  },

  // Corridor Availability
  async getAvailability(corridorId?: string): Promise<CorridorAvailability[]> {
    const url = corridorId ? `/api/v1/availability/${corridorId}` : '/api/v1/availability';
    const res = await apiClient.get<CorridorAvailability[]>(url);
    return res.data;
  },

  async updateAvailability(
    corridorId: string,
    payload: {
      available_start_minute?: number;
      available_end_minute?: number;
      max_parallel_blocks?: number;
      is_electrified?: boolean;
    }
  ): Promise<CorridorAvailability> {
    const res = await apiClient.patch<CorridorAvailability>(
      `/api/v1/availability/${corridorId}`,
      payload
    );
    return res.data;
  },

  // Assets
  async getAssets(filters?: AssetFilters): Promise<Asset[]> {
    const res = await apiClient.get<Asset[]>('/api/v1/assets', { params: filters });
    return res.data;
  },

  async getDashboardAssets(filters?: {
    corridor_id?: string;
    department?: string;
  }): Promise<DashboardAsset[]> {
    const res = await apiClient.get<DashboardAsset[]>('/api/v1/dashboard/assets', {
      params: filters,
    });
    return res.data;
  },

  async getAsset(assetId: string): Promise<Asset> {
    const res = await apiClient.get<Asset>(`/api/v1/assets/${assetId}`);
    return res.data;
  },

  async createAsset(payload: CreateAssetPayload): Promise<Asset> {
    const res = await apiClient.post<Asset>('/api/v1/assets', payload);
    return res.data;
  },

  // Trains / Timetable
  async getTrains(corridorId?: string): Promise<Train[]> {
    const params = corridorId ? { corridor_id: corridorId } : undefined;
    const res = await apiClient.get<Train[]>('/api/v1/trains', { params });
    return res.data;
  },

  // Maintenance Requests
  async getRequests(filters?: RequestFilters): Promise<MaintenanceRequest[]> {
    // If overdue_only or pagination params are used, route through dashboard/requests
    const endpoint = filters?.overdue_only || filters?.limit !== undefined
      ? '/api/v1/dashboard/requests'
      : '/api/v1/requests';
    const res = await apiClient.get<MaintenanceRequest[]>(endpoint, { params: filters });
    return res.data;
  },

  async getRequest(requestId: string): Promise<MaintenanceRequest> {
    const res = await apiClient.get<MaintenanceRequest>(`/api/v1/requests/${requestId}`);
    return res.data;
  },

  async createRequest(payload: CreateRequestPayload): Promise<MaintenanceRequest> {
    const res = await apiClient.post<MaintenanceRequest>('/api/v1/requests', payload);
    return res.data;
  },

  async updateRequest(
    requestId: string,
    updates: Partial<MaintenanceRequest>
  ): Promise<MaintenanceRequest> {
    const res = await apiClient.patch<MaintenanceRequest>(`/api/v1/requests/${requestId}`, updates);
    return res.data;
  },

  async updateRequestStatus(requestId: string, status: string): Promise<MaintenanceRequest> {
    const res = await apiClient.patch<MaintenanceRequest>(`/api/v1/requests/${requestId}`, {
      status,
    });
    return res.data;
  },

  async deleteRequest(requestId: string): Promise<{ status: string; request_id: string }> {
    const res = await apiClient.delete<{ status: string; request_id: string }>(
      `/api/v1/requests/${requestId}`
    );
    return res.data;
  },
};
