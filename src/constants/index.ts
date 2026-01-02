/**
 * Application constants
 * Centralized configuration values to avoid magic strings/numbers
 */

/** Route paths for navigation */
export const ROUTES = {
  HOME: '/',
  CONVERSATION: '/conversation',
  PRONUNCIATION: '/pronunciation',
  SCENARIOS: '/scenarios',
} as const;

/** API endpoints */
export const API_ENDPOINTS = {
  HEALTH: '/api/health',
} as const;

/** Default server port */
export const DEFAULT_SERVER_PORT = 3001;
