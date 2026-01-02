/**
 * Application-wide type definitions
 */

/** Health check response from the server */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

/** Route configuration type */
export interface RouteConfig {
  path: string;
  label: string;
}

/** Re-export API types for convenience */
export type {
  MessageRole,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ApiError,
} from './api.js';
