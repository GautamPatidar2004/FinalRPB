import axios, { type AxiosError, type AxiosInstance } from 'axios';
import type { ApiError } from '../types';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8001'
    : 'https://railway-planning-ai.onrender.com');

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Response interceptor: Normalize errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(normalizeApiError(error))
);

/**
 * Normalizes any AxiosError or network fault into a structured ApiError.
 */
export function normalizeApiError(error: AxiosError<any>): ApiError {
  if (error.response) {
    const data = error.response.data;
    const message =
      typeof data === 'string'
        ? data
        : data?.detail || data?.message || `Request failed with status ${error.response.status}`;
    return {
      message,
      status: error.response.status,
      details: data,
    };
  }
  if (error.request) {
    return {
      message: 'Network error: Server is unreachable. Please verify connection and backend status.',
      status: 0,
    };
  }
  return {
    message: error.message || 'An unexpected error occurred.',
  };
}

export default apiClient;
