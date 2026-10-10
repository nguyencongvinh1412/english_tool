/**
 * Content Generators
 * Prompts that ask the AI for one content item as strict JSON, per kind and level
 */
import type { CefrLevel, ContentKind, WritingTask } from './schemas.js';

/** Length and language guidance per CEFR level */
const LEVEL_GUIDE: Record<CefrLevel, string> = {
  A2: 'CEFR A2: short simple sentences, everyday vocabulary, present/past simple.',
  B1: 'CEFR B1: clear connected sentences, common phrasal verbs and linking words.',
  B2: 'CEFR B2: varied complex sentences, some idioms, opinions and arguments.',
  C1: 'CEFR C1: sophisticated, academic or professional vocabulary and structures.',
};

const PASSAGE_WORDS: Record<CefrLevel, string> = { A2: '150-200', B1: '220-300', B2: '300-380', C1: '380-450' };

const JSON_RULES = `Rules:
- Original content only; never copy published exam material.
- Natural, correct English; factually reasonable.
- Respond with ONLY one JSON object, no markdown fences, no commentary.`;

/** Metadata stored with a generated item */
export interface GenerationTarget {
  exam: 'none' | 'toeic' | 'ielts';
  part: string | null;
}

/**
 * Builds the system and user prompts for a generation request
 */
export function buildGenerationPrompt(
  kind: ContentKind,
  level: CefrLevel,
  topic: string | undefined,
  writingTask: WritingTask | undefined
): { system: string; user: string; target: GenerationTarget } {
  const topicLine = topic ? `Topic: ${topic}` : 'Topic: choose an interesting everyday or academic topic yourself.';
  const system = `You create English practice material for Vietnamese learners. ${LEVEL_GUIDE[level]}\n${JSON_RULES}`;

  switch (kind) {
    case 'reading-passage':
      return {
        system,
        target: { exam: 'none', part: null },
        user: `${topicLine}
Write a reading passage of ${PASSAGE_WORDS[level]} words in 3-5 paragraphs, then EXACTLY 6 questions in this order:
4 "mcq" (4 options, exactly one correct), then 2 "tfng" (True / False / Not Given).
Questions must be answerable only from the passage, in passage order. Explanations quote or point to the evidence.
JSON shape:
{"title": "...", "paragraphs": ["...", "..."], "questions": [
  {"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "answerIndex": 0, "explanation": "..."},
  {"type": "tfng", "prompt": "statement", "answer": "true" | "false" | "not_given", "explanation": "..."}
]}`,
      };

    case 'reading-gapfill':
      return {
        system,
        target: { exam: 'toeic', part: 'toeic-5' },
        user: `${topicLine}
Write 10 TOEIC Part 5 style sentence-completion questions set in workplace or business contexts.
Each prompt is one sentence with exactly one blank written as "____". Mix grammar (tense, word form, prepositions,
conjunctions, pronouns) and vocabulary. 4 options, exactly one correct, plausible distractors. Short explanation of why.
JSON shape:
{"title": "...", "questions": [{"type": "mcq", "prompt": "The report must be submitted ____ Friday.", "options": ["by","until","on","at"], "answerIndex": 0, "explanation": "..."}]}`,
      };

    case 'listening-quiz':
      return {
        system,
        target: { exam: 'none', part: null },
        user: `${topicLine}
Write a short listening script that will be read aloud by text-to-speech: either a "dialogue" between two people
(10-16 turns) or a "monologue" (an announcement, voicemail or short talk, 6-10 lines). Spoken style, no stage directions,
no sound effects, numbers written as words. Then 4 multiple-choice questions about details, purpose and inference.
JSON shape:
{"title": "...", "format": "dialogue" | "monologue",
 "speakers": {"A": {"name": "...", "gender": "female" | "male"}, "B": {"name": "...", "gender": "female" | "male"}},
 "script": [{"speaker": "A", "text": "..."}, {"speaker": "B", "text": "..."}],
 "questions": [{"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "answerIndex": 2, "explanation": "..."}]}
For a monologue omit "B" and use only speaker "A".`,
      };

    case 'speaking-ielts':
      return {
        system,
        target: { exam: 'ielts', part: 'ielts-speaking' },
        user: `${topicLine}
Write one IELTS Speaking test set on a single theme:
- part1: 4 short personal questions
- part2: a cue card ("Describe ..."), 3-4 bullet prompts ("You should say: ..."), and a closing line ("and explain ...")
- part3: 3 abstract discussion questions linked to the part 2 theme
JSON shape:
{"topic": "...", "part1": ["...","...","...","..."],
 "part2": {"cueCard": "Describe ...", "bullets": ["what ...","when ...","who ..."], "closing": "and explain ..."},
 "part3": ["...","...","..."]}`,
      };

    case 'writing-prompt':
      return writingPrompt(system, topicLine, writingTask ?? 'ielts-task2');

    default:
      return toeicPrompt(kind, level, topicLine);
  }
}

