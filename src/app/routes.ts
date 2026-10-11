/**
 * Route paths
 */
export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  RESET_PASSWORD: '/reset-password',
  PRIVACY: '/privacy',
  ONBOARDING: '/onboarding',
  HOME: '/',
  LISTENING: '/listening',
  READING: '/reading',
  SPEAKING: '/speaking',
  WRITING: '/writing',
  EXAMS: '/exams',
  PROFILE: '/profile',
  ADMIN: '/admin',
  // Activities
  DICTATION: '/listening/dictation',
  LISTENING_QUIZ: '/listening/comprehension',
  READING_PASSAGE: '/reading/passages',
  READING_GAPFILL: '/reading/sentence-completion',
  SPEAKING_IELTS: '/speaking/ielts',
  WRITING_EMAIL: '/writing/email',
  WRITING_TASK1: '/writing/ielts-task1',
  WRITING_TASK2: '/writing/ielts-task2',
  PRONUNCIATION: '/speaking/pronunciation',
  CONVERSATION: '/speaking/conversation',
  SCENARIOS: '/speaking/scenarios',
} as const;
