/**
 * API Client - Lightweight fetch wrapper for backend communication
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_TIMEOUT = 10000; // 10 seconds

export interface ApiError {
  code: 'NETWORK_ERROR' | 'TIMEOUT' | 'SERVER_ERROR' | 'VALIDATION_ERROR';
  message: string;
  status?: number;
}

export interface ApiResponse<T> {
  data: T;
  ok: true;
}

export interface ApiErrorResponse {
  error: ApiError;
  ok: false;
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

/**
 * Backend connection state
 */
let isBackendConnected = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    isBackendConnected = response.ok;
    lastHealthCheck = Date.now();
    return isBackendConnected;
  } catch {
    isBackendConnected = false;
    lastHealthCheck = Date.now();
    return false;
  }
}

/**
 * Get current backend connection status
 */
export function getBackendStatus(): { connected: boolean; lastCheck: number } {
  return {
    connected: isBackendConnected,
    lastCheck: lastHealthCheck,
  };
}

/**
 * Should we check health again?
 */
export function shouldRefreshHealth(): boolean {
  return Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL;
}

/**
 * Make a POST request to the backend API
 */
export async function apiPost<TRequest, TResponse>(
  endpoint: string,
  data: TRequest
): Promise<ApiResult<TResponse>> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        ok: false,
        error: {
          code: response.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR',
          message: errorBody || `HTTP ${response.status}`,
          status: response.status,
        },
      };
    }

    const responseData = await response.json();
    isBackendConnected = true;

    return {
      ok: true,
      data: responseData as TResponse,
    };
  } catch (error) {
    isBackendConnected = false;

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out',
          },
        };
      }
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}

/**
 * Make a GET request to the backend API
 */
export async function apiGet<TResponse>(
  endpoint: string
): Promise<ApiResult<TResponse>> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: response.status >= 500 ? 'SERVER_ERROR' : 'VALIDATION_ERROR',
          message: `HTTP ${response.status}`,
          status: response.status,
        },
      };
    }

    const responseData = await response.json();
    isBackendConnected = true;

    return {
      ok: true,
      data: responseData as TResponse,
    };
  } catch (error) {
    isBackendConnected = false;

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
      },
    };
  }
}
