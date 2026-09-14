import apiClient from './apiClient';
import type {
  UnifiedPlanExplanation,
  PredictionExplanationResponse,
  ProvidersStatusResponse,
  ExplainPlanParams,
  ExplainPredictionParams,
} from '../types';

// In-memory cache to prevent duplicate network calls
const planExplanationCache = new Map<string, UnifiedPlanExplanation>();
const predictionExplanationCache = new Map<string, PredictionExplanationResponse>();

export const explainService = {
  /**
   * Retrieves or computes unified explainability for a plan run.
   * Utilizes cache when available.
   */
  async getPlanExplanation(
    params: ExplainPlanParams,
    bypassCache: boolean = false
  ): Promise<UnifiedPlanExplanation> {
    const cacheKey = params.plan_id || `${params.corridor_id || 'DEFAULT'}_${(params.request_ids || []).join(',')}`;

    if (!bypassCache && planExplanationCache.has(cacheKey)) {
      return planExplanationCache.get(cacheKey)!;
    }

    let result: UnifiedPlanExplanation;

    if (params.plan_id) {
      try {
        const res = await apiClient.get<UnifiedPlanExplanation>(`/api/v1/explain/plan/${params.plan_id}`);
        result = res.data;
      } catch {
        // Fallback to POST /api/v1/explain/plan if GET not found or unpersisted
        const res = await apiClient.post<UnifiedPlanExplanation>('/api/v1/explain/plan', params);
        result = res.data;
      }
    } else {
      const res = await apiClient.post<UnifiedPlanExplanation>('/api/v1/explain/plan', params);
      result = res.data;
    }

    if (result) {
      planExplanationCache.set(cacheKey, result);
      if (result.planning_run_id) {
        planExplanationCache.set(result.planning_run_id, result);
      }
    }

    return result;
  },

  /**
   * Retrieves feature attribution and aspect breakdown for an individual maintenance request.
   */
  async getPredictionExplanation(
    params: ExplainPredictionParams,
    bypassCache: boolean = false
  ): Promise<PredictionExplanationResponse> {
    const cacheKey = params.request_id || `${params.corridor_id}_${params.asset_id}`;

    if (!bypassCache && predictionExplanationCache.has(cacheKey)) {
      return predictionExplanationCache.get(cacheKey)!;
    }

    const res = await apiClient.post<PredictionExplanationResponse>('/api/v1/explain/prediction', params);
    const result = res.data;

    if (result && cacheKey) {
      predictionExplanationCache.set(cacheKey, result);
    }

    return result;
  },

  /**
   * Retrieves telemetry and availability for Gemini and Groq providers.
   */
  async getProvidersStatus(): Promise<ProvidersStatusResponse> {
    const res = await apiClient.get<ProvidersStatusResponse>('/api/v1/explain/providers');
    return res.data;
  },

  /**
   * Evicts in-memory explanation caches.
   */
  clearCache(): void {
    planExplanationCache.clear();
    predictionExplanationCache.clear();
  },
};
