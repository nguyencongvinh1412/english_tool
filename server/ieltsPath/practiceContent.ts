/**
 * Written practice for the IELTS path: writing tasks and speaking sets for phase 1. They are fixed, level-controlled
 * prompts (no AI cost, no waiting), stored as archived content items so they stay out of the practice library.
 * Listening and reading exercises are generated (see practice.ts).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { contentTitle, speakingIeltsGate, writingPrompt } from '../content/schemas.js';
import type { PracticeType } from './syllabus.js';

export interface StaticGroup {
  id: string;
  type: PracticeType;
  kind: 'writing-prompt' | 'speaking-ielts';
  skill: 'writing' | 'speaking';
  level: string;
  topic: string;
  payload: unknown;
}

const para = (n: number, title: string, prompt: string, minWords = 80): StaticGroup => ({
  id: `ip-w-para-${n}`,
  type: 'w-para',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'A2',
  topic: title,
  payload: { taskType: 'ielts-task2', title, instructions: `Write one clear paragraph of about ${minWords} words. Start with a topic sentence, add two or three supporting sentences, and finish with an ending sentence.`, prompt, minWords, timeMinutes: 25 },
});

const task1 = (n: number, title: string, prompt: string, unit: string, categories: string[], series: { name: string; values: number[] }[]): StaticGroup => ({
  id: `ip-w-task1-${n}`,
  type: 'w-task1',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'A2',
  topic: title,
  payload: {
    taskType: 'ielts-task1',
    title,
    instructions: 'You should spend about 20 minutes on this task. Write at least 120 words. Describe the main facts: do not give opinions.',
    prompt,
    minWords: 120,
    timeMinutes: 20,
    chart: { type: 'bar', title, unit, categories, series },
  },
});

const task2 = (n: number, title: string, prompt: string): StaticGroup => ({
  id: `ip-w-task2-${n}`,
  type: 'w-task2',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task2', title, instructions: 'You should spend about 30 minutes on this task. Write at least 150 words. Give your opinion, reasons and examples.', prompt, minWords: 150, timeMinutes: 30 },
});

const part1 = (n: number, topic: string, questions: string[]): StaticGroup => ({
  id: `ip-s-part1-${n}`,
  type: 's-part1',
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: 'A2',
  topic,
  payload: { topic, part1: questions, part3: [] },
});

const part2 = (n: number, topic: string, cueCard: string, bullets: string[], closing: string): StaticGroup => ({
  id: `ip-s-part2-${n}`,
  type: 's-part2',
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: 'A2',
  topic,
  payload: { topic, part1: [`Do you like talking about ${topic.toLowerCase()}?`, 'Why or why not?'], part2: { cueCard, bullets, closing }, part3: [] },
});

const mock = (n: number, topic: string, questions: string[], cueCard: string, bullets: string[], closing: string): StaticGroup => ({
  id: `ip-s-mock-${n}`,
  type: 's-mock',
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: 'B1',
  topic,
  payload: { topic, part1: questions, part2: { cueCard, bullets, closing }, part3: [] },
});


const line = (n: number, title: string, prompt: string, unit: string, categories: string[], series: { name: string; values: number[] }[]): StaticGroup => ({
  id: `ip-w-line-${n}`,
  type: 'w-line',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: {
    taskType: 'ielts-task1',
    title,
    instructions: 'You should spend about 20 minutes on this task. Write at least 150 words. Describe the main trends and compare the lines: do not give opinions.',
    prompt: `${prompt} Summarise the information by selecting and reporting the main features, and make comparisons where relevant.`,
    minWords: 150,
    timeMinutes: 20,
    chart: { type: 'line', title, unit, categories, series },
  },
});

const essay = (type: 'w-opinion' | 'w-advdis', n: number, title: string, prompt: string): StaticGroup => ({
  id: `ip-${type}-${n}`,
  type,
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task2', title, instructions: 'You should spend about 40 minutes on this task. Write at least 220 words in four paragraphs: introduction, two body paragraphs and a conclusion.', prompt, minWords: 220, timeMinutes: 40 },
});

const full = (n: number, topic: string, part1: string[], cueCard: string, bullets: string[], closing: string, part3: string[]): StaticGroup => ({
  id: `ip-s-full-${n}`,
  type: 's-full',
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: 'B1',
  topic,
  payload: { topic, part1, part2: { cueCard, bullets, closing }, part3 },
});

export const STATIC_GROUPS: StaticGroup[] = [
  para(1, 'My daily routine', 'Write about what you usually do on a weekday, from the morning to the evening.'),
  para(2, 'My family', 'Write about the people in your family and what you like doing together.'),
  para(3, 'My home', 'Write about the place where you live: the rooms, the neighbourhood and what you like about it.'),
  para(4, 'My work or studies', 'Write about your job or your studies: what you do every day and why you chose it.'),
  para(5, 'My hometown', 'Write about your hometown: where it is, what people do there and what is special about it.'),
  para(6, 'A hobby I enjoy', 'Write about a hobby that you enjoy. Say how often you do it and why you like it.'),
  para(7, 'Last weekend', 'Write about what you did last weekend. Use the past simple.'),
  para(8, 'My favourite food', 'Write about a food or a meal that you like. Say when you eat it and why it is special.'),
  para(9, 'How I travel', 'Write about how you usually travel to work or school and what you think about it.'),
  para(10, 'A day I remember', 'Write about a day in the past that you remember well. Say what happened and how you felt.'),

  task1(1, 'Students in three faculties', 'The chart below shows the number of students in three faculties of a university in 2000, 2010 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'thousand students', ['2000', '2010', '2020'], [
    { name: 'Science', values: [12, 15, 18] }, { name: 'Arts', values: [20, 18, 14] }, { name: 'Business', values: [8, 14, 22] },
  ]),
  task1(2, 'Hours of exercise per week', 'The chart below shows the average hours of exercise per week of three age groups in 2019 and 2024. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'hours per week', ['Age 18-25', 'Age 26-40', 'Age 41-60'], [
    { name: '2019', values: [5, 3, 2] }, { name: '2024', values: [3, 4, 4] },
  ]),
  task1(3, 'Monthly spending in two countries', 'The chart below shows the average monthly spending of a family in Country A and Country B. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'US dollars', ['Food', 'Transport', 'Housing'], [
    { name: 'Country A', values: [320, 150, 600] }, { name: 'Country B', values: [410, 90, 480] },
  ]),
  task1(4, 'Visitors to three places', 'The chart below shows the number of visitors to three places in a city in 2005 and 2015. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'thousand visitors', ['Museum', 'Park', 'Zoo'], [
    { name: '2005', values: [40, 90, 60] }, { name: '2015', values: [75, 80, 95] },
  ]),
  task1(5, 'How people travel to work', 'The chart below shows how workers in a town travelled to work in 1995 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'per cent of workers', ['Car', 'Bus', 'Bicycle', 'Walking'], [
    { name: '1995', values: [55, 25, 5, 15] }, { name: '2020', values: [40, 30, 15, 15] },
  ]),
  task1(6, 'Free-time activities of two age groups', 'The chart below shows the hours per week that two age groups spent on three activities in 2022. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', 'hours per week', ['Games', 'Reading', 'Sport'], [
    { name: 'Age 16-24', values: [12, 2, 5] }, { name: 'Age 45-64', values: [3, 5, 3] },
  ]),

  task2(1, 'English at primary school', 'Some people think children should start learning English at primary school. Do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience.'),
  task2(2, 'Working from home', 'Many people now work from home. Is this a good or a bad thing? Give reasons for your answer.'),
  task2(3, 'Living in a big city', 'Some people prefer to live in a big city, while others prefer a small town. Which do you prefer? Give reasons for your answer.'),
  task2(4, 'Social media and young people', 'Young people spend too much time on social media. Do you agree or disagree? Give reasons and examples.'),
  task2(5, 'Public transport', 'Some people think public transport should be free. Do you agree or disagree? Give reasons for your answer.'),
  task2(6, 'Exercise and health', 'Everyone should do some exercise every day. Do you agree or disagree? Give reasons and examples.'),

  part1(1, 'Home', ['Where do you live?', 'Do you live in a house or an apartment?', 'What do you like about your home?', 'Is it easy to travel from your home to the city centre?']),
  part1(2, 'Work and study', ['Do you work or study?', 'Why did you choose that job or subject?', 'What do you like most about it?', 'Would you like to change it in the future?']),
  part1(3, 'Hometown', ['Where is your hometown?', 'What is your hometown famous for?', 'Do you like living there?', 'Has your hometown changed much in recent years?']),
  part1(4, 'Free time', ['What do you do in your free time?', 'Do you prefer to relax at home or go out?', 'Did you have the same hobbies as a child?', 'Is there a hobby you would like to try?']),
  part1(5, 'Food', ['What food do you like to eat?', 'Do you cook at home?', 'What did you eat for breakfast today?', 'Are there any foods you do not like?']),
  part1(6, 'Transport', ['How do you usually travel to work or school?', 'Do you prefer travelling alone or with other people?', 'What would improve public transport in your city?', 'Did you travel differently when you were younger?']),
  part1(7, 'Weather', ['What is the weather like in your hometown?', 'Which season do you like best?', 'Does the weather change your mood?', 'What do you do on rainy days?']),
  part1(8, 'Shopping', ['Do you like shopping?', 'Do you prefer shopping online or in shops?', 'What did you last buy?', 'Do you shop alone or with friends?']),
  part1(9, 'Family', ['Do you have a big family?', 'Who do you spend most time with?', 'What do you usually do together?', 'Do you want to have a big family in the future?']),
  part1(10, 'Technology', ['How often do you use your phone?', 'What do you use it for?', 'Do you think people spend too much time on their phones?', 'Did you use technology a lot as a child?']),

  part2(1, 'A person in your family', 'Describe a person in your family.', ['who this person is', 'what he or she looks like', 'what you do together'], 'and explain why you like spending time with this person.'),
  part2(2, 'A meal', 'Describe a meal you enjoyed recently.', ['where you had it', 'who you had it with', 'what you ate'], 'and explain why you enjoyed it.'),
  part2(3, 'A place you visited', 'Describe a place you visited on holiday.', ['where it was', 'when you went', 'what you did there'], 'and explain why you remember it.'),
  part2(4, 'A useful thing you own', 'Describe a useful piece of technology you own.', ['what it is', 'how you got it', 'how you use it'], 'and explain why it is useful.'),
  part2(5, 'A friend', 'Describe a friend you have known for a long time.', ['who this person is', 'how you met', 'what you do together'], 'and explain why this friend is important to you.'),
  part2(6, 'A time you helped someone', 'Describe a time when you helped someone.', ['who you helped', 'what the problem was', 'how you helped'], 'and explain how you felt afterwards.'),

  mock(1, 'Home and a person', ['Where do you live?', 'What do you like about your home?', 'What do you do in your free time?', 'Do you work or study?'], 'Describe a person in your family.', ['who this person is', 'what he or she looks like', 'what you do together'], 'and explain why you like spending time with this person.'),
  mock(2, 'Travel and a place', ['How do you usually travel to work or school?', 'What would improve public transport in your city?', 'Do you like travelling?', 'Where would you like to go next?'], 'Describe a place you visited on holiday.', ['where it was', 'when you went', 'what you did there'], 'and explain why you remember it.'),
  mock(3, 'Food and a meal', ['What food do you like?', 'Do you cook at home?', 'What did you eat yesterday?', 'Are there any foods you do not like?'], 'Describe a meal you enjoyed recently.', ['where you had it', 'who you had it with', 'what you ate'], 'and explain why you enjoyed it.'),
  mock(4, 'Work and a decision', ['Do you work or study?', 'What do you like about it?', 'Would you like to change it in the future?', 'What do you do after work or class?'], 'Describe a decision that changed your life.', ['what the decision was', 'when you made it', 'what happened after it'], 'and explain why it was important.'),
  mock(5, 'Free time and a skill', ['What do you do in your free time?', 'Did you have the same hobbies as a child?', 'Do you prefer to relax at home or go out?', 'Is there a hobby you would like to try?'], 'Describe a skill you would like to learn.', ['what the skill is', 'why you want to learn it', 'how you would learn it'], 'and explain how it would help you.'),
  mock(6, 'Technology and a gift', ['How often do you use your phone?', 'What do you use it for?', 'Do you think people spend too much time on their phones?', 'Did you use technology a lot as a child?'], 'Describe a gift you gave to someone.', ['who you gave it to', 'what it was', 'why you chose it'], 'and explain how the person felt.'),

  line(1, 'Households with internet', 'The graph below shows the percentage of households with internet in urban and rural areas between 2005 and 2020.', 'per cent of households', ['2005', '2010', '2015', '2020'], [{ name: 'Urban', values: [48, 70, 88, 97] }, { name: 'Rural', values: [22, 45, 68, 85] }]),
  line(2, 'Cinema visitors', 'The graph below shows the number of visitors to cinemas and to theatres in a city between 2000 and 2020.', 'thousand visitors', ['2000', '2005', '2010', '2015', '2020'], [{ name: 'Cinemas', values: [80, 95, 110, 100, 70] }, { name: 'Theatres', values: [40, 42, 38, 45, 52] }]),
  line(3, 'Petrol and electric cars sold', 'The graph below shows the number of petrol and electric cars sold in a country between 2010 and 2022.', 'thousand cars', ['2010', '2014', '2018', '2022'], [{ name: 'Petrol', values: [900, 880, 760, 520] }, { name: 'Electric', values: [10, 40, 150, 480] }]),
  line(4, 'Average temperature', 'The graph below shows the average monthly temperature in two cities during one year.', 'degrees Celsius', ['Jan', 'Apr', 'Jul', 'Oct'], [{ name: 'City A', values: [4, 12, 24, 13] }, { name: 'City B', values: [18, 24, 29, 25] }]),
  line(5, 'Library members', 'The graph below shows the number of members of two libraries between 1995 and 2020.', 'hundreds of members', ['1995', '2000', '2005', '2010', '2015', '2020'], [{ name: 'Central Library', values: [50, 62, 70, 66, 58, 51] }, { name: 'University Library', values: [20, 28, 36, 47, 60, 72] }]),
  line(6, 'Online and shop sales', 'The graph below shows the percentage of goods bought online and in shops in a country between 2008 and 2020.', 'per cent of sales', ['2008', '2012', '2016', '2020'], [{ name: 'Online', values: [5, 12, 25, 41] }, { name: 'In shops', values: [95, 88, 75, 59] }]),

  essay('w-opinion', 1, 'English at primary school', 'Some people think children should start learning English at primary school. To what extent do you agree or disagree?'),
  essay('w-opinion', 2, 'Homework', 'Some people believe that schools should not give homework to students. To what extent do you agree or disagree?'),
  essay('w-opinion', 3, 'Public libraries', 'Some people think that public libraries are no longer needed because of the internet. To what extent do you agree or disagree?'),
  essay('w-opinion', 4, 'Cycling to work', 'Some people say that governments should encourage everyone to cycle to work. To what extent do you agree or disagree?'),
  essay('w-opinion', 5, 'Healthy food', 'Some people believe that unhealthy food should be taxed. To what extent do you agree or disagree?'),
  essay('w-opinion', 6, 'Learning from mistakes', 'Some people think that people learn more from their mistakes than from their successes. To what extent do you agree or disagree?'),

  essay('w-advdis', 1, 'Working from home', 'More and more people work from home. Do the advantages of this development outweigh the disadvantages?'),
  essay('w-advdis', 2, 'Studying abroad', 'More students choose to study at a university in another country. What are the advantages and disadvantages of this?'),
  essay('w-advdis', 3, 'Online shopping', 'Many people now prefer to buy things online. What are the advantages and disadvantages of this trend?'),
  essay('w-advdis', 4, 'Living in a big city', 'More people are moving to big cities. Do the advantages of this outweigh the disadvantages?'),
  essay('w-advdis', 5, 'Social media', 'Many young people use social media every day. What are the advantages and disadvantages?'),
  essay('w-advdis', 6, 'Tourism', 'Tourism is increasing in many countries. Do the benefits of tourism outweigh the problems?'),

  full(1, 'Home and a person', ['Where do you live?', 'What do you like about your home?', 'Do you plan to move in the future?'], 'Describe a person in your family.', ['who this person is', 'what he or she looks like', 'what you do together'], 'and explain why you like spending time with this person.', ['How have family relationships changed in recent years?', 'Why do some young people prefer to live alone?', 'Do you think families will be smaller in the future?']),
  full(2, 'Travel', ['How do you usually travel to work or school?', 'Do you like travelling by train?', 'What would improve transport in your city?'], 'Describe a place you visited on holiday.', ['where it was', 'when you went', 'what you did there'], 'and explain why you remember it.', ['Why do people like travelling?', 'Is travelling abroad better than travelling in your own country?', 'How might tourism change in the future?']),
  full(3, 'Technology', ['How often do you use your phone?', 'What do you use it for?', 'Did you use technology a lot as a child?'], 'Describe a useful piece of technology you own.', ['what it is', 'how you got it', 'how you use it'], 'and explain why it is useful.', ['How has technology changed the way people communicate?', 'Do older people find technology harder to use? Why?', 'Is technology making people less sociable?']),
  full(4, 'Study and helping', ['Do you work or study?', 'Why did you choose that job or subject?', 'Would you like to change it in the future?'], 'Describe a time when you helped someone.', ['who you helped', 'what the problem was', 'how you helped'], 'and explain how you felt afterwards.', ['Why do some people find it hard to ask for help?', 'Should schools teach students to help others?', 'Do people help each other less than in the past?']),
  full(5, 'Free time and food', ['What do you do in your free time?', 'Do you cook at home?', 'What did you eat yesterday?'], 'Describe a meal you enjoyed recently.', ['where you had it', 'who you had it with', 'what you ate'], 'and explain why you enjoyed it.', ['Why do people eat differently in different countries?', 'Is it better to eat at home or in restaurants?', 'How will food change in the future?']),
  full(6, 'Environment', ['What is the weather like in your hometown?', 'Do you like your city?', 'Is there a park near your home?'], 'Describe a place in nature that you like.', ['where it is', 'how you got there', 'what you can do there'], 'and explain why you like it.', ['Why is it important to protect nature?', 'Who is responsible for the environment, people or governments?', 'How could cities become greener?']),
];

const SCHEMAS = { 'writing-prompt': writingPrompt, 'speaking-ielts': speakingIeltsGate } as const;

/** Validates a group against the schema of its kind */
export const parseStaticGroup = (group: StaticGroup) => SCHEMAS[group.kind].parse(group.payload);

/**
 * Upserts every written practice group (startup)
 * @throws Error when a group does not match its schema (a programming error)
 */
export async function ensurePracticeContent(): Promise<void> {
  for (const group of STATIC_GROUPS) {
    const payload = parseStaticGroup(group);
    const title = contentTitle(group.kind, payload);
    await db
      .insert(contentItems)
      .values({ id: group.id, kind: group.kind, skill: group.skill, exam: 'ielts', part: `path:${group.type}`, level: group.level, language: 'en', title, topic: group.topic, payload, source: 'builtin', status: 'archived' })
      .onConflictDoUpdate({ target: contentItems.id, set: { title, payload, level: group.level, part: `path:${group.type}`, status: sql`'archived'` } });
  }
}
