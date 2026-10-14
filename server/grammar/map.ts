/**
 * Grammar Map
 * The structure of English grammar for the map: clusters, points, how points depend on and compete
 * with each other, and timelines for the tenses. Written by hand so the links are reliable; the
 * explanation of each point (forms, uses, mistakes) is drafted by the AI and reviewed by an admin.
 */

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
type Text = { en: string; vi: string };

export interface GrammarCluster {
  id: string;
  title: Text;
}

/** Position on a timeline: -1 far past, 0 now, 1 far future */
export interface TimelineMark {
  /** point: one moment; span: an action in progress; repeat: a habit; link: a connection to a later time */
  kind: 'point' | 'span' | 'repeat' | 'link';
  from: number;
  to?: number;
  label?: Text;
}

export interface Timeline {
  marks: TimelineMark[];
  /** Reference moment the action is measured against (e.g. "by then") */
  reference?: { at: number; label: Text };
}

export interface GrammarPointMeta {
  id: string;
  cluster: string;
  title: Text;
  cefr: Cefr;
  /** Points to know first */
  builds?: string[];
  /** Points often confused with this one */
  contrasts?: string[];
  /** Points used together with this one */
  related?: string[];
  timeline?: Timeline;
}

export const GRAMMAR_CLUSTERS: GrammarCluster[] = [
  { id: 'tenses', title: { en: 'Tenses', vi: 'Các thì' } },
  { id: 'modals', title: { en: 'Modal verbs', vi: 'Động từ khuyết thiếu' } },
  { id: 'conditionals', title: { en: 'Conditionals & wishes', vi: 'Câu điều kiện & câu ước' } },
  { id: 'passive', title: { en: 'Passive voice', vi: 'Câu bị động' } },
  { id: 'reported', title: { en: 'Reported speech', vi: 'Câu tường thuật' } },
  { id: 'relative', title: { en: 'Relative clauses', vi: 'Mệnh đề quan hệ' } },
  { id: 'verb-patterns', title: { en: 'Verb patterns', vi: 'Danh động từ & động từ nguyên mẫu' } },
  { id: 'nouns', title: { en: 'Nouns, articles & quantifiers', vi: 'Danh từ, mạo từ & lượng từ' } },
  { id: 'adjectives', title: { en: 'Adjectives & adverbs', vi: 'Tính từ & trạng từ' } },
  { id: 'prepositions', title: { en: 'Prepositions & phrasal verbs', vi: 'Giới từ & cụm động từ' } },
  { id: 'linking', title: { en: 'Linking words & clauses', vi: 'Từ nối & mệnh đề' } },
  { id: 'sentences', title: { en: 'Questions & sentence structure', vi: 'Câu hỏi & cấu trúc câu' } },
];

const t = (en: string, vi: string): Text => ({ en, vi });

