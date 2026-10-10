/**
 * Exam route helpers
 */
export const EXAM_SESSION_ROUTE = '/exams/session/:sessionId';

export const examPath = (sessionId: string): string => `/exams/session/${sessionId}`;
