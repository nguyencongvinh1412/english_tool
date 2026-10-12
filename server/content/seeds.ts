/**
 * Built-in Content
 * Original starter items so every skill works before any AI generation.
 * Validated against the content schemas and upserted on startup.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { CONTENT_KINDS, contentTitle, kindLanguage, type CefrLevel, type ContentKind, type JlptLevel } from './schemas.js';
import { JA_SEED_ITEMS } from './seedsJa.js';

interface SeedItem {
  id: string;
  kind: ContentKind;
  level: CefrLevel | JlptLevel;
  exam?: 'none' | 'toeic' | 'ielts';
  part?: string;
  topic: string;
  payload: unknown;
}

export const SEED_ITEMS: SeedItem[] = [
  {
    id: 'builtin-reading-urban-gardens',
    kind: 'reading-passage',
    level: 'B1',
    topic: 'cities',
    payload: {
      title: 'Gardens on the Roof',
      paragraphs: [
        'In many big cities, space is expensive and parks are often far away. Because of this, more and more people are growing vegetables in unusual places: on rooftops, balconies and even the walls of buildings. These small urban gardens are changing the way some city residents think about food.',
        'One of the best-known examples is a community garden on top of a car park in central Rotterdam. Neighbours pay a small yearly fee, and in return each family gets a box of soil where they can grow tomatoes, herbs and salad leaves. Volunteers organise weekend workshops for beginners, so you do not need any experience to join.',
        'Supporters say urban gardens have benefits beyond fresh food. Plants help to cool buildings in summer, and green roofs can hold rainwater that would otherwise flood the streets. Many members also say that the garden is the first place where they have actually talked to their neighbours.',
        'However, rooftop gardening is not always easy. Roofs must be strong enough to carry heavy, wet soil, and engineers have to check them before any work begins. Water and tools must be carried upstairs, which can be difficult for older members. Even so, the waiting list for the Rotterdam garden is now longer than one year.',
      ],
      questions: [
        {
          type: 'mcq',
          prompt: 'Why are people growing vegetables in unusual places?',
          options: ['Vegetables in shops are too expensive', 'City space is costly and parks are far away', 'Farmers have asked them to', 'They want to sell food to restaurants'],
          answerIndex: 1,
          explanation: 'Paragraph 1: "space is expensive and parks are often far away. Because of this..."',
        },
        {
          type: 'mcq',
          prompt: 'What do families receive for the yearly fee in Rotterdam?',
          options: ['Free vegetables every week', 'A box of soil to grow plants in', 'Gardening lessons in a school', 'A parking space'],
          answerIndex: 1,
          explanation: 'Paragraph 2: "each family gets a box of soil where they can grow tomatoes, herbs and salad leaves."',
        },
        {
          type: 'tfng',
          prompt: 'You must have gardening experience to join the Rotterdam garden.',
          answer: 'false',
          explanation: 'Paragraph 2 says "you do not need any experience to join."',
        },
        {
          type: 'mcq',
          prompt: 'According to supporters, how do green roofs help cities?',
          options: ['They make buildings warmer in winter', 'They hold rainwater that could flood streets', 'They reduce car traffic', 'They increase house prices'],
          answerIndex: 1,
          explanation: 'Paragraph 3: "green roofs can hold rainwater that would otherwise flood the streets."',
        },
        {
          type: 'tfng',
          prompt: 'The Rotterdam garden receives money from the city government.',
          answer: 'not_given',
          explanation: 'The passage mentions a yearly fee from neighbours but says nothing about government money.',
        },
        {
          type: 'mcq',
          prompt: 'What must happen before a rooftop garden is built?',
          options: ['Neighbours must vote', 'Engineers must check the roof', 'The car park must close', 'Older members must agree'],
          answerIndex: 1,
          explanation: 'Paragraph 4: "engineers have to check them before any work begins."',
        },
      ],
    },
  },
  {
    id: 'builtin-reading-procrastination',
    kind: 'reading-passage',
    level: 'B2',
    topic: 'psychology',
    payload: {
      title: 'Why We Put Things Off',
      paragraphs: [
        'Almost everyone has delayed an important task while doing something far less useful instead. For a long time, procrastination was treated as a simple problem of laziness or poor time management. More recent research, however, suggests that it has less to do with time and more to do with emotions.',
        'According to psychologists, people tend to postpone tasks that make them feel anxious, bored or insecure. Checking a phone or tidying a desk offers immediate relief from those feelings, even though the task itself remains. In other words, procrastination is a short-term mood repair strategy with long-term costs.',
        'This explains why simply telling someone to "manage their time better" rarely works. A detailed schedule does nothing to reduce the discomfort that triggered the delay in the first place. Researchers have found that students who forgive themselves for procrastinating on one exam actually procrastinate less before the next one, presumably because the task no longer carries the same burden of guilt.',
        'Practical strategies therefore focus on lowering the emotional cost of starting. Breaking a project into very small steps, committing to work for just five minutes, or making the first step deliberately easy can all reduce resistance. Once people have started, they usually find that the task is less unpleasant than they had imagined.',
      ],
      questions: [
        {
          type: 'mcq',
          prompt: 'What does recent research say procrastination is mainly about?',
          options: ['Laziness', 'Poor time management', 'Managing emotions', 'Lack of intelligence'],
          answerIndex: 2,
          explanation: 'Paragraph 1: it "has less to do with time and more to do with emotions."',
        },
        {
          type: 'mcq',
          prompt: 'Why do people check their phones instead of working?',
          options: ['It gives quick relief from unpleasant feelings', 'They are waiting for important messages', 'It helps them plan the task', 'Their teachers allow it'],
          answerIndex: 0,
          explanation: 'Paragraph 2: these activities offer "immediate relief from those feelings."',
        },
        {
          type: 'tfng',
          prompt: 'A detailed schedule is an effective cure for procrastination.',
          answer: 'false',
          explanation: 'Paragraph 3: a schedule "does nothing to reduce the discomfort" and advice about time "rarely works."',
        },
        {
          type: 'tfng',
          prompt: 'Students who forgave themselves procrastinated less before their next exam.',
          answer: 'true',
          explanation: 'Paragraph 3 states this finding directly.',
        },
        {
          type: 'tfng',
          prompt: 'Most people procrastinate more in the evening than in the morning.',
          answer: 'not_given',
          explanation: 'The passage does not mention the time of day.',
        },
        {
          type: 'mcq',
          prompt: 'Which strategy is recommended in the final paragraph?',
          options: ['Working without breaks', 'Making the first step deliberately easy', 'Waiting until you feel motivated', 'Doing the hardest part first'],
          answerIndex: 1,
          explanation: 'Paragraph 4 lists "making the first step deliberately easy."',
        },
      ],
    },
  },
  {
    id: 'builtin-gapfill-office',
    kind: 'reading-gapfill',
    level: 'B1',
    exam: 'toeic',
    part: 'toeic-5',
    topic: 'office',
    payload: {
      title: 'At the Office',
      questions: [
        { type: 'mcq', prompt: 'All expense reports must be submitted ____ the end of the month.', options: ['by', 'until', 'since', 'during'], answerIndex: 0, explanation: '"By" means no later than a deadline.' },
        { type: 'mcq', prompt: 'Ms. Tran has worked in the marketing department ____ 2019.', options: ['for', 'since', 'from', 'at'], answerIndex: 1, explanation: '"Since" is used with a starting point in time and the present perfect.' },
        { type: 'mcq', prompt: 'The new printer is much ____ than the old one.', options: ['fast', 'fastest', 'faster', 'more fast'], answerIndex: 2, explanation: 'Comparative of a short adjective: fast → faster.' },
        { type: 'mcq', prompt: 'Please contact the help desk if you experience any ____ with your account.', options: ['difficult', 'difficulties', 'difficultly', 'differ'], answerIndex: 1, explanation: 'After "any" we need a noun: difficulties.' },
        { type: 'mcq', prompt: 'The meeting was postponed ____ the manager was ill.', options: ['because', 'because of', 'despite', 'although'], answerIndex: 0, explanation: '"Because" introduces a clause with a subject and verb.' },
        { type: 'mcq', prompt: 'Neither the director ____ her assistant attended the conference.', options: ['or', 'and', 'nor', 'but'], answerIndex: 2, explanation: 'The pair is "neither ... nor".' },
        { type: 'mcq', prompt: 'Visitors are required to sign in ____ entering the building.', options: ['before', 'until', 'unless', 'while'], answerIndex: 0, explanation: '"Before entering" shows the order of actions.' },
        { type: 'mcq', prompt: 'The client was very ____ with the quality of our service.', options: ['satisfy', 'satisfying', 'satisfaction', 'satisfied'], answerIndex: 3, explanation: 'People feel "satisfied"; "satisfying" describes the thing that causes the feeling.' },
        { type: 'mcq', prompt: 'If the shipment ____ tomorrow, we will start production on Monday.', options: ['arrives', 'arrived', 'will arrive', 'arriving'], answerIndex: 0, explanation: 'First conditional: if + present simple, will + verb.' },
        { type: 'mcq', prompt: 'Our team ____ the proposal by the time the client calls.', options: ['finishes', 'will have finished', 'has finished', 'finished'], answerIndex: 1, explanation: 'Future perfect for an action completed before a future time.' },
      ],
    },
  },
  {
    id: 'builtin-listening-restaurant',
    kind: 'listening-quiz',
    level: 'A2',
    topic: 'restaurants',
    payload: {
      title: 'Booking a Table',
      format: 'dialogue',
      speakers: { A: { name: 'Anna', gender: 'female' }, B: { name: 'Mark', gender: 'male' } },
      script: [
        { speaker: 'B', text: "Good afternoon, Green Leaf Restaurant. Mark speaking. How can I help you?" },
        { speaker: 'A', text: "Hi. I'd like to book a table for Saturday evening, please." },
        { speaker: 'B', text: 'Of course. For how many people?' },
        { speaker: 'A', text: 'For four. Two adults and two children.' },
        { speaker: 'B', text: 'And what time would you like?' },
        { speaker: 'A', text: 'Is seven o\'clock possible?' },
        { speaker: 'B', text: "I'm sorry, we're full at seven. I can give you half past seven or eight o'clock." },
        { speaker: 'A', text: "Half past seven is fine. Could we sit near the window?" },
        { speaker: 'B', text: 'No problem. Can I have your name, please?' },
        { speaker: 'A', text: "It's Anna Lee. L, E, E." },
        { speaker: 'B', text: "Thank you, Ms Lee. A table for four at half past seven on Saturday, by the window. See you then!" },
      ],
      questions: [
        { type: 'mcq', prompt: 'Which day is the booking for?', options: ['Friday', 'Saturday', 'Sunday', 'Monday'], answerIndex: 1, explanation: 'Anna asks for "Saturday evening".' },
        { type: 'mcq', prompt: 'How many people will come?', options: ['Two', 'Three', 'Four', 'Five'], answerIndex: 2, explanation: '"For four. Two adults and two children."' },
        { type: 'mcq', prompt: 'What time is the table booked for?', options: ["Seven o'clock", 'Half past seven', "Eight o'clock", 'Half past eight'], answerIndex: 1, explanation: 'Seven is full, so she chooses half past seven.' },
        { type: 'mcq', prompt: 'What else does Anna ask for?', options: ['A birthday cake', 'A table near the window', 'A vegetarian menu', 'Free parking'], answerIndex: 1, explanation: '"Could we sit near the window?"' },
      ],
    },
  },
  {
    id: 'builtin-listening-station',
    kind: 'listening-quiz',
    level: 'B1',
    topic: 'travel',
    payload: {
      title: 'Station Announcement',
      format: 'monologue',
      speakers: { A: { name: 'Announcer', gender: 'female' } },
      script: [
        { speaker: 'A', text: 'Good morning, passengers. This is an announcement for customers travelling to Manchester.' },
        { speaker: 'A', text: 'The nine fifteen service to Manchester Piccadilly has been delayed by approximately twenty-five minutes because of a signal problem near Birmingham.' },
        { speaker: 'A', text: 'This train will now depart from platform six instead of platform four.' },
        { speaker: 'A', text: 'Passengers with reserved seats in coach C should note that coach C is closed today. Please sit in coach D, where seats have been kept for you.' },
        { speaker: 'A', text: 'Hot drinks and snacks are available from the café on platform one, and there is free Wi-Fi throughout the station.' },
        { speaker: 'A', text: 'We apologise for the delay and thank you for your patience.' },
      ],
      questions: [
        { type: 'mcq', prompt: 'Why is the train late?', options: ['Bad weather', 'A signal problem', 'A missing driver', 'Engineering work in Manchester'], answerIndex: 1, explanation: '"Delayed ... because of a signal problem near Birmingham."' },
        { type: 'mcq', prompt: 'How long is the delay?', options: ['About fifteen minutes', 'About twenty minutes', 'About twenty-five minutes', 'About an hour'], answerIndex: 2, explanation: '"Approximately twenty-five minutes."' },
        { type: 'mcq', prompt: 'Which platform will the train leave from?', options: ['One', 'Four', 'Six', 'Nine'], answerIndex: 2, explanation: '"Platform six instead of platform four."' },
        { type: 'mcq', prompt: 'What should passengers with seats in coach C do?', options: ['Ask for a refund', 'Take a later train', 'Sit in coach D', 'Stand in coach C'], answerIndex: 2, explanation: '"Please sit in coach D, where seats have been kept for you."' },
      ],
    },
  },
  {
    id: 'builtin-speaking-places',
    kind: 'speaking-ielts',
    level: 'B2',
    exam: 'ielts',
    part: 'ielts-speaking',
    topic: 'places',
    payload: {
      topic: 'Places and neighbourhoods',
      part1: [
        'Do you live in a house or an apartment?',
        'What do you like most about your neighbourhood?',
        'Is there anything you would like to change about the area where you live?',
        'Do you often visit parks or green spaces? Why or why not?',
      ],
      part2: {
        cueCard: 'Describe a place in your city that you enjoy visiting.',
        bullets: ['where it is', 'how often you go there', 'what you usually do there'],
        closing: 'and explain why you enjoy visiting this place.',
      },
      part3: [
        'Why do you think some public places become popular while others are ignored?',
        'How have cities in your country changed in the last twenty years?',
        'Should governments spend more money on parks or on public transport? Why?',
      ],
    },
  },
  {
    id: 'builtin-writing-email-delivery',
    kind: 'writing-prompt',
    level: 'B1',
    exam: 'toeic',
    part: 'toeic-w-email',
    topic: 'customer service',
    payload: {
      taskType: 'email',
      title: 'Late Office Furniture Delivery',
      instructions: 'Respond to the email. In your email, explain one problem the late delivery caused, ask one question about the new delivery, and make one request.',
      prompt: 'Reply to a supplier who is apologising for a delayed delivery.',
      minWords: 120,
      timeMinutes: 10,
      email: {
        from: 'Daniel Price <Customer Service, OfficeWorks Supplies>',
        subject: 'Your order #48217',
        body: 'Dear Customer,\n\nWe are sorry to inform you that the twelve desks you ordered will arrive one week later than planned because of a problem at our factory. We understand this may cause difficulties for your team. Please let us know how we can help, and if you have any questions about the new delivery date.\n\nBest regards,\nDaniel Price',
      },
    },
  },
  {
    id: 'builtin-writing-task1-commute',
    kind: 'writing-prompt',
    level: 'B2',
    exam: 'ielts',
    part: 'ielts-w1',
    topic: 'transport',
    payload: {
      taskType: 'ielts-task1',
      title: 'How Workers Commute',
      instructions: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      prompt: 'The chart below shows the percentage of workers in one city who travelled to work by car, bus and bicycle in 2005, 2015 and 2025.',
      minWords: 150,
      timeMinutes: 20,
      chart: {
        type: 'bar',
        title: 'Main way of travelling to work',
        unit: '%',
        categories: ['2005', '2015', '2025'],
        series: [
          { name: 'Car', values: [58, 49, 37] },
          { name: 'Bus', values: [27, 30, 28] },
          { name: 'Bicycle', values: [9, 15, 27] },
        ],
      },
    },
  },
  {
    id: 'builtin-writing-task2-remote',
    kind: 'writing-prompt',
    level: 'B2',
    exam: 'ielts',
    part: 'ielts-w2',
    topic: 'work',
    payload: {
      taskType: 'ielts-task2',
      title: 'Working From Home',
      instructions: 'Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
      prompt: 'More and more companies allow employees to work from home. Do the advantages of this trend outweigh the disadvantages?',
      minWords: 250,
      timeMinutes: 40,
    },
  },
];

/**
 * Validates and upserts built-in items so code changes to seeds reach the database
 * @throws Error if a seed does not match its schema (a programming error)
 */
export async function ensureBuiltinContent(): Promise<void> {
  for (const seed of [...SEED_ITEMS, ...JA_SEED_ITEMS] as SeedItem[]) {
    const definition = CONTENT_KINDS[seed.kind];
    const payload = definition.schema.parse(seed.payload);
    const title = contentTitle(seed.kind, payload);

    await db
      .insert(contentItems)
      .values({
        id: seed.id,
        kind: seed.kind,
        skill: definition.skill,
        exam: seed.exam ?? 'none',
        part: seed.part ?? null,
        level: seed.level,
        language: kindLanguage(seed.kind),
        title,
        topic: seed.topic,
        payload,
        source: 'builtin',
      })
      .onConflictDoUpdate({
        target: contentItems.id,
        set: { title, payload, level: seed.level, topic: seed.topic, part: seed.part ?? null, exam: seed.exam ?? 'none', status: sql`'published'` },
      });
  }
}
