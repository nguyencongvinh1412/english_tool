/**
 * Gate content: fixed IELTS-style groups for each gate, stored as content items with status "archived" so they never
 * appear in the practice library or the random test bank (exam sessions still load them by id).
 *
 * Gate 0 (placement): Listening Section 1 (easy) + Section 3 (harder), two reading passages (B1 and B2), the writing
 * and speaking tasks of the gate test book. Listening and reading are written for this app (original content).
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { contentItems } from '../db/schema.js';
import { contentTitle, speakingIeltsGate, writingPrompt } from '../content/schemas.js';
import { pathListening, pathReading, type PoolType } from './practice.js';
import { GATE_LR_GROUPS, GATE_WS_GROUPS } from './gateData.js';
import type { PathSkill } from './bands.js';

export interface GateGroup {
  id: string;
  kind: 'ielts-listening' | 'ielts-reading' | 'writing-prompt' | 'speaking-ielts';
  skill: PathSkill;
  level: string;
  payload: unknown;
}

const gap = (prompt: string, answers: string[], explanation: string, wordLimit = 1) => ({ type: 'gap' as const, prompt, answers, wordLimit, explanation });
const mcq = (prompt: string, options: string[], answerIndex: number, explanation: string) => ({ type: 'mcq' as const, prompt, options, answerIndex, explanation });
const tfng = (prompt: string, answer: 'true' | 'false' | 'not_given', explanation: string) => ({ type: 'tfng' as const, prompt, answer, explanation });

const GATE0_GROUPS: GateGroup[] = [
  {
    id: 'gate-0-listening-1',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'A2',
    payload: {
      section: 1,
      title: 'Booking a cooking class',
      context: 'You will hear a man phoning a community centre to book a cooking class. Write ONE WORD AND/OR A NUMBER for each answer.',
      speakers: { A: { name: 'Helen', gender: 'female' }, B: { name: 'David', gender: 'male' } },
      script: [
        { speaker: 'A', text: 'Good afternoon, Riverside Community Centre. Helen speaking. How can I help you?' },
        { speaker: 'B', text: "Hi. I saw that you run evening cooking classes, and I'd like to book a place on one." },
        { speaker: 'A', text: "Of course. Let me take some details. What's your name, please?" },
        { speaker: 'B', text: "It's David Lambert." },
        { speaker: 'A', text: 'Could you spell your surname for me?' },
        { speaker: 'B', text: "Yes, it's L-A-M-B-E-R-T." },
        { speaker: 'A', text: "Thank you. And what's the best number to contact you on?" },
        { speaker: 'B', text: 'My mobile is 0412 386 975.' },
        { speaker: 'A', text: '0412 386 975. Lovely. Now, which class are you interested in? This term we have Thai cooking, Italian cooking and baking.' },
        { speaker: 'B', text: "I did the baking course last year, so this time I'd like to try Italian." },
        { speaker: 'A', text: "Good choice. The Italian class runs on Mondays and on Wednesdays, but Monday's group is already full, I'm afraid." },
        { speaker: 'B', text: "That's fine. Wednesday is better for me anyway." },
        { speaker: 'A', text: 'Great. It starts at 6.30 and finishes at half past eight.' },
        { speaker: 'B', text: 'OK. And how much does it cost?' },
        { speaker: 'A', text: "The course is eight weeks long. It's 95 pounds, but members of the centre pay 85." },
        { speaker: 'B', text: "I'm a member, actually. I joined in the summer." },
        { speaker: 'A', text: 'Then it\'s 85 for you. Would you like to pay by card?' },
        { speaker: 'B', text: 'Yes, card would be easiest.' },
        { speaker: 'A', text: "Oh, I'm sorry, our card machine isn't working this week. Could you pay in cash when you come in?" },
        { speaker: 'B', text: "No problem, I'll bring cash." },
        { speaker: 'A', text: "Thank you. All the ingredients are provided, but you'll need to bring an apron." },
        { speaker: 'B', text: 'An apron. Right. Do I need any knives or anything like that?' },
        { speaker: 'A', text: "No, we have all the equipment. The class is in Room 14 on the first floor. Not Room 40, that's the gym." },
        { speaker: 'B', text: 'Room 14. Got it.' },
        { speaker: 'A', text: 'Just one last question. How did you hear about the course? Was it on our website?' },
        { speaker: 'B', text: 'No, actually I saw an advert in the local newspaper.' },
        { speaker: 'A', text: "That's useful to know. Thanks, David. See you on Wednesday." },
      ],
      questions: [
        gap('Surname: ____', ['Lambert'], 'He spells it: L-A-M-B-E-R-T.'),
        gap('Mobile number: ____', ['0412 386 975', '0412386975'], 'He says "My mobile is 0412 386 975".', 3),
        gap('Class chosen: ____ cooking', ['Italian'], 'He did baking last year, so he chooses Italian. Thai is only mentioned as an option.'),
        gap('Day of the class: ____', ['Wednesday'], "Monday's group is full; he says Wednesday is better for him."),
        gap('Start time: ____ pm', ['6.30', '6:30'], 'The class starts at 6.30 and finishes at half past eight.'),
        gap('Price for members: £____', ['85'], 'The full price is 95 pounds, but members pay 85, and he is a member.'),
        gap('Payment method: ____', ['cash'], 'He wanted to pay by card, but the card machine is not working, so he will pay in cash.'),
        gap('Students must bring an ____', ['apron'], 'Ingredients and equipment are provided; he needs an apron.'),
        gap('Room number: ____ (first floor)', ['14'], 'The class is in Room 14. Room 40 is the gym.'),
        gap('Heard about the course in the local ____', ['newspaper'], 'Not the website: he saw an advert in the local newspaper.'),
      ],
    },
  },
  {
    id: 'gate-0-listening-2',
    kind: 'ielts-listening',
    skill: 'listening',
    level: 'B2',
    payload: {
      section: 3,
      title: 'A research project on food waste',
      context: 'You will hear two students, Priya and Jake, discussing their research project. Questions 1-5: choose the correct answer. Questions 6-10: write NO MORE THAN TWO WORDS for each answer.',
      speakers: { A: { name: 'Priya', gender: 'female' }, B: { name: 'Jake', gender: 'male' } },
      script: [
        { speaker: 'A', text: "So, Jake, we should probably start by explaining why we chose food waste in the canteen. Our tutor actually suggested recycling, didn't she?" },
        { speaker: 'B', text: "She did, and I liked that idea at first. But what convinced me was what you found: nobody has actually studied food waste here. You checked the library database and there was nothing about our own campus." },
        { speaker: 'A', text: "Right. Plenty of studies about other universities, but none about ours. And the canteen manager was happy to help, even though neither of us works there." },
        { speaker: 'B', text: 'Then the method. We thought about an online questionnaire, but people are terrible at remembering what they throw away.' },
        { speaker: 'A', text: "And taking photos of the bins wasn't allowed for hygiene reasons. So in the end we weighed the food left on plates at lunchtime, every day for two weeks." },
        { speaker: 'B', text: 'Which took ages, but the data is much more reliable. What surprised you most in the results?' },
        { speaker: 'A', text: "I expected the chips to be the worst, but it was actually the bread rolls. Almost a third of them were thrown away without being touched. That really shocked me." },
        { speaker: 'B', text: "For me the shock was Fridays. Waste on Friday was nearly double any other day. And the vegetarian dishes weren't much better than the meat ones, which I didn't expect either." },
        { speaker: 'A', text: "The manager is thinking about using smaller plates. Apparently some universities say it has reduced waste a lot. What do you think?" },
        { speaker: 'B', text: "It might work, and I know a few students would be annoyed, but that's not my main worry. I'm just not sure our students would react the same way, so I'd want a trial in one canteen before they change everything." },
        { speaker: 'A', text: 'Fair enough. So what do we do next? Start writing the introduction?' },
        { speaker: 'B', text: "Not yet. Before we write anything, we need to run the numbers through the statistics software. Then we can meet the manager again and show her the results." },
        { speaker: 'A', text: "OK. And the presentation. It has to be twenty minutes this time, not fifteen like last term." },
        { speaker: 'B', text: "I think we should open with a graph of the total waste per week, because the numbers are impressive." },
        { speaker: 'A', text: 'Good idea. We also need to be honest about the limitations. We only looked at one canteen, and only at lunchtime.' },
        { speaker: 'B', text: "Agreed. And at the end we can make suggestions, like a donation scheme for unsold bread, so it goes to a local charity instead of the bin." },
        { speaker: 'A', text: "I like that. When's the written report due? I thought it was Tuesday." },
        { speaker: 'B', text: 'They moved it. The written report must be submitted on Thursday now, so we have two extra days.' },
      ],
      questions: [
        mcq('Why did the students choose food waste as their topic?', ['Their tutor suggested it.', 'No one had studied it at their university.', 'Jake works in the canteen.', 'They had data from an earlier project.'], 1, 'The tutor suggested recycling. Priya found that nobody had studied food waste on their campus. Neither of them works in the canteen.'),
        mcq('How did the students collect their data?', ['By interviewing kitchen staff', 'With an online questionnaire', 'By taking photos of the bins', 'By weighing food left on plates'], 3, 'A questionnaire was rejected and photos were not allowed; they weighed the food left on plates.'),
        mcq('What surprised Priya most?', ['How much bread was thrown away', 'The amount wasted on Fridays', 'How little the vegetarian dishes wasted', 'The size of the portions'], 0, 'Priya was shocked by the bread rolls. The Friday figure surprised Jake, not Priya.'),
        mcq("What is Jake's opinion of using smaller plates?", ['Students will be too annoyed.', 'It has already worked at their university.', 'It is too expensive.', 'It should be tested first.'], 3, 'He says annoyed students are not his main worry; he wants a trial in one canteen first.'),
        mcq('What will the students do next?', ['Write the introduction', 'Meet the canteen manager', 'Analyse the data with software', 'Design a poster'], 2, 'Before writing or meeting the manager, they will run the numbers through the statistics software.'),
        gap('The presentation will last ____ minutes.', ['twenty', '20'], 'It has to be twenty minutes, not fifteen like last term.'),
        gap('Open with a ____ of the total waste per week.', ['graph'], 'Jake suggests opening with a graph of the total waste per week.'),
        gap('Explain the ____ of the study, e.g. only one canteen.', ['limitations'], 'They need to be honest about the limitations: one canteen, only lunchtime.'),
        gap('Suggest a ____ scheme for unsold bread.', ['donation'], 'A donation scheme, so unsold bread goes to a local charity.'),
        gap('The written report must be submitted on ____.', ['Thursday'], 'Priya thought Tuesday, but it was moved to Thursday.'),
      ],
    },
  },
  {
    id: 'gate-0-reading-1',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'B1',
    payload: {
      title: 'Libraries of Things',
      paragraphs: [
        "Most people own a drill, but the average drill is used for only around thirteen minutes in its whole life. This surprising figure is often quoted by supporters of a new kind of library. Instead of books, these 'libraries of things' lend out everyday objects that people need only occasionally, such as tools, camping equipment, sewing machines and even children's toys.",
        'The first libraries of this kind appeared in North America in the 1970s, but the idea has spread quickly in the last fifteen years. In the United Kingdom, a group of friends opened a small library of things in south London in 2014. It was run entirely by volunteers and began with fewer than one hundred items, most of them donated by local residents. Today the same organisation runs more than twenty locations across the country.',
        'Borrowing usually works in a similar way to a book library. Members choose an item online, collect it from a locker or a desk, and return it a few days later. Unlike most book libraries, however, many libraries of things charge a small fee for each item, typically between two and fifteen pounds. Organisers say the money pays for repairs, insurance and staff training. People on low incomes can often borrow at a reduced price.',
        'Supporters believe these libraries help both the environment and local communities. If several households share one carpet cleaner, fewer cleaners need to be made, transported and finally thrown away. Users also save money and space at home. Several libraries run free workshops where volunteers teach people how to use and repair the items, and many members say they have met their neighbours for the first time at these events.',
        "Not everything has been easy. Some items are damaged or returned late, and expensive equipment such as electric saws needs regular safety checks. Finding affordable buildings in city centres is another problem. Even so, organisers are optimistic. One manager says the biggest challenge is not money but habit: 'Most people still think the normal thing is to buy. We want borrowing to feel just as normal.'",
      ],
      questions: [
        tfng('A typical drill is used for less than a quarter of an hour in its whole life.', 'true', 'Around thirteen minutes is less than fifteen minutes.'),
        tfng('Libraries of things only lend tools.', 'false', 'They also lend camping equipment, sewing machines and toys.'),
        tfng('The first libraries of things opened in the United Kingdom.', 'false', 'The first ones appeared in North America in the 1970s.'),
        tfng('Most of the first items in the London library were given by people living nearby.', 'true', 'Most items were donated by local residents.'),
        tfng('All libraries of things are free to use.', 'false', 'Many charge a small fee for each item.'),
        tfng('The London organisation receives money from the government.', 'not_given', 'The passage does not say where the organisation gets money, apart from fees.'),
        tfng('Some members have met their neighbours at library events.', 'true', 'Many members say they met their neighbours for the first time at the workshops.'),
        gap('At first, the London library was run by ____.', ['volunteers'], 'It was run entirely by volunteers.'),
        gap('Today the organisation has more than ____ locations.', ['twenty', '20'], 'It runs more than twenty locations across the country.'),
        gap('Members collect items from a desk or a ____.', ['locker'], 'They collect it from a locker or a desk.'),
        gap('Fees help to pay for repairs, ____ and staff training.', ['insurance'], 'The money pays for repairs, insurance and staff training.'),
        gap('In free workshops, volunteers teach people to use and ____ the items.', ['repair'], 'Volunteers teach people how to use and repair the items.'),
        gap('One manager thinks the biggest challenge is people\'s ____.', ['habit'], 'The biggest challenge is not money but habit.'),
      ],
    },
  },
  {
    id: 'gate-0-reading-2',
    kind: 'ielts-reading',
    skill: 'reading',
    level: 'B2',
    payload: {
      title: 'Why We Forget',
      paragraphs: [
        "For most of the twentieth century, forgetting was regarded as a failure of memory: a sign that information had been poorly stored or had simply faded with time. The German psychologist Hermann Ebbinghaus, who tested his own memory of meaningless syllables in the 1880s, described a 'forgetting curve' in which recall drops sharply within the first day and then declines more slowly. His findings have been replicated many times, and they remain the basis of many modern study techniques.",
        'In recent decades, however, a growing number of researchers have argued that forgetting is not merely a defect. According to this view, the brain actively removes or suppresses information that is unlikely to be useful, in the same way that a gardener prunes a plant so that its strongest branches can grow. Remembering every detail of every day, these scientists suggest, would make it harder rather than easier to make decisions, because the important information would be buried among the trivial.',
        'Evidence for this idea comes partly from studies of people with exceptional memories. A small number of individuals can recall what they did on almost any date in their adult lives. Yet many of them report that their memories are a burden: unpleasant experiences remain as vivid as on the day they happened, and some find it difficult to generalise from past events. Their ability, in other words, does not appear to give them any clear advantage in everyday problem-solving.',
        'Laboratory work points in the same direction. Experiments with mice have shown that the growth of new nerve cells in the hippocampus, a region of the brain involved in forming memories, can disrupt existing memories. Mice in which this process was encouraged forgot earlier training more quickly, but they were also better at learning a new task that conflicted with the old one. The researchers concluded that a certain amount of forgetting may make the brain more flexible.',
        "None of this means that all forgetting is beneficial. Conditions such as Alzheimer's disease destroy memories that people need and value, and the causes of such damage are entirely different from the everyday pruning described above. Psychologists are also careful to point out that much of the forgetting students experience before exams is the result of ineffective study habits, such as rereading notes, rather than any deliberate process in the brain.",
        'For learners, the practical message is reassuring. Forgetting some of what we study is normal, and the effort of recalling half-forgotten information actually strengthens memory more than reviewing material we already know well. Testing ourselves at increasing intervals, the principle behind spaced repetition, takes advantage of this. Rather than fighting the forgetting curve, the most effective learners use it.',
      ],
      questions: [
        mcq('According to the first paragraph, Ebbinghaus found that memory', ['declines at the same rate every day.', 'falls quickly at first and then more slowly.', 'is better for meaningless syllables.', 'is stronger for old events than recent ones.'], 1, 'Recall drops sharply within the first day and then declines more slowly.'),
        mcq('The writer mentions a gardener in order to show that', ['memory needs regular attention.', 'forgetting is a natural part of ageing.', 'people who work outdoors make better decisions.', 'the brain removes less useful information so that important information stands out.'], 3, 'Like pruning, the brain removes information unlikely to be useful so the important information is not buried.'),
        mcq('What do many people with exceptional memories report?', ['Their ability is a burden in some ways.', 'They are better at solving problems.', 'They only remember pleasant experiences.', 'They developed their skill through training.'], 0, 'Many report that their memories are a burden; unpleasant experiences stay vivid.'),
        mcq('In the experiments, mice with more new nerve cells', ['remembered earlier training for longer.', 'could not learn new tasks.', 'forgot old training faster but learned a conflicting task better.', "developed problems similar to Alzheimer's disease."], 2, 'They forgot earlier training more quickly but were better at a new task that conflicted with the old one.'),
        mcq('What is the main purpose of the fifth paragraph?', ['To argue that all forgetting is harmful', "To explain the causes of Alzheimer's disease", "To criticise psychologists' research methods", 'To limit the claim that forgetting is useful'], 3, '"None of this means that all forgetting is beneficial": the paragraph sets limits on the earlier claim.'),
        tfng("Ebbinghaus's results have been confirmed by later research.", 'true', 'His findings have been replicated many times.'),
        tfng('Studies of people with exceptional memories were carried out in several countries.', 'not_given', 'The passage does not say where these studies took place.'),
        tfng('The hippocampus plays a part in forming memories.', 'true', 'It is described as a region of the brain involved in forming memories.'),
        tfng('Rereading notes is an effective way to prepare for exams.', 'false', 'Rereading notes is given as an example of an ineffective study habit.'),
        gap('Forgetting some of what we study is ____.', ['normal'], 'Forgetting some of what we study is normal.', 2),
        gap('Testing ourselves at increasing ____ strengthens memory.', ['intervals'], 'Testing ourselves at increasing intervals.', 2),
        gap('This principle is the basis of ____.', ['spaced repetition'], 'The principle behind spaced repetition.', 2),
        gap('The most effective learners ____ the forgetting curve instead of fighting it.', ['use'], 'Rather than fighting the forgetting curve, the most effective learners use it.', 2),
      ],
    },
  },
  {
    id: 'gate-0-writing-1',
    kind: 'writing-prompt',
    skill: 'writing',
    level: 'A2',
    payload: {
      taskType: 'ielts-task1',
      title: 'Students in three faculties',
      instructions: 'You should spend about 20 minutes on this task. Write at least 100 words.',
      prompt: 'The chart below shows the number of students (in thousands) in three faculties of a university in 2000, 2010 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
      minWords: 100,
      timeMinutes: 20,
      chart: {
        type: 'bar',
        title: 'Students by faculty, 2000-2020',
        unit: 'thousand students',
        categories: ['2000', '2010', '2020'],
        series: [
          { name: 'Science', values: [12, 15, 18] },
          { name: 'Arts', values: [20, 18, 14] },
          { name: 'Business', values: [8, 14, 22] },
        ],
      },
    },
  },
  {
    id: 'gate-0-writing-2',
    kind: 'writing-prompt',
    skill: 'writing',
    level: 'A2',
    payload: {
      taskType: 'ielts-task2',
      title: 'English at primary school',
      instructions: 'You should spend about 30 minutes on this task. Write at least 150 words.',
      prompt: 'Some people think children should start learning English at primary school. Do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience.',
      minWords: 150,
      timeMinutes: 30,
    },
  },
  {
    id: 'gate-0-speaking',
    kind: 'speaking-ielts',
    skill: 'speaking',
    level: 'A2',
    payload: {
      topic: 'Home and family',
      part1: ['Where do you live?', 'Do you work or study?', 'What do you do in your free time?'],
      part2: {
        cueCard: 'Describe a person in your family.',
        bullets: ['who this person is', 'what he or she looks like', 'what you do together'],
        closing: 'and explain why you like spending time with this person.',
      },
      part3: [],
    },
  },
];


/** Where the groups of one skill of a gate come from: fixed groups, or unseen groups drawn from the generated pool */
export type GroupSource = string[] | { pool: PoolType[] };

