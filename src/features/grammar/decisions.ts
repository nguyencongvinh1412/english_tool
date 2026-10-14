/**
 * Decision trees for the choices learners find hardest. Each answer leads to another question or to a
 * grammar point on the map. Written by hand so the advice is reliable.
 */
type Text = { en: string; vi: string };

export interface DecisionOption {
  label: Text;
  /** Next question */
  next?: string;
  /** Or the answer: a grammar point and a short reason */
  result?: { point: string; note: Text };
}

export interface DecisionTree {
  id: string;
  title: Text;
  intro: Text;
  start: string;
  nodes: Record<string, { question: Text; options: DecisionOption[] }>;
}

const t = (en: string, vi: string): Text => ({ en, vi });
const yes = t('Yes', 'Có');
const no = t('No', 'Không');

export const DECISION_TREES: DecisionTree[] = [
  {
    id: 'tense',
    title: t('Which tense?', 'Dùng thì nào?'),
    intro: t('Answer a few questions about the action to find the tense.', 'Trả lời vài câu hỏi về hành động để chọn thì.'),
    start: 'time',
    nodes: {
      time: {
        question: t('When is the action?', 'Hành động xảy ra khi nào?'),
        options: [
          { label: t('In the past', 'Trong quá khứ'), next: 'pastNow' },
          { label: t('Now, or in general', 'Bây giờ hoặc nói chung'), next: 'presentGeneral' },
          { label: t('In the future', 'Trong tương lai'), next: 'futureArranged' },
        ],
      },
      pastNow: {
        question: t(
          'Does it matter now (a result, an experience), with no finished time like "yesterday"?',
          'Hành động còn ý nghĩa ở hiện tại (kết quả, trải nghiệm) và không có mốc thời gian đã kết thúc như "yesterday"?'
        ),
        options: [
          { label: yes, result: { point: 'present-perfect', note: t('Past action, present result: I have lost my key.', 'Hành động quá khứ, kết quả ở hiện tại: I have lost my key.') } },
          { label: no, next: 'pastBefore' },
        ],
      },
      pastBefore: {
        question: t('Did it happen before another past action or time?', 'Nó xảy ra trước một hành động / thời điểm khác trong quá khứ?'),
        options: [
          { label: yes, next: 'pastBeforeLong' },
          { label: no, next: 'pastProgress' },
        ],
      },
      pastBeforeLong: {
        question: t('Do you stress how long it had been going on?', 'Bạn muốn nhấn mạnh nó đã kéo dài bao lâu đến lúc đó?'),
        options: [
          { label: yes, result: { point: 'past-perfect-continuous', note: t('She had been waiting for an hour when he arrived.', 'She had been waiting for an hour when he arrived.') } },
          { label: no, result: { point: 'past-perfect', note: t('The film had started when we arrived.', 'The film had started when we arrived.') } },
        ],
      },
      pastProgress: {
        question: t('Was it in progress at a moment in the past (often interrupted)?', 'Nó đang diễn ra tại một thời điểm trong quá khứ (thường bị hành động khác xen vào)?'),
        options: [
          { label: yes, result: { point: 'past-continuous', note: t('I was cooking when the phone rang.', 'I was cooking when the phone rang.') } },
          { label: no, next: 'pastHabit' },
        ],
      },
      pastHabit: {
        question: t('Is it a past habit that is no longer true?', 'Đó là thói quen trong quá khứ, nay không còn nữa?'),
        options: [
          { label: yes, result: { point: 'used-to', note: t('I used to play football every day.', 'I used to play football every day.') } },
          { label: no, result: { point: 'past-simple', note: t('A finished action at a known time: I visited Hue last year.', 'Hành động đã xong ở thời điểm xác định: I visited Hue last year.') } },
        ],
      },
      presentGeneral: {
        question: t('Is it a fact, a habit or a timetable?', 'Đó là sự thật, thói quen hay lịch trình cố định?'),
        options: [
          { label: yes, result: { point: 'present-simple', note: t('Water boils at 100°C. I get up at six.', 'Water boils at 100°C. I get up at six.') } },
          { label: no, next: 'presentNow' },
        ],
      },
      presentNow: {
        question: t('Is it happening right now or for a temporary period?', 'Nó đang diễn ra ngay lúc này hoặc chỉ tạm thời?'),
        options: [
          {
            label: yes,
            result: {
              point: 'present-continuous',
              note: t('She is studying now. (State verbs like know or like stay in the simple form.)', 'She is studying now. (Động từ trạng thái như know, like vẫn dùng thì đơn.)'),
            },
          },
          { label: no, next: 'presentSince' },
        ],
      },
      presentSince: {
        question: t('Did it start in the past and is it still going on (for, since)?', 'Nó bắt đầu trong quá khứ và vẫn còn tiếp diễn (for, since)?'),
        options: [
          { label: yes, next: 'presentSinceActive' },
          { label: no, result: { point: 'present-perfect', note: t('Experience or result: I have seen that film.', 'Trải nghiệm hoặc kết quả: I have seen that film.') } },
        ],
      },
      presentSinceActive: {
        question: t('Is it an activity you want to stress (not a state like know or have)?', 'Đó là một hoạt động bạn muốn nhấn mạnh (không phải trạng thái như know, have)?'),
        options: [
          { label: yes, result: { point: 'present-perfect-continuous', note: t('I have been learning English for two years.', 'I have been learning English for two years.') } },
          { label: no, result: { point: 'present-perfect', note: t('I have known her since 2019.', 'I have known her since 2019.') } },
        ],
      },
      futureArranged: {
        question: t('Is it an arrangement with other people (time and place fixed)?', 'Đó là lịch hẹn đã sắp xếp với người khác (đã định giờ, địa điểm)?'),
        options: [
          { label: yes, result: { point: 'future-present-continuous', note: t("I'm meeting Lan at 7 tonight.", "I'm meeting Lan at 7 tonight.") } },
          { label: no, next: 'futurePlan' },
        ],
      },
      futurePlan: {
        question: t('Was it planned before now, or is there clear evidence now?', 'Đó là dự định có từ trước, hoặc có dấu hiệu rõ ràng ngay lúc này?'),
        options: [
          { label: yes, result: { point: 'future-going-to', note: t("I'm going to study abroad. Look at those clouds — it's going to rain.", "I'm going to study abroad. Look at those clouds — it's going to rain.") } },
          { label: no, next: 'futureProgress' },
        ],
      },
      futureProgress: {
        question: t('Will it be in progress at a time in the future?', 'Nó sẽ đang diễn ra tại một thời điểm trong tương lai?'),
        options: [
          { label: yes, result: { point: 'future-continuous', note: t('This time tomorrow I will be flying to Tokyo.', 'This time tomorrow I will be flying to Tokyo.') } },
          { label: no, next: 'futureBy' },
        ],
      },
      futureBy: {
        question: t('Will it be finished before a future time (by…)?', 'Nó sẽ hoàn thành trước một thời điểm tương lai (by…)?'),
        options: [
          { label: yes, result: { point: 'future-perfect', note: t('By 2030 I will have finished university.', 'By 2030 I will have finished university.') } },
          {
            label: no,
            result: { point: 'future-will', note: t("A decision now, a prediction or a promise: I'll help you.", "Quyết định tức thì, dự đoán hoặc lời hứa: I'll help you.") },
          },
        ],
      },
    },
  },
  {
    id: 'article',
    title: t('A, an, the or no article?', 'Dùng a/an, the hay không dùng mạo từ?'),
    intro: t('Think about the noun and whether the listener knows which one you mean.', 'Xét danh từ và người nghe có biết bạn nói đến cái nào không.'),
    start: 'noun',
    nodes: {
      noun: {
        question: t('What kind of noun is it?', 'Danh từ thuộc loại nào?'),
        options: [
          { label: t('Countable, singular (a book)', 'Đếm được, số ít (a book)'), next: 'singularKnown' },
          { label: t('Countable, plural (books)', 'Đếm được, số nhiều (books)'), next: 'generalKnown' },
          { label: t('Uncountable (water, advice)', 'Không đếm được (water, advice)'), next: 'generalKnown' },
        ],
      },
      singularKnown: {
        question: t(
          'Does the listener know which one: mentioned before, the only one, or made clear (the man in the red coat)?',
          'Người nghe biết là cái nào: đã nhắc trước đó, chỉ có một, hoặc đã được xác định (the man in the red coat)?'
        ),
        options: [
          { label: yes, result: { point: 'article-the', note: t('I saw a dog. The dog was huge. / The sun is hot.', 'I saw a dog. The dog was huge. / The sun is hot.') } },
          {
            label: no,
            result: { point: 'articles-a-an', note: t('A before a consonant sound (a university), an before a vowel sound (an hour).', 'A trước âm phụ âm (a university), an trước âm nguyên âm (an hour).') },
          },
        ],
      },
      generalKnown: {
        question: t('Do you mean particular ones the listener knows, not the thing in general?', 'Bạn nói về những cái cụ thể mà người nghe biết, không phải nói chung?'),
        options: [
          { label: yes, result: { point: 'article-the', note: t('The books on the table are mine. / Pass me the water.', 'The books on the table are mine. / Pass me the water.') } },
          { label: no, result: { point: 'zero-article', note: t('Talking in general: Books are expensive. Water is important.', 'Nói chung chung: Books are expensive. Water is important.') } },
        ],
      },
    },
  },
  {
    id: 'conditional',
    title: t('Which conditional?', 'Câu điều kiện loại mấy?'),
    intro: t('Decide whether the condition is real and when it happens.', 'Xác định điều kiện có thật không và xảy ra khi nào.'),
    start: 'kind',
    nodes: {
      kind: {
        question: t('What does the if-clause describe?', 'Mệnh đề if nói về điều gì?'),
        options: [
          {
            label: t('Something that is always true when it happens', 'Điều luôn đúng mỗi khi xảy ra'),
            result: { point: 'zero-conditional', note: t('If you heat ice, it melts.', 'If you heat ice, it melts.') },
          },
          {
            label: t('A real possibility in the future', 'Một khả năng có thật trong tương lai'),
            result: { point: 'first-conditional', note: t('If it rains, we will stay at home.', 'If it rains, we will stay at home.') },
          },
          {
            label: t('Something imaginary or unlikely now or in the future', 'Điều tưởng tượng hoặc khó xảy ra ở hiện tại / tương lai'),
            result: { point: 'second-conditional', note: t('If I had more time, I would learn Japanese.', 'If I had more time, I would learn Japanese.') },
          },
          { label: t('Something in the past that did not happen', 'Điều trong quá khứ đã không xảy ra'), next: 'pastResult' },
        ],
      },
      pastResult: {
        question: t('Is the result in the past too, or in the present?', 'Kết quả cũng ở quá khứ, hay ở hiện tại?'),
        options: [
          { label: t('In the past', 'Ở quá khứ'), result: { point: 'third-conditional', note: t('If I had studied, I would have passed.', 'If I had studied, I would have passed.') } },
          { label: t('In the present', 'Ở hiện tại'), result: { point: 'mixed-conditionals', note: t('If I had studied medicine, I would be a doctor now.', 'If I had studied medicine, I would be a doctor now.') } },
        ],
      },
    },
  },
  {
    id: 'verb-form',
    title: t('-ing or to + verb?', 'V-ing hay to V?'),
    intro: t('Check where the verb is in the sentence.', 'Xem động từ đứng ở vị trí nào trong câu.'),
    start: 'preposition',
    nodes: {
      preposition: {
        question: t('Does it come right after a preposition (in, of, about, before, without…)?', 'Nó đứng ngay sau một giới từ (in, of, about, before, without…)?'),
        options: [
          { label: yes, result: { point: 'adjective-preposition-ing', note: t("I'm interested in learning. Think before speaking.", "I'm interested in learning. Think before speaking.") } },
          { label: no, next: 'subject' },
        ],
      },
      subject: {
        question: t('Is it the subject of the sentence?', 'Nó làm chủ ngữ của câu?'),
        options: [
          { label: yes, result: { point: 'gerund-infinitive', note: t('Swimming is good for you.', 'Swimming is good for you.') } },
          { label: no, next: 'makeLet' },
        ],
      },
      makeLet: {
        question: t('Does it follow make, let, help or a modal verb (can, must…)?', 'Nó đứng sau make, let, help hoặc động từ khuyết thiếu (can, must…)?'),
        options: [
          { label: yes, result: { point: 'make-let', note: t('My mum made me clean my room. You must go.', 'My mum made me clean my room. You must go.') } },
          { label: no, next: 'changeMeaning' },
        ],
      },
      changeMeaning: {
        question: t('Is the main verb stop, remember, forget, try or regret?', 'Động từ chính là stop, remember, forget, try hay regret?'),
        options: [
          { label: yes, result: { point: 'verb-meaning-change', note: t('Both are possible with different meanings: stop smoking / stop to smoke.', 'Cả hai đều được nhưng khác nghĩa: stop smoking / stop to smoke.') } },
          { label: no, next: 'purpose' },
        ],
      },
      purpose: {
        question: t('Does it say why (the purpose)?', 'Nó nói lý do / mục đích (để làm gì)?'),
        options: [
          { label: yes, result: { point: 'purpose', note: t('I went out to buy milk.', 'I went out to buy milk.') } },
          {
            label: no,
            result: {
              point: 'gerund-infinitive',
              note: t('It depends on the first verb: enjoy/avoid + -ing, want/decide + to.', 'Tuỳ động từ đứng trước: enjoy/avoid + V-ing, want/decide + to V.'),
            },
          },
        ],
      },
    },
  },
];
