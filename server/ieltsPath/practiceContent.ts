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


type Series = { name: string; values: number[] };
const pieChart = (title: string, categories: string[], values: number[]) => ({ type: 'pie' as const, title, unit: 'per cent', categories, series: [{ name: title, values }] as Series[] });

const T1_INSTRUCTIONS = 'You should spend about 20 minutes on this task. Write at least 150 words. Describe the main features and make comparisons: do not give opinions.';
const T1_ASK = 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant.';

const pie = (n: number, title: string, prompt: string, chart: ReturnType<typeof pieChart>, extraChart: ReturnType<typeof pieChart> | { type: 'bar'; title: string; unit: string; categories: string[]; series: Series[] }): StaticGroup => ({
  id: `ip-w-pie-${n}`,
  type: 'w-pie',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task1', title, instructions: T1_INSTRUCTIONS, prompt: `${prompt} ${T1_ASK}`, minWords: 150, timeMinutes: 20, chart, extraChart },
});

const process_ = (n: number, title: string, prompt: string, steps: { label: string; detail?: string }[]): StaticGroup => ({
  id: `ip-w-process-${n}`,
  type: 'w-process',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task1', title, instructions: 'You should spend about 20 minutes on this task. Write at least 150 words. Describe the stages in order: do not give opinions.', prompt: `${prompt} Summarise the information by selecting and reporting the main features.`, minWords: 150, timeMinutes: 20, diagram: { kind: 'process' as const, title, steps } },
});

/** A map from rows of labels: '' is an empty cell */
const grid = (label: string, rows: string[][]) => ({ label, cells: rows.flatMap((row, r) => row.flatMap((text, c) => (text ? [{ col: c, row: r, text }] : []))) });
const map = (n: number, title: string, prompt: string, before: ReturnType<typeof grid>, after: ReturnType<typeof grid>): StaticGroup => ({
  id: `ip-w-map-${n}`,
  type: 'w-map',
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task1', title, instructions: 'You should spend about 20 minutes on this task. Write at least 150 words. Describe the main changes and compare the two maps: do not give opinions.', prompt: `${prompt} Summarise the information by selecting and reporting the main features, and make comparisons where relevant.`, minWords: 150, timeMinutes: 20, diagram: { kind: 'map' as const, title, cols: before.cells.reduce((m, c) => Math.max(m, c.col + 1), 0) > 7 ? 8 : 7, rows: 4, before, after } },
});

const task2b = (type: 'w-discuss' | 'w-problem' | 'w-twopart', n: number, title: string, prompt: string): StaticGroup => ({
  id: `ip-${type}-${n}`,
  type,
  kind: 'writing-prompt',
  skill: 'writing',
  level: 'B1',
  topic: title,
  payload: { taskType: 'ielts-task2', title, instructions: 'You should spend about 40 minutes on this task. Write at least 250 words. Plan for five minutes, then write four paragraphs.', prompt, minWords: 250, timeMinutes: 40 },
});