export interface GateDefinition {
  gate: number;
  /** Skills the learner may skip */
  optional: PathSkill[];
  /** Version A is the first try, version B every retake */
  versions: Record<'A' | 'B', Record<PathSkill, GroupSource>>;
  /** Minutes per skill */
  minutes: Record<PathSkill, number>;
}

const written = (gate: number, version: 'A' | 'B') => ({
  writing: [`gate-${gate}-${version}-writing-1`, `gate-${gate}-${version}-writing-2`],
  speaking: [`gate-${gate}-${version}-speaking`],
});

const gate0Groups: Record<PathSkill, string[]> = {
  listening: ['gate-0-listening-1', 'gate-0-listening-2'],
  reading: ['gate-0-reading-1', 'gate-0-reading-2'],
  writing: ['gate-0-writing-1', 'gate-0-writing-2'],
  speaking: ['gate-0-speaking'],
};

/** Retake (version B) of listening and reading in Gates 1-4: the same kind of exercise, newly made */
const RETAKE_POOLS: Record<number, { listening: PoolType[]; reading: PoolType[] }> = {
  1: { listening: ['l-form'], reading: ['r-tfng'] },
  2: { listening: ['l-mono'], reading: ['r-scan'] },
  3: { listening: ['l-sec3'], reading: ['r-passage'] },
  4: { listening: ['l-sec4'], reading: ['r-passage'] },
};
const FULL_TEST: { listening: PoolType[]; reading: PoolType[] } = { listening: ['g-l1', 'g-l2', 'g-l3', 'g-l4'], reading: ['g-r', 'g-r', 'g-r'] };

