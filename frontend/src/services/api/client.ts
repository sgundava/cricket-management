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
let consecutiveFailures = 0;
let offlineModeEnabled = false; // User chose to play offline - skip all backend calls
const HEALTH_CHECK_INTERVAL_ONLINE = 30000; // 30 seconds when online
const HEALTH_CHECK_INTERVAL_OFFLINE = 60000; // 60 seconds when offline (reduce console spam)

/**
 * Enable offline mode - skips all backend calls until re-enabled
 */
export function setOfflineMode(enabled: boolean): void {
  offlineModeEnabled = enabled;
  if (enabled) {
    isBackendConnected = false;
  }
}

/**
 * Check if we're in offline mode (either forced or detected)
 */
export function isOffline(): boolean {
  return offlineModeEnabled || !isBackendConnected;
}

/**
 * Check if offline mode was explicitly enabled by user
 */
export function isOfflineModeEnabled(): boolean {
  return offlineModeEnabled;
}

/**
 * Check if backend is available
 * Uses exponential backoff when offline to reduce console spam
 */
export async function checkBackendHealth(): Promise<boolean> {
  // If user enabled offline mode, don't even try to check
  if (offlineModeEnabled) {
    return false;
  }

  // Skip check if we recently confirmed offline (reduce network error spam)
  const minInterval = isBackendConnected ? HEALTH_CHECK_INTERVAL_ONLINE : HEALTH_CHECK_INTERVAL_OFFLINE;
  if (lastHealthCheck > 0 && Date.now() - lastHealthCheck < minInterval) {
    return isBackendConnected;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    isBackendConnected = response.ok;
    lastHealthCheck = Date.now();
    if (response.ok) {
      consecutiveFailures = 0;
    }
    return isBackendConnected;
  } catch {
    isBackendConnected = false;
    lastHealthCheck = Date.now();
    consecutiveFailures++;
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
  const interval = isBackendConnected ? HEALTH_CHECK_INTERVAL_ONLINE : HEALTH_CHECK_INTERVAL_OFFLINE;
  return Date.now() - lastHealthCheck > interval;
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