export const GRAMMAR_POINTS: GrammarPointMeta[] = [
  /* ---------- Tenses ---------- */
  {
    id: 'present-simple',
    cluster: 'tenses',
    title: t('Present simple', 'Hiện tại đơn'),
    cefr: 'A1',
    contrasts: ['present-continuous'],
    related: ['adverbs-frequency', 'stative-verbs'],
    timeline: { marks: [{ kind: 'repeat', from: -0.85, to: 0.85, label: t('habit, fact', 'thói quen, sự thật') }] },
  },
  {
    id: 'present-continuous',
    cluster: 'tenses',
    title: t('Present continuous', 'Hiện tại tiếp diễn'),
    cefr: 'A1',
    builds: ['present-simple'],
    contrasts: ['present-simple'],
    related: ['stative-verbs', 'future-present-continuous'],
    timeline: { marks: [{ kind: 'span', from: -0.2, to: 0.2, label: t('happening now', 'đang diễn ra') }] },
  },
  {
    id: 'past-simple',
    cluster: 'tenses',
    title: t('Past simple', 'Quá khứ đơn'),
    cefr: 'A1',
    contrasts: ['present-perfect', 'past-continuous', 'used-to'],
    timeline: { marks: [{ kind: 'point', from: -0.5, label: t('finished, known time', 'đã xong, thời điểm xác định') }] },
  },
  {
    id: 'past-continuous',
    cluster: 'tenses',
    title: t('Past continuous', 'Quá khứ tiếp diễn'),
    cefr: 'A2',
    builds: ['past-simple', 'present-continuous'],
    contrasts: ['past-simple'],
    related: ['time-clauses'],
    timeline: {
      marks: [{ kind: 'span', from: -0.75, to: -0.3, label: t('in progress', 'đang diễn ra') }],
      reference: { at: -0.5, label: t('another action / time', 'hành động / thời điểm khác') },
    },
  },
  {
    id: 'present-perfect',
    cluster: 'tenses',
    title: t('Present perfect', 'Hiện tại hoàn thành'),
    cefr: 'A2',
    builds: ['past-simple'],
    contrasts: ['past-simple', 'present-perfect-continuous'],
    timeline: {
      marks: [
        { kind: 'point', from: -0.5, label: t('time not important', 'không rõ / không quan trọng khi nào') },
        { kind: 'link', from: -0.5, to: 0, label: t('result now', 'kết quả ở hiện tại') },
      ],
    },
  },
  {
    id: 'present-perfect-continuous',
    cluster: 'tenses',
    title: t('Present perfect continuous', 'Hiện tại hoàn thành tiếp diễn'),
    cefr: 'B1',
    builds: ['present-perfect', 'present-continuous'],
    contrasts: ['present-perfect'],
    timeline: { marks: [{ kind: 'span', from: -0.65, to: 0, label: t('started in the past, still going', 'bắt đầu trong quá khứ, vẫn đang tiếp tục') }] },
  },
  {
    id: 'past-perfect',
    cluster: 'tenses',
    title: t('Past perfect', 'Quá khứ hoàn thành'),
    cefr: 'B1',
    builds: ['past-simple', 'present-perfect'],
    contrasts: ['past-simple'],
    related: ['reported-statements', 'third-conditional'],
    timeline: {
      marks: [{ kind: 'point', from: -0.75, label: t('earlier action', 'hành động xảy ra trước') }],
      reference: { at: -0.35, label: t('later past action', 'hành động quá khứ sau') },
    },
  },
  {
    id: 'past-perfect-continuous',
    cluster: 'tenses',
    title: t('Past perfect continuous', 'Quá khứ hoàn thành tiếp diễn'),
    cefr: 'B2',
    builds: ['past-perfect', 'past-continuous'],
    contrasts: ['past-perfect'],
    timeline: {
      marks: [{ kind: 'span', from: -0.85, to: -0.35, label: t('going on until then', 'kéo dài đến lúc đó') }],
      reference: { at: -0.35, label: t('past moment', 'thời điểm trong quá khứ') },
    },
  },
  {
    id: 'future-will',
    cluster: 'tenses',
    title: t('Future: will', 'Tương lai với will'),
    cefr: 'A2',
    contrasts: ['future-going-to', 'future-present-continuous'],
    related: ['first-conditional'],
    timeline: { marks: [{ kind: 'point', from: 0.5, label: t('decision now, prediction, promise', 'quyết định tức thì, dự đoán, lời hứa') }] },
  },
  {
    id: 'future-going-to',
    cluster: 'tenses',
    title: t('Future: be going to', 'Tương lai với be going to'),
    cefr: 'A2',
    contrasts: ['future-will', 'future-present-continuous'],
    timeline: {
      marks: [
        { kind: 'link', from: 0, to: 0.5, label: t('plan or evidence now', 'kế hoạch / dấu hiệu ở hiện tại') },
        { kind: 'point', from: 0.5 },
      ],
    },
  },
  {
    id: 'future-present-continuous',
    cluster: 'tenses',
    title: t('Present continuous for arrangements', 'Hiện tại tiếp diễn chỉ lịch hẹn'),
    cefr: 'A2',
    builds: ['present-continuous'],
    contrasts: ['future-going-to', 'future-will'],
    timeline: { marks: [{ kind: 'point', from: 0.45, label: t('fixed arrangement', 'lịch hẹn đã sắp xếp') }] },
  },
  {
    id: 'future-continuous',
    cluster: 'tenses',
    title: t('Future continuous', 'Tương lai tiếp diễn'),
    cefr: 'B1',
    builds: ['future-will', 'present-continuous'],
    contrasts: ['future-perfect'],
    timeline: {
      marks: [{ kind: 'span', from: 0.3, to: 0.7, label: t('in progress then', 'đang diễn ra vào lúc đó') }],
      reference: { at: 0.5, label: t('future time', 'thời điểm tương lai') },
    },
  },
  {
    id: 'future-perfect',
    cluster: 'tenses',
    title: t('Future perfect', 'Tương lai hoàn thành'),
    cefr: 'B2',
    builds: ['future-will', 'present-perfect'],
    contrasts: ['future-continuous'],
    timeline: {
      marks: [{ kind: 'point', from: 0.4, label: t('finished before', 'hoàn thành trước') }],
      reference: { at: 0.75, label: t('by then', 'trước thời điểm đó') },
    },
  },
  {
    id: 'used-to',
    cluster: 'tenses',
    title: t('Used to and would', 'Used to và would (thói quen quá khứ)'),
    cefr: 'B1',
    builds: ['past-simple'],
    contrasts: ['past-simple'],
    timeline: { marks: [{ kind: 'repeat', from: -0.9, to: -0.35, label: t('past habit, not now', 'thói quen cũ, nay không còn') }] },
  },
  {
    id: 'stative-verbs',
    cluster: 'tenses',
    title: t('State and action verbs', 'Động từ chỉ trạng thái'),
    cefr: 'B1',
    builds: ['present-continuous'],
    related: ['present-simple'],
  },

  /* ---------- Modals ---------- */
  { id: 'can-could', cluster: 'modals', title: t('Can and could: ability', 'Can và could: khả năng'), cefr: 'A1', related: ['permission-requests'] },
  { id: 'permission-requests', cluster: 'modals', title: t('Permission and requests', 'Xin phép và đề nghị'), cefr: 'A2', builds: ['can-could'] },
  {
    id: 'must-have-to',
    cluster: 'modals',
    title: t('Must and have to', 'Must và have to'),
    cefr: 'A2',
    contrasts: ['dont-have-to'],
  },
  {
    id: 'dont-have-to',
    cluster: 'modals',
    title: t("Mustn't, don't have to, needn't", "Mustn't, don't have to, needn't"),
    cefr: 'B1',
    builds: ['must-have-to'],
    contrasts: ['must-have-to'],
  },
  { id: 'should-ought-to', cluster: 'modals', title: t('Should and ought to: advice', 'Should và ought to: lời khuyên'), cefr: 'A2', contrasts: ['must-have-to'] },
  { id: 'may-might', cluster: 'modals', title: t('May, might, could: possibility', 'May, might, could: khả năng xảy ra'), cefr: 'B1', related: ['deduction'] },
  {
    id: 'deduction',
    cluster: 'modals',
    title: t("Must, can't, might: deduction", "Must, can't, might: suy đoán"),
    cefr: 'B2',
    builds: ['may-might', 'must-have-to'],
    contrasts: ['must-have-to'],
  },
  {
    id: 'modal-perfect',
    cluster: 'modals',
    title: t('Should have, must have, could have', 'Should have, must have, could have'),
    cefr: 'B2',
    builds: ['deduction', 'should-ought-to', 'present-perfect'],
    related: ['third-conditional'],
  },

  /* ---------- Conditionals ---------- */
  { id: 'zero-conditional', cluster: 'conditionals', title: t('Zero conditional', 'Câu điều kiện loại 0'), cefr: 'A2', builds: ['present-simple'], contrasts: ['first-conditional'] },
  {
    id: 'first-conditional',
    cluster: 'conditionals',
    title: t('First conditional', 'Câu điều kiện loại 1'),
    cefr: 'A2',
    builds: ['present-simple', 'future-will'],
    contrasts: ['second-conditional', 'zero-conditional'],
    related: ['unless-in-case'],
  },
  {
    id: 'second-conditional',
    cluster: 'conditionals',
    title: t('Second conditional', 'Câu điều kiện loại 2'),
    cefr: 'B1',
    builds: ['past-simple', 'first-conditional'],
    contrasts: ['first-conditional', 'third-conditional'],
    related: ['wishes'],
  },
  {
    id: 'third-conditional',
    cluster: 'conditionals',
    title: t('Third conditional', 'Câu điều kiện loại 3'),
    cefr: 'B2',
    builds: ['past-perfect', 'second-conditional'],
    contrasts: ['second-conditional'],
    related: ['wishes', 'modal-perfect'],
  },
  { id: 'mixed-conditionals', cluster: 'conditionals', title: t('Mixed conditionals', 'Câu điều kiện hỗn hợp'), cefr: 'C1', builds: ['second-conditional', 'third-conditional'] },
  { id: 'unless-in-case', cluster: 'conditionals', title: t('Unless, in case, provided that', 'Unless, in case, provided that'), cefr: 'B1', builds: ['first-conditional'] },
  {
    id: 'wishes',
    cluster: 'conditionals',
    title: t('Wish and if only', 'Câu ước: wish, if only'),
    cefr: 'B2',
    builds: ['second-conditional'],
    related: ['third-conditional'],
  },

  /* ---------- Passive ---------- */
  { id: 'passive-basics', cluster: 'passive', title: t('Passive voice: basics', 'Câu bị động cơ bản'), cefr: 'A2', builds: ['present-simple', 'past-simple'] },
  {
    id: 'passive-tenses',
    cluster: 'passive',
    title: t('Passive in all tenses', 'Bị động ở các thì'),
    cefr: 'B1',
    builds: ['passive-basics', 'present-perfect', 'present-continuous'],
  },
  { id: 'passive-modals', cluster: 'passive', title: t('Passive with modals', 'Bị động với động từ khuyết thiếu'), cefr: 'B1', builds: ['passive-basics', 'must-have-to'] },
  { id: 'causative', cluster: 'passive', title: t('Have/get something done', 'Thể nhờ bảo: have/get sth done'), cefr: 'B2', builds: ['passive-basics'] },
  {
    id: 'passive-reporting',
    cluster: 'passive',
    title: t('It is said that… / He is said to…', 'Bị động với động từ tường thuật'),
    cefr: 'C1',
    builds: ['passive-tenses', 'reporting-verbs'],
  },

  /* ---------- Reported speech ---------- */
  {
    id: 'reported-statements',
    cluster: 'reported',
    title: t('Reported statements', 'Câu tường thuật: câu kể'),
    cefr: 'B1',
    builds: ['past-simple', 'past-perfect'],
    related: ['reported-questions'],
  },
  {
    id: 'reported-questions',
    cluster: 'reported',
    title: t('Reported questions', 'Câu tường thuật: câu hỏi'),
    cefr: 'B1',
    builds: ['reported-statements', 'question-forms'],
    related: ['indirect-questions'],
  },
  { id: 'reported-commands', cluster: 'reported', title: t('Reported commands and requests', 'Câu tường thuật: mệnh lệnh, yêu cầu'), cefr: 'B1', builds: ['reported-statements'] },
  {
    id: 'reporting-verbs',
    cluster: 'reported',
    title: t('Reporting verbs (suggest, deny, admit…)', 'Động từ tường thuật (suggest, deny, admit…)'),
    cefr: 'B2',
    builds: ['reported-statements', 'gerund-infinitive'],
  },

  /* ---------- Relative clauses ---------- */
  { id: 'relative-pronouns', cluster: 'relative', title: t('Who, which, that, whose, where', 'Đại từ quan hệ'), cefr: 'A2' },
  {
    id: 'defining-relative',
    cluster: 'relative',
    title: t('Defining relative clauses', 'Mệnh đề quan hệ xác định'),
    cefr: 'B1',
    builds: ['relative-pronouns'],
    contrasts: ['non-defining-relative'],
  },
  {
    id: 'non-defining-relative',
    cluster: 'relative',
    title: t('Non-defining relative clauses', 'Mệnh đề quan hệ không xác định'),
    cefr: 'B2',
    builds: ['defining-relative'],
    contrasts: ['defining-relative'],
  },
  {
    id: 'reduced-relative',
    cluster: 'relative',
    title: t('Reduced relative clauses', 'Rút gọn mệnh đề quan hệ'),
    cefr: 'B2',
    builds: ['defining-relative', 'participle-clauses'],
  },

  /* ---------- Verb patterns ---------- */
  {
    id: 'gerund-infinitive',
    cluster: 'verb-patterns',
    title: t('Gerund or infinitive?', 'V-ing hay to V?'),
    cefr: 'B1',
    related: ['verb-meaning-change', 'make-let'],
  },
  {
    id: 'verb-meaning-change',
    cluster: 'verb-patterns',
    title: t('Stop, remember, try + -ing / to', 'Stop, remember, try + V-ing / to V'),
    cefr: 'B2',
    builds: ['gerund-infinitive'],
    contrasts: ['gerund-infinitive'],
  },
  { id: 'make-let', cluster: 'verb-patterns', title: t('Make, let, help + bare infinitive', 'Make, let, help + V nguyên mẫu'), cefr: 'B1', builds: ['gerund-infinitive'] },
  { id: 'participle-clauses', cluster: 'verb-patterns', title: t('Participle clauses', 'Mệnh đề phân từ'), cefr: 'C1', builds: ['gerund-infinitive', 'passive-basics'] },
  { id: 'adjective-preposition-ing', cluster: 'verb-patterns', title: t('Prepositions + -ing', 'Giới từ + V-ing'), cefr: 'B1', builds: ['gerund-infinitive'], related: ['dependent-prepositions'] },

  /* ---------- Nouns, articles, quantifiers ---------- */
  { id: 'countable-uncountable', cluster: 'nouns', title: t('Countable and uncountable nouns', 'Danh từ đếm được và không đếm được'), cefr: 'A1', related: ['quantifiers'] },
  { id: 'articles-a-an', cluster: 'nouns', title: t('A / an', 'Mạo từ a / an'), cefr: 'A1', builds: ['countable-uncountable'], contrasts: ['article-the'] },
  { id: 'article-the', cluster: 'nouns', title: t('The', 'Mạo từ the'), cefr: 'A2', builds: ['articles-a-an'], contrasts: ['articles-a-an', 'zero-article'] },
  { id: 'zero-article', cluster: 'nouns', title: t('No article', 'Không dùng mạo từ'), cefr: 'B1', builds: ['article-the'], contrasts: ['article-the'] },
  {
    id: 'quantifiers',
    cluster: 'nouns',
    title: t('Some, any, much, many, a lot of', 'Some, any, much, many, a lot of'),
    cefr: 'A2',
    builds: ['countable-uncountable'],
    contrasts: ['few-little'],
  },
  { id: 'few-little', cluster: 'nouns', title: t('Few, a few, little, a little', 'Few, a few, little, a little'), cefr: 'B1', builds: ['quantifiers'], contrasts: ['quantifiers'] },
  { id: 'possessives', cluster: 'nouns', title: t("Possessives: 's, of, whose", "Sở hữu: 's, of"), cefr: 'A2' },
  { id: 'pronouns-reflexive', cluster: 'nouns', title: t('Reflexive pronouns', 'Đại từ phản thân'), cefr: 'A2' },

  /* ---------- Adjectives and adverbs ---------- */
  { id: 'adjective-order', cluster: 'adjectives', title: t('Order of adjectives', 'Trật tự tính từ'), cefr: 'B1' },
  { id: 'adjectives-ed-ing', cluster: 'adjectives', title: t('-ed and -ing adjectives', 'Tính từ đuôi -ed và -ing'), cefr: 'A2' },
  { id: 'comparatives', cluster: 'adjectives', title: t('Comparatives', 'So sánh hơn'), cefr: 'A2', contrasts: ['as-as'], related: ['superlatives'] },
  { id: 'superlatives', cluster: 'adjectives', title: t('Superlatives', 'So sánh nhất'), cefr: 'A2', builds: ['comparatives'] },
  { id: 'as-as', cluster: 'adjectives', title: t('As … as', 'So sánh bằng: as … as'), cefr: 'A2', builds: ['comparatives'], contrasts: ['comparatives'] },
  { id: 'adverbs-frequency', cluster: 'adjectives', title: t('Adverbs of frequency and manner', 'Trạng từ tần suất và cách thức'), cefr: 'A1', related: ['present-simple'] },
  { id: 'too-enough', cluster: 'adjectives', title: t('Too and enough', 'Too và enough'), cefr: 'A2', contrasts: ['so-such'] },
  { id: 'so-such', cluster: 'adjectives', title: t('So and such', 'So và such'), cefr: 'B1', contrasts: ['too-enough'] },

  /* ---------- Prepositions ---------- */
  { id: 'prepositions-time', cluster: 'prepositions', title: t('In, on, at: time', 'Giới từ chỉ thời gian: in, on, at'), cefr: 'A1', contrasts: ['prepositions-place'] },
  { id: 'prepositions-place', cluster: 'prepositions', title: t('In, on, at: place', 'Giới từ chỉ nơi chốn: in, on, at'), cefr: 'A1', contrasts: ['prepositions-time'] },
  { id: 'dependent-prepositions', cluster: 'prepositions', title: t('Interested in, good at…', 'Giới từ đi kèm: interested in, good at…'), cefr: 'B1' },
  { id: 'phrasal-verbs', cluster: 'prepositions', title: t('Phrasal verbs', 'Cụm động từ (phrasal verbs)'), cefr: 'B1' },

  /* ---------- Linking ---------- */
  { id: 'coordinating', cluster: 'linking', title: t('And, but, or, so', 'And, but, or, so'), cefr: 'A1' },
  {
    id: 'contrast-linkers',
    cluster: 'linking',
    title: t('Although, despite, however', 'Although, despite, however'),
    cefr: 'B1',
    builds: ['coordinating'],
    related: ['cause-result'],
  },
  { id: 'cause-result', cluster: 'linking', title: t('Because, so, therefore, due to', 'Because, so, therefore, due to'), cefr: 'B1', builds: ['coordinating'] },
  { id: 'purpose', cluster: 'linking', title: t('To, in order to, so that', 'Chỉ mục đích: to, in order to, so that'), cefr: 'B1', contrasts: ['cause-result'] },
  { id: 'time-clauses', cluster: 'linking', title: t('When, while, as soon as, until', 'Mệnh đề thời gian'), cefr: 'B1', related: ['past-continuous', 'future-will'] },

  /* ---------- Sentences ---------- */
  { id: 'question-forms', cluster: 'sentences', title: t('Question forms', 'Cách đặt câu hỏi'), cefr: 'A1' },
  { id: 'question-tags', cluster: 'sentences', title: t('Question tags', 'Câu hỏi đuôi'), cefr: 'B1', builds: ['question-forms'] },
  {
    id: 'indirect-questions',
    cluster: 'sentences',
    title: t('Indirect questions', 'Câu hỏi gián tiếp'),
    cefr: 'B1',
    builds: ['question-forms'],
    contrasts: ['question-forms'],
  },
  { id: 'there-is-are', cluster: 'sentences', title: t('There is / there are', 'There is / there are'), cefr: 'A1' },
  { id: 'subject-verb-agreement', cluster: 'sentences', title: t('Subject–verb agreement', 'Sự hoà hợp chủ ngữ – động từ'), cefr: 'B1' },
  { id: 'inversion', cluster: 'sentences', title: t('Inversion (Never have I…)', 'Đảo ngữ'), cefr: 'C1', builds: ['question-forms'] },
  { id: 'cleft-sentences', cluster: 'sentences', title: t('Cleft sentences (It is… that)', 'Câu chẻ (It is… that)'), cefr: 'C1', builds: ['defining-relative'] },
];

/**
 * Points and their links, in both directions for contrasts
 */
export function grammarEdges(): { from: string; to: string; kind: 'builds' | 'contrast' | 'related' }[] {
  const edges: { from: string; to: string; kind: 'builds' | 'contrast' | 'related' }[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, kind: 'builds' | 'contrast' | 'related') => {
    // Contrasts and related links are symmetric: keep one
    const key = kind === 'builds' ? `${from}>${to}` : `${kind}:${[from, to].sort().join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const point of GRAMMAR_POINTS) {
    for (const id of point.builds ?? []) add(id, point.id, 'builds');
    for (const id of point.contrasts ?? []) add(point.id, id, 'contrast');
    for (const id of point.related ?? []) add(point.id, id, 'related');
  }
  return edges;
}