/** Shared rule for every TOEIC group */
const TOEIC_STYLE = `Write in the style of the TOEIC Listening & Reading test: workplace, business, travel and everyday
professional contexts; international names; plausible distractors; exactly one correct answer per question.
For every question, write the explanation first, then set answerIndex to the option the explanation proves.
The correct option must be fully consistent with the question: a "Yes"/"No" reply must agree with the rest of that reply,
and no distractor may also be acceptable.`;

/**
 * Prompts for one TOEIC exam group (parts 2-7)
 */
function toeicPrompt(
  kind: ContentKind,
  level: CefrLevel,
  topicLine: string
): { system: string; user: string; target: GenerationTarget } {
  const system = `You create original TOEIC practice test material. ${LEVEL_GUIDE[level]}
${TOEIC_STYLE}
${JSON_RULES}`;
  const part = kind.replace('toeic-p', '');
  const target: GenerationTarget = { exam: 'toeic', part: `toeic-${part}` };
  const mcq = '{"type": "mcq", "prompt": "...", "options": ["...","...","...","..."], "explanation": "...", "answerIndex": 1}';

  switch (kind) {
    case 'toeic-p2':
      return {
        system,
        target,
        user: `${topicLine}
Write exactly 5 TOEIC Part 2 (question-response) items. Each has a short spoken question or statement and three spoken responses;
only one is a natural reply. Use typical distractors: repeated words, similar sounds, wrong question word.
Mix wh-questions, yes/no, choice questions, requests and statements.
JSON: {"items": [{"question": "When is the budget meeting?", "options": ["In conference room B.", "Tomorrow at ten.", "Yes, I met him."], "explanation": "...", "answerIndex": 1}]}`,
      };
    case 'toeic-p3':
      return {
        system,
        target,
        user: `${topicLine}
Write one TOEIC Part 3 conversation between two (sometimes three) speakers, 6-10 turns, spoken style, numbers as words.
Then 3 printed questions in order: one about the main topic or purpose, one detail, one about what happens next or an implied meaning.
JSON: {"speakers": {"A": {"name": "...", "gender": "female"}, "B": {"name": "...", "gender": "male"}},
"script": [{"speaker": "A", "text": "..."}], "questions": [${mcq}, ...]}`,
      };
    case 'toeic-p4':
      return {
        system,
        target,
        user: `${topicLine}
Write one TOEIC Part 4 short talk by a single speaker (announcement, voicemail, advertisement, tour guide, radio broadcast,
or meeting excerpt), 4-8 sentences split into script lines, numbers as words. Then 3 printed questions about purpose,
details and what listeners should do.
JSON: {"talkType": "voicemail", "speakers": {"A": {"name": "...", "gender": "male"}},
"script": [{"speaker": "A", "text": "..."}], "questions": [${mcq}, ...]}`,
      };
    case 'toeic-p5':
      return {
        system,
        target,
        user: `${topicLine}
Write 10 TOEIC Part 5 incomplete sentences, each with exactly one blank written as "____". Mix grammar (tense, word form,
prepositions, conjunctions, pronouns, comparatives) and vocabulary.
JSON: {"questions": [{"type": "mcq", "prompt": "The shipment will arrive ____ Thursday.", "options": ["on","in","at","by"], "answerIndex": 0, "explanation": "..."}]}`,
      };
    case 'toeic-p6':
      return {
        system,
        target,
        user: `${topicLine}
Write one TOEIC Part 6 text (email, memo, notice or article) of 110-160 words with four numbered blanks written exactly as
[1], [2], [3] and [4] in order. Blanks [1]-[3] test grammar or vocabulary; one blank tests choosing the best sentence to insert.
Each question's prompt is "Blank [n]". The options for the sentence blank are full sentences.
JSON: {"title": "...", "passage": "... [1] ... [2] ... [3] ... [4] ...", "questions": [{"type": "mcq", "prompt": "Blank [1]", "options": ["...","...","...","..."], "answerIndex": 2, "explanation": "..."}, ...]}`,
      };
    case 'toeic-p7':
      return {
        system,
        target,
        user: `${topicLine}
Write one TOEIC Part 7 reading set. Choose ONE format: a single text (email, advertisement, article, notice, text-message chain,
or form) with 2-4 questions; OR a double/triple passage (2-3 related texts) with 5 questions that require connecting information.
Questions cover purpose, details, inference, vocabulary in context ("The word X in paragraph 1 is closest in meaning to").
JSON: {"passages": [{"kind": "email", "title": "...", "text": "..."}], "questions": [${mcq}, ...]}`,
      };
    default:
      throw new Error(`No generator for ${kind}`);
  }
}