const defineGate = (gate: number): GateDefinition => {
  const full = gate >= 5;
  const shortWriting = gate <= 1 ? 50 : 60;
  return {
    gate,
    optional: [],
    versions: {
      A: { listening: full ? { pool: FULL_TEST.listening } : [`gate-${gate}-listening`], reading: full ? { pool: FULL_TEST.reading } : [`gate-${gate}-reading`], ...written(gate, 'A') },
      B: { listening: { pool: full ? FULL_TEST.listening : RETAKE_POOLS[gate].listening }, reading: { pool: full ? FULL_TEST.reading : RETAKE_POOLS[gate].reading }, ...written(gate, 'B') },
    },
    minutes: { listening: full ? 40 : 20, reading: full ? 60 : 25, writing: full ? 60 : shortWriting, speaking: gate <= 1 ? 10 : 15 },
  };
};

export const GATES: Record<number, GateDefinition> = {
  0: {
    gate: 0,
    optional: ['writing', 'speaking'],
    versions: { A: gate0Groups, B: gate0Groups },
    minutes: { listening: 30, reading: 45, writing: 50, speaking: 10 },
  },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((gate) => [gate, defineGate(gate)])),
};

export const GATE_GROUPS: GateGroup[] = [...GATE0_GROUPS, ...GATE_LR_GROUPS, ...GATE_WS_GROUPS];

const SCHEMAS = { 'ielts-listening': pathListening, 'ielts-reading': pathReading, 'writing-prompt': writingPrompt, 'speaking-ielts': speakingIeltsGate } as const;

/** Validates a gate group against the schema of its kind */
export const parseGateGroup = (group: GateGroup) => SCHEMAS[group.kind].parse(group.payload);

/**
 * Upserts every gate group (startup), so edits in this file reach the database
 * @throws Error when a group does not match its schema (a programming error)
 */
export async function ensureGateContent(): Promise<void> {
  for (const group of GATE_GROUPS) {
    const payload = parseGateGroup(group);
    const title = contentTitle(group.kind, payload);
    const gate = group.id.split('-')[1];
    await db
      .insert(contentItems)
      .values({ id: group.id, kind: group.kind, skill: group.skill, exam: 'ielts', part: `gate-${gate}`, level: group.level, language: 'en', title, topic: 'ielts-gate', payload, source: 'builtin', status: 'archived' })
      .onConflictDoUpdate({ target: contentItems.id, set: { title, payload, level: group.level, status: sql`'archived'` } });
  }
}