const cueCard = (n: number, topic: string, card: string, bullets: string[], closing: string): StaticGroup => ({
  id: `ip-s-part2-${n}`,
  type: 's-part2',
  kind: 'speaking-ielts',
  skill: 'speaking',
  level: 'B1',
  topic,
  payload: { topic, part1: [`Do you like talking about ${topic.toLowerCase()}?`, 'Why or why not?'], part2: { cueCard: card, bullets, closing }, part3: [] },
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

  pie(1, 'Household spending', 'The pie charts below show how an average household spent its money in 1990 and in 2020.', pieChart('Household spending, 1990', ['Housing', 'Food', 'Transport', 'Leisure', 'Other'], [30, 35, 12, 8, 15]), pieChart('Household spending, 2020', ['Housing', 'Food', 'Transport', 'Leisure', 'Other'], [38, 20, 15, 17, 10])),
  pie(2, 'Sources of energy', 'The pie charts below show the sources of energy in one country in 2000 and in 2020.', pieChart('Energy sources, 2000', ['Coal', 'Gas', 'Nuclear', 'Renewables'], [45, 30, 15, 10]), pieChart('Energy sources, 2020', ['Coal', 'Gas', 'Nuclear', 'Renewables'], [20, 30, 12, 38])),
  pie(3, 'How students travel to school', 'The pie chart shows how students in one city travel to school, and the bar chart shows how far they live from school.', pieChart('Travel to school', ['Bus', 'Walking', 'Car', 'Bicycle', 'Train'], [38, 25, 20, 10, 7]), { type: 'bar', title: 'Distance from school', unit: 'per cent of students', categories: ['Under 1 km', '1-3 km', '3-5 km', 'Over 5 km'], series: [{ name: 'Students', values: [22, 35, 25, 18] }] }),
  pie(4, 'Where visitors come from', 'The pie charts below show where visitors to a museum came from in 2005 and in 2022.', pieChart('Visitors, 2005', ['Local', 'Other regions', 'Abroad'], [55, 30, 15]), pieChart('Visitors, 2022', ['Local', 'Other regions', 'Abroad'], [32, 28, 40])),
  pie(5, 'Use of free time', 'The pie charts below show how teenagers and adults in one country spend their free time.', pieChart('Teenagers', ['Online', 'Sport', 'Friends', 'Reading', 'TV'], [40, 20, 20, 5, 15]), pieChart('Adults', ['Online', 'Sport', 'Friends', 'Reading', 'TV'], [22, 15, 18, 15, 30])),
  pie(6, 'Waste and how it is dealt with', 'The pie chart shows what a city threw away in 2021, and the bar chart shows how the waste was treated.', pieChart('Waste by type', ['Food', 'Paper', 'Plastic', 'Glass', 'Other'], [30, 25, 20, 10, 15]), { type: 'bar', title: 'Waste treatment', unit: 'per cent of waste', categories: ['Recycled', 'Burned', 'Buried'], series: [{ name: '2021', values: [35, 25, 40] }] }),

  process_(1, 'Making recycled paper', 'The diagram below shows how recycled paper is made.', [{ label: 'Waste paper is collected', detail: 'from homes and offices' }, { label: 'The paper is sorted', detail: 'by type and colour' }, { label: 'It is mixed with water', detail: 'to make a thick pulp' }, { label: 'The pulp is cleaned', detail: 'ink and glue are removed' }, { label: 'The pulp is pressed into sheets' }, { label: 'The sheets are dried and rolled' }, { label: 'The paper is cut and packed' }]),
  process_(2, 'Producing chocolate', 'The diagram below shows how chocolate is produced from cocoa beans.', [{ label: 'Cocoa beans are picked' }, { label: 'The beans are dried in the sun', detail: 'for about a week' }, { label: 'They are sent to a factory' }, { label: 'The beans are roasted' }, { label: 'They are ground into a paste' }, { label: 'Sugar and milk are added' }, { label: 'The mixture is heated and cooled' }, { label: 'It is poured into moulds and wrapped' }]),
  process_(3, 'Treating drinking water', 'The diagram below shows how water is made safe to drink in a treatment plant.', [{ label: 'Water is taken from a river' }, { label: 'Large objects are removed by a screen' }, { label: 'Chemicals are added', detail: 'so that small particles stick together' }, { label: 'The water rests in a tank', detail: 'and the particles sink' }, { label: 'It passes through sand filters' }, { label: 'Chlorine is added to kill germs' }, { label: 'Clean water is stored and sent to homes' }]),
  process_(4, 'Making bricks', 'The diagram below shows how bricks are made.', [{ label: 'Clay is dug from the ground' }, { label: 'It is crushed and mixed with water' }, { label: 'The clay is shaped in moulds' }, { label: 'The bricks are dried', detail: 'for 24 hours' }, { label: 'They are baked in a very hot oven' }, { label: 'The bricks are cooled' }, { label: 'They are packed and delivered' }]),
  process_(5, 'Solar electricity', 'The diagram below shows how electricity is made from sunlight in a home.', [{ label: 'Sunlight hits the solar panels' }, { label: 'The panels make direct current' }, { label: 'An inverter changes it to alternating current' }, { label: 'The electricity goes to the house' }, { label: 'Extra electricity is stored in a battery' }, { label: 'Any surplus is sent to the grid' }]),

  map(1, 'The town centre', 'The maps below show the centre of a town in 2005 and now.', grid('2005', [['Farm', 'Farm', '', 'Road', 'Houses', 'Houses', 'Houses'], ['Farm', 'Farm', '', 'Road', 'School', '', 'Shop'], ['Park', 'Park', '', 'Road', 'Houses', '', 'Cafe'], ['Park', 'Park', '', 'Road', '', 'Station', '']]), grid('Now', [['Offices', 'Offices', '', 'Road', 'Houses', 'Houses', 'Houses'], ['Offices', 'Offices', '', 'Road', 'School', 'Library', 'Shop'], ['Park', 'Park', '', 'Road', 'Houses', '', 'Cafe'], ['Car park', 'Car park', '', 'Road', '', 'Station', 'Bus stop']])),
  map(2, 'A school', 'The maps below show a school before and after it was rebuilt.', grid('Before', [['Field', 'Field', 'Field', '', 'Gate', '', ''], ['Field', 'Field', 'Field', '', 'Hall', 'Hall', 'Library'], ['Field', 'Field', 'Field', '', 'Classes', 'Classes', 'Classes'], ['Car park', 'Car park', '', '', 'Classes', 'Classes', 'Classes']]), grid('After', [['Field', 'Field', 'Pool', '', 'Gate', '', ''], ['Field', 'Field', 'Pool', '', 'Hall', 'Hall', 'Library'], ['Field', 'Field', 'Gym', '', 'Classes', 'Classes', 'Cafe'], ['Garden', 'Garden', 'Gym', '', 'Classes', 'Classes', 'Classes']])),
  map(3, 'A village by a river', 'The maps below show a village in 1990 and today.', grid('1990', [['River', 'River', 'River', 'River', 'River', 'River', 'River'], ['Bridge', '', 'Farm', 'Farm', '', 'Houses', 'Houses'], ['Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road'], ['Pub', '', 'Shop', '', 'Church', '', 'Houses']]), grid('Today', [['River', 'River', 'River', 'River', 'River', 'River', 'River'], ['Bridge', 'Cafe', 'Houses', 'Houses', 'Houses', 'Houses', 'Houses'], ['Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road'], ['Hotel', '', 'Shop', 'Car park', 'Church', '', 'Houses']])),
  map(4, 'A harbour', 'The maps below show a harbour area in 2000 and in 2022.', grid('2000', [['Sea', 'Sea', 'Sea', 'Sea', 'Sea', 'Sea', 'Sea'], ['Pier', 'Pier', '', 'Boats', 'Boats', '', 'Fish market'], ['Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road'], ['Factory', 'Factory', '', 'Houses', 'Houses', '', 'Warehouse']]), grid('2022', [['Sea', 'Sea', 'Sea', 'Sea', 'Sea', 'Sea', 'Sea'], ['Pier', 'Pier', 'Cafes', 'Marina', 'Marina', '', 'Museum'], ['Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road'], ['Flats', 'Flats', '', 'Houses', 'Houses', '', 'Car park']])),

  task2b('w-discuss', 1, 'University for everyone', 'Some people think university education should be free for everyone. Others think students should pay for it. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 2, 'Children and technology', 'Some people believe children should have a phone from a young age. Others think they should wait until they are older. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 3, 'Travel', 'Some people prefer to travel in a group on an organised tour. Others prefer to travel alone. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 4, 'Old buildings', 'Some people think old buildings should be kept. Others believe they should be replaced by modern ones. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 5, 'Sport', 'Some people think professional athletes earn too much money. Others believe they deserve it. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 6, 'Working hours', 'Some people think a four-day working week would be good for everyone. Others disagree. Discuss both views and give your own opinion.'),
  task2b('w-problem', 1, 'Traffic', 'Traffic is a serious problem in many cities. What are the causes of this, and what can be done about it?'),
  task2b('w-problem', 2, 'Obesity', 'More and more people in the world are overweight. What problems does this cause, and what can be done about it?'),
  task2b('w-problem', 3, 'Plastic waste', 'Plastic waste is polluting the oceans. What are the main causes, and what measures could solve the problem?'),
  task2b('w-problem', 4, 'Young people and the news', 'Many young people do not follow the news. Why is this, and what could be done to change it?'),
  task2b('w-problem', 5, 'Loneliness', 'Many people in big cities feel lonely. What are the reasons, and how can cities help?'),
  task2b('w-problem', 6, 'Noise', 'Noise is a growing problem in modern cities. What problems does it cause, and what can be done to reduce it?'),
  task2b('w-twopart', 1, 'Fewer young farmers', 'In many countries fewer young people want to work in farming. Why is this happening? Is it a positive or a negative development?'),
  task2b('w-twopart', 2, 'Learning languages online', 'More people learn languages online than in classrooms. Why is this? Do you think it is a good development?'),
  task2b('w-twopart', 3, 'Working abroad', 'Many people choose to work in another country. What are the reasons? Does this benefit the country they leave?'),
  task2b('w-twopart', 4, 'Reading for pleasure', 'People read less for pleasure than in the past. Why is this? Is it a problem?'),
  task2b('w-twopart', 5, 'Fast food', 'Fast food is more popular than ever. Why is this? Is it a positive or a negative trend?'),

  cueCard(7, 'A book', 'Describe a book you have read and liked.', ['what the book was', 'when you read it', 'what it was about'], 'and explain why you liked it.'),
  cueCard(8, 'A teacher', 'Describe a teacher who helped you.', ['who this person was', 'what he or she taught you', 'how he or she helped'], 'and explain why this teacher was important to you.'),
  cueCard(9, 'A celebration', 'Describe a celebration you enjoyed.', ['what the celebration was', 'who you were with', 'what you did'], 'and explain why you enjoyed it.'),
  cueCard(10, 'A website', 'Describe a website you often use.', ['what it is', 'how you found it', 'what you use it for'], 'and explain why you like it.'),

  full(7, 'Books and reading', ['Do you like reading?', 'What kind of books do you read?', 'Do you prefer paper books or e-books?'], 'Describe a book you have read and liked.', ['what the book was', 'when you read it', 'what it was about'], 'and explain why you liked it.', ['Why do some people read less than they used to?', 'Are paper books better than e-books? Why?', 'How might reading change in the future?']),
  full(8, 'Teachers and learning', ['Do you work or study?', 'Who helps you most when you study?', 'Do you prefer to study alone or with others?'], 'Describe a teacher who helped you.', ['who this person was', 'what he or she taught you', 'how he or she helped'], 'and explain why this teacher was important to you.', ['What makes a good teacher?', 'Is it better to learn from a teacher or from the internet?', 'How might schools change in the next twenty years?']),
  full(9, 'Celebrations', ['Do you like celebrations?', 'How do people celebrate in your country?', 'What did you do on your last birthday?'], 'Describe a celebration you enjoyed.', ['what the celebration was', 'who you were with', 'what you did'], 'and explain why you enjoyed it.', ['Why are celebrations important to people?', 'Are traditional celebrations changing? How?', 'Do big celebrations cost too much money?']),
  full(10, 'Websites', ['How often do you use the internet?', 'What websites do you visit most?', 'Do you shop online?'], 'Describe a website you often use.', ['what it is', 'how you found it', 'what you use it for'], 'and explain why you like it.', ['What are the advantages and disadvantages of getting information online?', 'Do you think the internet is changing the way people think?', 'Should children have limits on internet use?']),
  full(11, 'Cities', ['Do you live in a city?', 'What do you like about your area?', 'Would you like to live somewhere else?'], 'Describe a city you would like to visit.', ['where it is', 'what you know about it', 'what you would do there'], 'and explain why you want to go.', ['Why do people move to big cities?', 'Compare life in a city and in a village.', 'How will cities be different in the future?']),
  full(12, 'Health', ['Do you do any exercise?', 'What do you do to stay healthy?', 'Did you play sport as a child?'], 'Describe a time when you were ill.', ['when it was', 'what was wrong', 'what you did'], 'and explain how you felt.', ['Why do some people not take care of their health?', 'Who should be responsible for people’s health, the government or the individual?', 'How could healthcare improve in the future?']),

  // Phase 4 (weeks 13-16): more academic topics, Part 3 questions that ask for concession and comparison
  essay('w-opinion', 7, 'Space research', 'Some people think that governments should spend money on space research. Others believe the money would be better spent on problems on Earth. To what extent do you agree or disagree?'),
  essay('w-opinion', 8, 'Art in schools', 'Some people believe that subjects such as art and music should be optional at secondary school, so students can focus on science and mathematics. To what extent do you agree or disagree?'),
  line(7, 'Energy use by sector', 'The graph below shows energy consumption in three sectors of one country between 1980 and 2020.', 'million tonnes, oil equiv.', ['1980', '1990', '2000', '2010', '2020'], [{ name: 'Industry', values: [52, 55, 50, 44, 40] }, { name: 'Transport', values: [30, 38, 46, 52, 55] }, { name: 'Homes', values: [28, 31, 34, 36, 35] }]),
  line(8, 'Three ways of getting news', 'The graph below shows the percentage of adults who got their news mainly from television, newspapers and the internet between 2005 and 2025.', 'per cent of adults', ['2005', '2010', '2015', '2020', '2025'], [{ name: 'Television', values: [62, 58, 50, 42, 35] }, { name: 'Newspapers', values: [30, 24, 16, 10, 6] }, { name: 'Internet', values: [8, 18, 34, 48, 59] }]),
  pie(7, 'University funding', 'The pie charts below show the sources of funding for a university in 2000 and in 2020.', pieChart('Funding, 2000', ['Government', 'Tuition fees', 'Research grants', 'Donations'], [60, 20, 15, 5]), pieChart('Funding, 2020', ['Government', 'Tuition fees', 'Research grants', 'Donations'], [35, 40, 18, 7])),
  pie(8, 'Water use and the growth of a city', 'The pie chart below shows how water was used in a city in 2020, and the bar chart shows the city’s population between 1990 and 2020.', pieChart('Water use, 2020', ['Homes', 'Industry', 'Farming', 'Public services'], [42, 28, 22, 8]), { type: 'bar', title: 'Population', unit: 'thousand people', categories: ['1990', '2000', '2010', '2020'], series: [{ name: 'Population', values: [310, 380, 470, 560] }] }),
  process_(6, 'Generating electricity from waste', 'The diagram below shows how household waste is used to produce electricity.', [
    { label: 'Collection', detail: 'rubbish lorries bring household waste to the plant' },
    { label: 'Sorting', detail: 'metal and glass are removed for recycling' },
    { label: 'Burning', detail: 'the remaining waste is burnt at over 850 °C' },
    { label: 'Boiler', detail: 'the heat turns water into high-pressure steam' },
    { label: 'Turbine', detail: 'steam drives a turbine connected to a generator' },
    { label: 'Grid', detail: 'electricity is sent to homes; ash is used in road building' },
  ]),
  map(5, 'A university campus', 'The maps below show a university campus in 2005 and today.',
    grid('2005', [['Library', '', 'Car park', '', '', 'Playing fields', ''], ['', '', '', 'Main road', '', '', ''], ['Science block', '', 'Canteen', '', 'Lecture hall', '', ''], ['', '', '', '', '', 'Woodland', '']]),
    grid('Today', [['Library', 'Study centre', 'Bus stop', '', '', 'Sports hall', 'Playing fields'], ['', '', '', 'Main road', '', '', ''], ['Science block', 'Lab extension', 'Canteen', 'Student housing', 'Lecture hall', '', ''], ['Car park', '', '', '', '', 'Woodland', '']])),
  task2b('w-discuss', 7, 'Experience or qualifications', 'Some people think that work experience is more important than qualifications when applying for a job. Others believe that qualifications matter more. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 8, 'Online learning', 'Some people believe that online courses are as effective as classroom teaching. Others think that learning in a classroom is better. Discuss both views and give your own opinion.'),
  task2b('w-problem', 7, 'Water shortages', 'Many parts of the world are facing water shortages. What are the causes of this problem, and what measures could be taken to deal with it?'),
  task2b('w-twopart', 6, 'Working longer', 'In many countries people are now working until they are older than in the past. Why is this happening? Is it a positive or negative development?'),
  task2b('w-twopart', 7, 'Historic sites', 'Some historic buildings and sites are visited by millions of tourists each year. What problems does this cause? What could be done to protect these places?'),
  cueCard(11, 'A decision', 'Describe an important decision you made.', ['what the decision was', 'why you had to make it', 'how you made it'], 'and explain whether it was a good decision.'),
  cueCard(12, 'A skill', 'Describe a skill that took you a long time to learn.', ['what the skill is', 'how you learnt it', 'who helped you'], 'and explain why it was difficult to learn.'),
  cueCard(13, 'A change', 'Describe a change that improved your life.', ['what the change was', 'when it happened', 'what caused it'], 'and explain how it improved your life.'),
  part1(11, 'Science', ['Did you enjoy science at school?', 'Do you read about science or technology?', 'What scientific subject would you like to know more about?']),
  part1(12, 'Nature', ['Do you spend much time outdoors?', 'Is there a park or green space near your home?', 'Did you like being in nature as a child?']),
  full(13, 'Work and experience', ['What job would you like to do in the future?', 'Is it easy to find a good job where you live?', 'Do you think experience matters more than qualifications?'], 'Describe an important decision you made.', ['what the decision was', 'why you had to make it', 'how you made it'], 'and explain whether it was a good decision.', ['Why do some people find it hard to make decisions?', 'Should young people make big decisions on their own, or with their families?', 'Do you think people make better decisions as they get older?']),
  full(14, 'Learning a skill', ['What skills are you learning at the moment?', 'Do you prefer learning from a book or by doing?', 'Which skill would you like to learn next?'], 'Describe a skill that took you a long time to learn.', ['what the skill is', 'how you learnt it', 'who helped you'], 'and explain why it was difficult to learn.', ['Which skills will be most useful in twenty years?', 'Is it better to learn a skill at school or at work?', 'Some people say talent matters more than practice. Would you agree?']),
  full(15, 'Change', ['Has your home town changed much in recent years?', 'Do you like trying new things?', 'What would you change about your daily routine?'], 'Describe a change that improved your life.', ['what the change was', 'when it happened', 'what caused it'], 'and explain how it improved your life.', ['Why do some people dislike change?', 'Do you think technology changes lives for the better, or does it have drawbacks too?', 'What changes do you expect in your country in the next decade?']),
  full(16, 'Science and research', ['Did you enjoy science at school?', 'Do you read about science or technology?', 'What scientific subject would you like to know more about?'], 'Describe a scientific discovery or invention that you think is important.', ['what it is', 'how you learnt about it', 'how it affects people’s lives'], 'and explain why you think it is important.', ['Should governments spend money on space research, or on problems on Earth?', 'Is it the job of scientists to explain their work to the public?', 'How can schools get more young people interested in science?']),
  full(17, 'Nature and the environment', ['Do you spend much time outdoors?', 'Is there a park or green space near your home?', 'Did you like being in nature as a child?'], 'Describe a natural place you have visited.', ['where it is', 'when you went there', 'what you saw and did'], 'and explain how you felt about the place.', ['Why do some people prefer cities to the countryside?', 'Should wild areas be protected even if that limits tourism?', 'To what extent is protecting the environment the responsibility of individuals rather than governments?']),
  full(18, 'Media and information', ['How do you usually get the news?', 'Do you trust what you read online?', 'Did your family read newspapers when you were a child?'], 'Describe a piece of news that interested you.', ['what the news was', 'how you heard about it', 'who you discussed it with'], 'and explain why it interested you.', ['Why has newspaper reading declined?', 'Is it a problem that people get news from social media? Why or why not?', 'How might the way people get news change in the future?']),

  // Phase 5 (weeks 17-20): society, the economy and science; Part 3 questions that need four to six sentences
  essay('w-opinion', 9, 'Ageing populations', 'In many countries the proportion of older people is increasing. Some people think this will cause serious problems for society, while others believe it brings benefits. To what extent do you agree that an ageing population is a problem?'),
  essay('w-opinion', 10, 'Unpaid work', 'Some people believe that unpaid community work should be a compulsory part of secondary school education. To what extent do you agree or disagree?'),
  essay('w-advdis', 7, 'Automation', 'Machines and software now do many jobs that people used to do. Do the advantages of this development outweigh the disadvantages?'),
  line(9, 'Spending on research', 'The graph below shows government spending on scientific research in three countries between 1995 and 2020, as a percentage of national income.', 'per cent of national income', ['1995', '2000', '2005', '2010', '2015', '2020'], [{ name: 'Country A', values: [1.8, 2.0, 2.3, 2.6, 2.9, 3.1] }, { name: 'Country B', values: [2.5, 2.4, 2.2, 2.1, 2.0, 1.9] }, { name: 'Country C', values: [0.6, 0.9, 1.3, 1.8, 2.4, 2.8] }]),
  pie(9, 'Employment by sector', 'The pie charts below show the share of employment in four sectors of one country in 1970 and in 2020.', pieChart('Employment, 1970', ['Agriculture', 'Manufacturing', 'Services', 'Public sector'], [32, 35, 23, 10]), pieChart('Employment, 2020', ['Agriculture', 'Manufacturing', 'Services', 'Public sector'], [4, 18, 62, 16])),
  process_(7, 'Vaccine production', 'The diagram below shows the main stages in producing a vaccine.', [
    { label: 'Research', detail: 'the virus is studied and a harmless part of it is chosen' },
    { label: 'Cell culture', detail: 'the chosen part is grown in large tanks of cells' },
    { label: 'Purification', detail: 'the product is filtered to remove cells and waste' },
    { label: 'Testing', detail: 'samples are checked for safety and strength' },
    { label: 'Filling', detail: 'the vaccine is put into glass vials and sealed' },
    { label: 'Distribution', detail: 'vials are kept cold and shipped to clinics' },
  ]),
  map(6, 'An industrial site', 'The maps below show an industrial area by a river in 1990 and today.',
    grid('1990', [['Factory', 'Factory', 'Warehouse', '', 'River', '', ''], ['Railway', 'Railway', 'Railway', '', 'River', '', ''], ['Workers’ housing', '', 'Car park', '', 'River', 'Farmland', ''], ['', '', '', '', 'River', '', '']]),
    grid('Today', [['Offices', 'Apartments', 'Museum', 'Park', 'River', 'Footbridge', 'Nature reserve'], ['Tram line', 'Tram line', 'Tram line', 'Park', 'River', '', ''], ['Apartments', 'Shops', 'Car park', 'Cycle path', 'River', 'Nature reserve', ''], ['', 'School', '', 'Cycle path', 'River', '', '']])),
  task2b('w-discuss', 9, 'Economic growth and the environment', 'Some people believe that economic growth is the best way to improve people’s lives. Others think that protecting the environment should come first, even if this slows growth. Discuss both views and give your own opinion.'),
  task2b('w-discuss', 10, 'Scientific research', 'Some people think scientific research should be funded by governments, while others believe private companies should pay for it. Discuss both views and give your own opinion.'),
  task2b('w-problem', 8, 'Inequality', 'In many countries the gap between rich and poor is growing. What problems does this cause, and what measures could governments take to reduce it?'),
  task2b('w-twopart', 8, 'Living longer', 'People today are living longer than ever before. What are the reasons for this? What effects does it have on society?'),
  part1(13, 'Money', ['Did you receive pocket money as a child?', 'Do you prefer to save or to spend?', 'Is it easy to manage money where you live?']),
  part1(14, 'Society', ['Do you know your neighbours well?', 'Do people in your country volunteer much?', 'Has your community changed in recent years?']),
  cueCard(14, 'A law', 'Describe a law or rule in your country that you think is good.', ['what the law is', 'how you learnt about it', 'who it affects'], 'and explain why you think it is good.'),
  cueCard(15, 'A business', 'Describe a successful small business you know.', ['what the business is', 'who runs it', 'what it sells or does'], 'and explain why you think it is successful.'),
  cueCard(16, 'A discovery', 'Describe something you learnt recently that surprised you.', ['what it was', 'how you learnt it', 'who you told about it'], 'and explain why it surprised you.'),
  full(19, 'Money and the economy', ['Did you receive pocket money as a child?', 'Do you prefer to save or to spend?', 'Is it easy to manage money where you live?'], 'Describe a successful small business you know.', ['what the business is', 'who runs it', 'what it sells or does'], 'and explain why you think it is successful.', ['Why do some small businesses succeed where others fail?', 'Should governments support small businesses more than large companies? Why?', 'How has shopping online changed small businesses in your country?']),
  full(20, 'Laws and society', ['Do you know your neighbours well?', 'Do people in your country volunteer much?', 'Has your community changed in recent years?'], 'Describe a law or rule in your country that you think is good.', ['what the law is', 'how you learnt about it', 'who it affects'], 'and explain why you think it is good.', ['Why do some people break rules even when they agree with them?', 'Is it better to punish or to educate people who break the law?', 'Should some laws be the same in every country? Which ones?']),
  full(21, 'Science and discovery', ['Do you enjoy learning about how things work?', 'What was your favourite subject at school?', 'Do you watch or read anything about science?'], 'Describe something you learnt recently that surprised you.', ['what it was', 'how you learnt it', 'who you told about it'], 'and explain why it surprised you.', ['Why do many people trust science less than they used to?', 'Should scientists be free to research anything, or should there be limits?', 'How could schools make science more interesting?']),
  full(22, 'Work and automation', ['What do you do, and do you enjoy it?', 'Would you like to work fewer hours?', 'Do you think your job could be done by a machine?'], 'Describe a job you would not like to do.', ['what the job is', 'what the work involves', 'what skills it needs'], 'and explain why you would not like to do it.', ['Which jobs are most likely to be done by machines in the future?', 'Should governments pay people whose jobs are replaced by technology?', 'Is a job only about money, or does it give people something else?']),
  full(23, 'Cities and growth', ['Is your city growing?', 'What is the biggest change you have seen where you live?', 'Do you prefer old or new buildings?'], 'Describe a change you would like to see in your city.', ['what the change is', 'why it is needed', 'who would benefit'], 'and explain how it could be achieved.', ['Why do cities keep growing even when life there is expensive?', 'Should governments limit the size of cities?', 'What will the cities of the future look like?']),
  full(24, 'Health and ageing', ['Do you think you have a healthy lifestyle?', 'Do you spend time with older relatives?', 'Would you like to live to be a hundred?'], 'Describe an older person you admire.', ['who the person is', 'how you know them', 'what they have done'], 'and explain why you admire them.', ['What problems does an ageing population cause for a country?', 'Should families or the state care for the elderly?', 'How will medicine change the way people age?']),
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
