/**
 * Dialogue Scenarios Constants
 * Pre-defined conversation scenarios for practicing real-world English conversations
 */

/** Difficulty levels for scenarios */
export type ScenarioDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** Scenario definition interface */
export interface Scenario {
  /** Unique identifier for the scenario */
  id: string;
  /** Display title for the scenario */
  title: string;
  /** Brief description of the scenario */
  description: string;
  /** Context setting for the conversation */
  context: string;
  /** Role the AI will play in the conversation */
  aiRole: string;
  /** Role the user will play in the conversation */
  userRole: string;
  /** Difficulty level of the scenario */
  difficulty: ScenarioDifficulty;
  /** Suggested phrases the user can use */
  suggestedPrompts: string[];
}

/** Available difficulty levels for filtering */
export const DIFFICULTIES: readonly ScenarioDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

/** Pre-defined dialogue scenarios */
export const SCENARIOS: Scenario[] = [
  {
    id: 'restaurant',
    title: 'Restaurant Ordering',
    description: 'Practice ordering food at a restaurant',
    context: 'You are at a restaurant and want to order food.',
    aiRole: 'Waiter',
    userRole: 'Customer',
    difficulty: 'beginner',
    suggestedPrompts: [
      'Can I see the menu, please?',
      'What do you recommend?',
      'I would like to order...',
      'Could I have the bill, please?',
    ],
  },
  {
    id: 'job-interview',
    title: 'Job Interview',
    description: 'Practice a job interview scenario',
    context: 'You are interviewing for a software developer position.',
    aiRole: 'Interviewer',
    userRole: 'Job Candidate',
    difficulty: 'advanced',
    suggestedPrompts: [
      'Tell me about yourself.',
      'Why do you want this job?',
      'What are your strengths?',
      'Where do you see yourself in 5 years?',
    ],
  },
  {
    id: 'hotel-checkin',
    title: 'Hotel Check-in',
    description: 'Practice checking into a hotel',
    context: 'You are checking into a hotel for a 3-night stay.',
    aiRole: 'Hotel Receptionist',
    userRole: 'Guest',
    difficulty: 'beginner',
    suggestedPrompts: [
      'I have a reservation under...',
      'Is breakfast included?',
      'What time is checkout?',
      'Could I get a room with a view?',
    ],
  },
  {
    id: 'shopping',
    title: 'Shopping for Clothes',
    description: 'Practice shopping at a clothing store',
    context: 'You are looking for a new outfit for a special occasion.',
    aiRole: 'Shop Assistant',
    userRole: 'Customer',
    difficulty: 'intermediate',
    suggestedPrompts: [
      'Do you have this in a different size?',
      'Can I try this on?',
      'How much does this cost?',
      'Is this on sale?',
    ],
  },
  {
    id: 'doctor',
    title: 'Doctor Appointment',
    description: 'Practice describing symptoms to a doctor',
    context: 'You are visiting a doctor because you are not feeling well.',
    aiRole: 'Doctor',
    userRole: 'Patient',
    difficulty: 'intermediate',
    suggestedPrompts: [
      'I have been feeling unwell.',
      'My symptoms started...',
      'Should I take any medication?',
      'When should I come back for a follow-up?',
    ],
  },
];
