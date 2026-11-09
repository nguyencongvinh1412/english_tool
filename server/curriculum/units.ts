/**
 * Skill curriculum: a fixed path of lessons per skill. Each lesson teaches (learn), shows an annotated model,
 * checks understanding with short drills, then sets a task scored against the lesson's own checklist.
 * The order and topic of every lesson live here; the lesson text is an AI draft reviewed by an admin (skill_units).
 */
import { z } from 'zod';
import type { writingPrompt } from '../content/schemas.js';
import { writingScoringPrompt } from '../content/scoring.js';

export const CURRICULUM_SKILLS = ['writing'] as const;
export type CurriculumSkill = (typeof CURRICULUM_SKILLS)[number];

/** Levels in path order; matches the CEFR levels of skill_levels */
export const UNIT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type UnitLevel = (typeof UNIT_LEVELS)[number];

export interface UnitMeta {
  id: string;
  skill: CurriculumSkill;
  /** Group of lessons inside a skill, e.g. email */
  track: string;
  level: UnitLevel;
  title: { en: string; vi: string };
  /** What the lesson must teach, for the AI draft */
  brief: string;
}

/** Every lesson in path order (index = order) */
export const UNITS: UnitMeta[] = [
  {
    id: 'email-basics',
    skill: 'writing',
    track: 'email',
    level: 'A2',
    title: { en: 'Your first email: asking for information', vi: 'Email đầu tiên: hỏi thông tin' },
    brief:
      'The four parts of any email (greeting, reason for writing, details/questions, closing + sign-off) and a clear subject line. Neutral tone. Asking simple questions politely (Could you tell me…? I would like to know…). Task: about 60-90 words asking a language school about a course.',
  },
  {
    id: 'email-invitation',
    skill: 'writing',
    track: 'email',
    level: 'A2',
    title: { en: 'Inviting a friend and replying', vi: 'Mời bạn bè và trả lời lời mời' },
    brief:
      'Informal emails to friends: informal greetings and sign-offs, contractions, inviting (Would you like to…? How about…?), accepting and declining politely with a reason, giving time/place details. Task: about 70-100 words inviting a friend to a weekend event.',
  },
  {
    id: 'email-request',
    skill: 'writing',
    track: 'email',
    level: 'B1',
    title: { en: 'Making a polite request', vi: 'Viết email đề nghị lịch sự' },
    brief:
      'Semi-formal emails to a teacher, landlord or colleague: choosing formal vs informal, softening requests (I was wondering if…, Would it be possible to…?), giving a reason, saying what you want to happen and by when, thanking in advance. Task: about 100-130 words asking a manager to change a work schedule.',
  },
  {
    id: 'email-complaint',
    skill: 'writing',
    track: 'email',
    level: 'B1',
    title: { en: 'Complaining about a product or service', vi: 'Email phàn nàn về sản phẩm, dịch vụ' },
    brief:
      'Formal complaint emails (IELTS General Task 1 / TOEIC style): Dear Sir or Madam / Yours faithfully, stating the problem with facts (what, when, order number), describing the effect, asking for a clear action (refund, replacement, repair), staying firm but polite, no emotional language. Task: about 130-160 words about a late or damaged delivery.',
  },
  {
    id: 'email-application',
    skill: 'writing',
    track: 'email',
    level: 'B2',
    title: { en: 'Applying for a job or course', vi: 'Email ứng tuyển công việc hoặc khóa học' },
    brief:
      'Formal application emails: naming the position and where you saw it, matching 2-3 strengths to the requirements with evidence, formal linking (In addition, As a result, I am confident that…), mentioning the attachment, a confident closing that asks for an interview. Avoid listing everything; avoid overly humble or boastful tone. Task: about 150-180 words applying for a position.',
  },
  {
    id: 'email-follow-up',
    skill: 'writing',
    track: 'email',
    level: 'B2',
    title: { en: 'Replying to a customer and following up', vi: 'Trả lời khách hàng và email theo dõi' },
    brief:
      'Professional replies at work: thanking for the message, apologising appropriately (We apologise for…, This was caused by…), explaining what will happen next with dates, offering something, following up politely when someone has not replied (I am writing to follow up on…, I would appreciate an update by…). Task: about 150-180 words replying to an unhappy customer.',
  },
];

export const unitMeta = (id: string): UnitMeta | undefined => UNITS.find((u) => u.id === id);
export const unitsOf = (skill: CurriculumSkill): UnitMeta[] => UNITS.filter((u) => u.skill === skill);

const text = (max: number) => z.string().trim().min(1).max(max);
const bilingual = (max: number) => z.object({ en: text(max), vi: text(max) });

