/**
 * Route paths
 */
export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  HOME: '/',
  LISTENING: '/listening',
  READING: '/reading',
  SPEAKING: '/speaking',
  WRITING: '/writing',
  EXAMS: '/exams',
  PROFILE: '/profile',
  ADMIN: '/admin',
  // Activities (pre-v2 pages, rebuilt in phase 3)
  DICTATION: '/listening/dictation',
  PRONUNCIATION: '/speaking/pronunciation',
  CONVERSATION: '/speaking/conversation',
  SCENARIOS: '/speaking/scenarios',
} as const;