function writingPrompt(
  system: string,
  topicLine: string,
  task: WritingTask
): { system: string; user: string; target: GenerationTarget } {
  if (task === 'email') {
    return {
      system,
      target: { exam: 'toeic', part: 'toeic-w-email' },
      user: `${topicLine}
Create a TOEIC Writing "respond to a written request" task. Write the incoming email (60-110 words) that asks the reader
for information or action, and an instruction telling the learner exactly what their reply must do (e.g. answer two
questions and make one request).
JSON shape:
{"taskType": "email", "title": "...", "instructions": "Respond to the email. In your email, ...",
 "prompt": "one-sentence summary of the task", "minWords": 120, "timeMinutes": 10,
 "email": {"from": "Name <role>", "subject": "...", "body": "..."}}`,
    };
  }

  if (task === 'ielts-task1') {
    return {
      system,
      target: { exam: 'ielts', part: 'ielts-w1' },
      user: `${topicLine}
Create an IELTS Academic Writing Task 1 with a data chart. Invent realistic data with a clear trend and at least one
notable comparison. Use a "bar" chart for comparing categories or a "line" chart for change over time.
3-8 categories (e.g. years or countries), 1-4 series, one value per category in every series.
JSON shape:
{"taskType": "ielts-task1", "title": "...",
 "instructions": "Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
 "prompt": "The chart below shows ...", "minWords": 150, "timeMinutes": 20,
 "chart": {"type": "bar" | "line", "title": "...", "unit": "%", "categories": ["2000","2005","2010"],
   "series": [{"name": "...", "values": [12, 18, 25]}]}}`,
    };
  }

  return {
    system,
    target: { exam: 'ielts', part: 'ielts-w2' },
    user: `${topicLine}
Create an IELTS Academic Writing Task 2 question (opinion, discuss both views, problem/solution, or advantages/disadvantages).
JSON shape:
{"taskType": "ielts-task2", "title": "short title",
 "instructions": "Give reasons for your answer and include any relevant examples from your own knowledge or experience.",
 "prompt": "the full essay question", "minWords": 250, "timeMinutes": 40}`,
  };
}
