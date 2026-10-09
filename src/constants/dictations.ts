/**
 * Dictation Lessons Database
 * Short passages split into sentences for listening and typing practice
 * Numbers are written as words so learners are not penalised for digit/word mismatches
 */

import type { Difficulty } from './phrases';

/** Structure for a dictation lesson */
export interface DictationLesson {
  /** Unique identifier for the lesson */
  id: string;
  /** Lesson title */
  title: string;
  /** Difficulty level */
  difficulty: Difficulty;
  /** Sentences played and typed one at a time */
  sentences: string[];
}

/**
 * Built-in dictation lessons
 * Easy: short sentences, everyday vocabulary
 * Medium: longer sentences, common phrasal verbs and linking words
 * Hard: complex sentences, academic and abstract vocabulary
 */
export const DICTATION_LESSONS: DictationLesson[] = [
  // Easy
  {
    id: 'easy-morning-routine',
    title: 'My Morning Routine',
    difficulty: 'easy',
    sentences: [
      'I wake up at seven every morning.',
      'First, I drink a glass of water.',
      'Then I take a quick shower.',
      'I usually eat bread and eggs for breakfast.',
      'My sister makes coffee for both of us.',
      'I leave the house at eight o’clock.',
      'I go to work by bus.',
    ],
  },
  {
    id: 'easy-coffee-shop',
    title: 'At the Coffee Shop',
    difficulty: 'easy',
    sentences: [
      'Good morning, what can I get for you?',
      'Can I have a large iced coffee, please?',
      'Would you like milk or sugar?',
      'Just a little milk, thank you.',
      'Is that for here or to go?',
      'To go, please.',
      'That will be five dollars.',
    ],
  },
  {
    id: 'easy-my-family',
    title: 'My Family',
    difficulty: 'easy',
    sentences: [
      'There are four people in my family.',
      'My father is a teacher at a high school.',
      'My mother works in a small bank.',
      'I have one younger brother.',
      'He likes playing football with his friends.',
      'We have dinner together every evening.',
      'On Sundays, we visit our grandparents.',
    ],
  },

  // Medium
  {
    id: 'medium-weekend-trip',
    title: 'A Weekend Trip',
    difficulty: 'medium',
    sentences: [
      'Last weekend, my friends and I went on a trip to the beach.',
      'We left early in the morning to avoid the traffic.',
      'The weather was sunny, but it was quite windy.',
      'We spent most of the afternoon swimming and taking photos.',
      'In the evening, we found a small restaurant near the sea.',
      'The seafood was fresh and surprisingly cheap.',
      'I can’t wait to go back there next summer.',
    ],
  },
  {
    id: 'medium-working-from-home',
    title: 'Working From Home',
    difficulty: 'medium',
    sentences: [
      'Since last year, I have been working from home three days a week.',
      'At first, it was hard to stay focused without my colleagues around me.',
      'Now I have a quiet corner in my apartment that I use as an office.',
      'I try to start work at the same time every day.',
      'Video calls help me keep in touch with my team.',
      'The best part is that I no longer waste time commuting.',
      'However, I sometimes miss having lunch with my coworkers.',
    ],
  },
  {
    id: 'medium-learning-skill',
    title: 'Learning a New Skill',
    difficulty: 'medium',
    sentences: [
      'A few months ago, I decided to learn how to play the guitar.',
      'I watched online lessons and practiced for twenty minutes a day.',
      'My fingers hurt a lot during the first couple of weeks.',
      'There were times when I wanted to give up completely.',
      'Slowly, I started to notice that I was getting better.',
      'Last week, I played a whole song for my friends.',
      'The secret is to practice a little every single day.',
    ],
  },

  // Hard
  {
    id: 'hard-science-of-sleep',
    title: 'The Science of Sleep',
    difficulty: 'hard',
    sentences: [
      'Scientists have long debated why humans spend about a third of their lives asleep.',
      'Recent research suggests that sleep plays a crucial role in consolidating memories.',
      'During deep sleep, the brain clears away waste products that build up during the day.',
      'People who regularly sleep less than six hours are more likely to develop health problems.',
      'Despite this evidence, many adults treat sleep as a luxury rather than a necessity.',
      'Experts recommend keeping a consistent schedule, even on weekends.',
    ],
  },
  {
    id: 'hard-cities-and-climate',
    title: 'Cities and Climate Change',
    difficulty: 'hard',
    sentences: [
      'More than half of the world’s population now lives in urban areas.',
      'Cities are responsible for a significant proportion of global carbon emissions.',
      'Many local governments are investing in public transport to reduce traffic congestion.',
      'Green roofs and urban parks can help lower temperatures during heatwaves.',
      'Critics argue that these measures are not ambitious enough to make a real difference.',
      'Nevertheless, small changes in individual behaviour can add up over time.',
    ],
  },
  {
    id: 'hard-job-interview',
    title: 'Preparing for a Job Interview',
    difficulty: 'hard',
    sentences: [
      'Before attending an interview, it is essential to research the company thoroughly.',
      'Interviewers often ask candidates to describe a challenge they have overcome.',
      'Structuring your answer around a specific situation makes it far more convincing.',
      'It is equally important to prepare a few thoughtful questions of your own.',
      'Candidates who appear genuinely curious tend to leave a lasting impression.',
      'Finally, sending a brief thank-you message afterwards demonstrates professionalism.',
    ],
  },
];
