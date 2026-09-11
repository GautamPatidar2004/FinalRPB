import apiClient from './apiClient';
import type {
  BlockPlan,
  BlockPlanItem,
  PlanGenerationParams,
  PlanGenerationResult,
  PlanValidationResponse,
  PlanConflictResponse,
  PlanReviewRequest,
  PlanReviewResponse,
} from '../types';

export const planningService = {
  // List persisted block plans
  async getPlans(filters?: { status?: string; corridor_id?: string }): Promise<BlockPlan[]> {
    const res = await apiClient.get<BlockPlan[]>('/api/v1/plans', { params: filters });
    return res.data;
  },

  // Get plan by ID
  async getPlan(planId: string): Promise<BlockPlan> {
    const res = await apiClient.get<BlockPlan>(`/api/v1/plans/${planId}`);
    return res.data;
  },

  // AI Automatic Plan Generation
  async generatePlan(params: PlanGenerationParams = {}): Promise<PlanGenerationResult> {
    const res = await apiClient.post<PlanGenerationResult>('/api/v1/plans/generate', params);
    return res.data;
  },

  // Validate plan against railway hard constraints
  async validatePlan(planId: string): Promise<PlanValidationResponse> {
    const res = await apiClient.post<PlanValidationResponse>(`/api/v1/plans/${planId}/validate`);
    return res.data;
  },

  // Inspect plan conflicts and violations
  async getPlanConflicts(planId: string): Promise<PlanConflictResponse> {
    const res = await apiClient.get<PlanConflictResponse>(`/api/v1/plans/${planId}/conflicts`);
    return res.data;
  },

  // Human review lifecycle transition (start_review, approve, reject)
  async reviewPlan(planId: string, payload: PlanReviewRequest): Promise<PlanReviewResponse> {
    const res = await apiClient.post<PlanReviewResponse>(`/api/v1/plans/${planId}/review`, payload);
    return res.data;
  },

  // Modify scheduled block plan item
  async updatePlanItem(
    planId: string,
    itemId: string,
    updates: Partial<BlockPlanItem>
  ): Promise<BlockPlanItem> {
    const res = await apiClient.patch<BlockPlanItem>(
      `/api/v1/plans/${planId}/items/${itemId}`,
      updates
    );
    return res.data;
  },

  // Delete plan (only draft/rejected)
  async deletePlan(planId: string): Promise<{ status: string; plan_id: string }> {
    const res = await apiClient.delete<{ status: string; plan_id: string }>(
      `/api/v1/plans/${planId}`
    );
    return res.data;
  },
};