const choiceDrill = z.object({
  type: z.literal('choice'),
  prompt: bilingual(250),
  /** Optional context the question is about, e.g. a sentence from an email */
  sentence: text(400).optional(),
  options: z.array(text(250)).min(2).max(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: bilingual(500),
});

const orderDrill = z.object({
  type: z.literal('order'),
  prompt: bilingual(250),
  /** In the correct order; the app shuffles them */
  parts: z.array(text(400)).min(3).max(6),
  explanation: bilingual(500),
});

export const unitDrill = z.discriminatedUnion('type', [choiceDrill, orderDrill]).refine((d) => d.type !== 'choice' || d.answerIndex < d.options.length, {
  message: 'answerIndex must point at an option',
});

export const unitContent = z.object({
  objectives: z.array(bilingual(220)).min(2).max(4),
  /** Short teaching sections; body uses **bold** for key words */
  learn: z.array(z.object({ heading: bilingual(120), body: bilingual(1400) })).min(2).max(5),
  /** A model email split into its parts, each with a note on why it works */
  model: z.object({
    situation: bilingual(500),
    subject: text(150),
    parts: z.array(z.object({ label: bilingual(60), text: text(900), note: bilingual(450) })).min(3).max(8),
  }),
  /** Useful phrases grouped by what they do */
  phrases: z.array(z.object({ use: bilingual(120), items: z.array(text(200)).min(2).max(6) })).min(2).max(6),
  drills: z.array(unitDrill).min(3).max(8),
  /** The lesson's writing task (scored like an email task) */
  task: z.object({
    title: text(120),
    instructions: text(600),
    prompt: text(1500),
    minWords: z.number().int().min(50).max(400),
    timeMinutes: z.number().int().min(5).max(60),
    email: z.object({ from: text(80), subject: text(120), body: text(1500) }).optional(),
  }),
  /** What the lesson taught, checked in the learner's answer */
  checklist: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/), label: bilingual(200) }))
    .min(3)
    .max(5),
});
export type UnitContent = z.infer<typeof unitContent>;

/** The lesson task as a regular email writing task, so the usual scoring and review apply */
export function unitTask(content: UnitContent): z.infer<typeof writingPrompt> {
  return { taskType: 'email', ...content.task };
}

/** Result of checking the lesson checklist in a learner's answer */
export const checklistResult = z.object({
  checklist: z
    .array(z.object({ id: text(40), met: z.enum(['yes', 'partly', 'no']), comment: text(400) }))
    .min(1)
    .max(5),
});

/**
 * Scoring prompt for a lesson task: the usual email scoring plus the lesson's checklist
 */
export function unitScoringPrompt(content: UnitContent, response: string, locale: 'en' | 'vi'): { system: string; user: string } {
  const base = writingScoringPrompt(unitTask(content), response, locale);
  const items = content.checklist.map((c) => `- ${c.id}: ${c.label.en}`).join('\n');
  return {
    system: `${base.system}\nThe learner has just studied a lesson; besides the band, check whether they used what the lesson taught.`,
    user: `${base.user}

Also add "checklist": one entry per lesson point below, in this order, as {"id": "...", "met": "yes" | "partly" | "no", "comment": "one sentence quoting or pointing to their text"}:
${items}`,
  };
}

/**
 * Prompt for the AI draft of one lesson
 */
export function unitDraftPrompt(meta: UnitMeta): { system: string; user: string } {
  const system = `You are an experienced English teacher writing one lesson of a ${meta.skill} course for Vietnamese adult learners at CEFR ${meta.level}.
Teach before testing: explain clearly and practically, then show a model, then check understanding. Use English at ${meta.level} in models and tasks.
Every explanatory field has an English ("en") and a natural Vietnamese ("vi") version; model texts, phrases, drill options and the task are English only.
Point out typical mistakes of Vietnamese learners where they matter (too direct requests, missing greeting or sign-off, wrong formality, translating word by word).
Original wording only; do not copy textbooks. Respond with ONLY one JSON object, no markdown.`;
  const user = `Lesson: ${meta.title.en} (${meta.title.vi}), CEFR ${meta.level}.
What it must cover: ${meta.brief}
JSON shape:
{"objectives": [{"en": "You can …", "vi": "Bạn có thể …"}],
 "learn": [{"heading": {"en": "...", "vi": "..."}, "body": {"en": "short paragraphs, **bold** key words", "vi": "..."}}],
 "model": {"situation": {"en": "...", "vi": "..."}, "subject": "...", "parts": [{"label": {"en": "Greeting", "vi": "Lời chào"}, "text": "the exact text of this part", "note": {"en": "why it works", "vi": "..."}}]},
 "phrases": [{"use": {"en": "Asking politely", "vi": "Hỏi lịch sự"}, "items": ["Could you tell me …?"]}],
 "drills": [
   {"type": "choice", "prompt": {"en": "...", "vi": "..."}, "sentence": "optional sentence the question is about", "options": ["...", "..."], "answerIndex": 0, "explanation": {"en": "...", "vi": "..."}},
   {"type": "order", "prompt": {"en": "Put the parts of the email in order", "vi": "..."}, "parts": ["first", "second", "third", "fourth"], "explanation": {"en": "...", "vi": "..."}}],
 "task": {"title": "...", "instructions": "what to include, as 3 bullet-like sentences", "prompt": "the situation", "minWords": 80, "timeMinutes": 15},
 "checklist": [{"id": "greeting", "label": {"en": "Opens with a suitable greeting", "vi": "..."}}]}
Use 2-4 objectives, 3-4 learn sections, a model with every part of the email, 3-5 phrase groups, 5-6 drills (at least one "order"),
and 3-5 checklist points that match the objectives. For a reply task add "task.email" {"from", "subject", "body"} with the email to answer.`;
  return { system, user };
}
