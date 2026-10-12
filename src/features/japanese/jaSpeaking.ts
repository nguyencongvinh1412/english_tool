/**
 * Built-in Japanese speaking material: pronunciation phrases, role-play scenarios, chat topics.
 * Japanese text marks readings as 漢字{かんじ}.
 */
import type { Bilingual, JlptLevel } from '@/shared/contentApi';

export interface JaPhrase {
  text: string;
  level: JlptLevel;
  translation: Bilingual;
}

const both = (vi: string, en: string): Bilingual => ({ vi, en });

export const JA_PHRASES: JaPhrase[] = [
  { level: 'N5', text: 'おはようございます。', translation: both('Chào buổi sáng.', 'Good morning.') },
  { level: 'N5', text: 'はじめまして。どうぞよろしくお願{ねが}いします。', translation: both('Rất vui được gặp bạn. Mong được giúp đỡ.', 'Nice to meet you.') },
  { level: 'N5', text: 'すみません、駅{えき}はどこですか。', translation: both('Xin lỗi, nhà ga ở đâu ạ?', 'Excuse me, where is the station?') },
  { level: 'N5', text: 'これはいくらですか。', translation: both('Cái này bao nhiêu tiền?', 'How much is this?') },
  { level: 'N5', text: '水{みず}をください。', translation: both('Cho tôi xin nước.', 'Water, please.') },
  { level: 'N5', text: '日本語{にほんご}を勉強{べんきょう}しています。', translation: both('Tôi đang học tiếng Nhật.', 'I am studying Japanese.') },
  { level: 'N5', text: '明日{あした}は雨{あめ}が降{ふ}りますか。', translation: both('Ngày mai trời có mưa không?', 'Will it rain tomorrow?') },
  { level: 'N4', text: '週末{しゅうまつ}は何{なに}をするつもりですか。', translation: both('Cuối tuần bạn định làm gì?', 'What are you planning to do this weekend?') },
  { level: 'N4', text: 'もう少{すこ}しゆっくり話{はな}してください。', translation: both('Xin hãy nói chậm hơn một chút.', 'Please speak a little more slowly.') },
  { level: 'N4', text: '写真{しゃしん}を撮{と}ってもいいですか。', translation: both('Tôi chụp ảnh được không?', 'May I take a photo?') },
  { level: 'N4', text: '電車{でんしゃ}が遅{おく}れたので、遅刻{ちこく}してしまいました。', translation: both('Vì tàu trễ nên tôi đã đến muộn.', 'The train was late, so I ended up being late.') },
  { level: 'N4', text: '日本{にほん}に行{い}ったことがありますか。', translation: both('Bạn đã từng đến Nhật chưa?', 'Have you ever been to Japan?') },
  { level: 'N4', text: '駅{えき}に着{つ}いたら、電話{でんわ}してください。', translation: both('Đến ga thì gọi điện cho tôi nhé.', 'Please call me when you get to the station.') },
  { level: 'N3', text: '予約{よやく}を変更{へんこう}していただけませんか。', translation: both('Anh/chị có thể đổi đặt chỗ giúp tôi được không?', 'Could you change my reservation?') },
  {
    level: 'N3',
    text: '体調{たいちょう}が悪{わる}いので、今日{きょう}は早{はや}めに帰{かえ}らせてください。',
    translation: both('Tôi không khoẻ, hôm nay cho phép tôi về sớm.', 'I am not feeling well, so please let me go home early today.'),
  },
  { level: 'N3', text: '説明{せつめい}を聞{き}いて、やっと分{わ}かりました。', translation: both('Nghe giải thích xong tôi mới hiểu.', 'After hearing the explanation, I finally understood.') },
  { level: 'N3', text: '忙{いそが}しいのに、手伝{てつだ}ってくれてありがとう。', translation: both('Cảm ơn bạn đã giúp dù đang bận.', 'Thanks for helping even though you are busy.') },
  {
    level: 'N3',
    text: '雨{あめ}が降{ふ}りそうだから、傘{かさ}を持{も}っていったほうがいいよ。',
    translation: both('Trời sắp mưa, nên mang ô theo đấy.', 'It looks like rain, so you had better take an umbrella.'),
  },
  {
    level: 'N3',
    text: 'この仕事{しごと}は思{おも}ったより時間{じかん}がかかりそうです。',
    translation: both('Việc này có vẻ tốn thời gian hơn tôi nghĩ.', 'This job looks like it will take longer than I thought.'),
  },
  { level: 'N5', text: 'ありがとうございました。', translation: both('Xin cảm ơn.', 'Thank you very much.') },
];

export interface JaScenario {
  id: string;
  level: JlptLevel;
  /** Japanese title with readings */
  title: string;
  description: Bilingual;
  /** For the server prompt (English, single line) */
  aiRole: string;
  userRole: string;
  context: string;
  suggestions: string[];
}

export const JA_SCENARIOS: JaScenario[] = [
  {
    id: 'konbini',
    level: 'N5',
    title: 'コンビニで',
    description: both('Mua cơm hộp ở cửa hàng tiện lợi.', 'Buy a bento at a convenience store.'),
    aiRole: 'convenience store clerk in Tokyo',
    userRole: 'customer buying lunch',
    context: 'The customer buys a bento and a drink; the clerk asks about heating the bento, a bag and how they will pay.',
    suggestions: ['これをお願{ねが}いします。', '温{あたた}めてください。', '袋{ふくろ}はいりません。'],
  },
  {
    id: 'station',
    level: 'N5',
    title: '駅{えき}で',
    description: both('Hỏi đường đến ga Shinjuku.', 'Ask how to get to Shinjuku station.'),
    aiRole: 'station staff at a Tokyo train station',
    userRole: 'traveller asking how to get to Shinjuku',
    context: 'The traveller wants to know the platform, the fare and how long the trip takes.',
    suggestions: ['新宿{しんじゅく}までいくらですか。', '何番線{なんばんせん}ですか。', 'ありがとうございます。'],
  },
  {
    id: 'ramen',
    level: 'N4',
    title: 'ラーメン屋{や}で',
    description: both('Gọi món ở quán ramen.', 'Order at a ramen shop.'),
    aiRole: 'waiter at a ramen restaurant',
    userRole: 'customer ordering lunch',
    context: 'The customer asks for a recommendation, a non-spicy option, then pays.',
    suggestions: ['おすすめは何{なん}ですか。', '辛{から}くないのはありますか。', 'お会計{かいけい}をお願{ねが}いします。'],
  },
  {
    id: 'hotel',
    level: 'N4',
    title: 'ホテルのチェックイン',
    description: both('Nhận phòng khách sạn.', 'Check in at a hotel.'),
    aiRole: 'hotel front desk clerk',
    userRole: 'guest checking in with a reservation',
    context: 'The guest checks in, asks about breakfast time and whether they can leave luggage after checkout.',
    suggestions: ['予約{よやく}したグエンです。', '朝{あさ}ごはんは何時{なんじ}からですか。', '荷物{にもつ}を預{あず}けてもいいですか。'],
  },
  {
    id: 'clinic',
    level: 'N3',
    title: '病院{びょういん}で',
    description: both('Khám bệnh vì bị cảm.', 'See a doctor about a cold.'),
    aiRole: 'doctor at a small clinic',
    userRole: 'patient with a cold and fever',
    context: 'The doctor asks about symptoms and since when, then explains the medicine and rest.',
    suggestions: ['昨日{きのう}から熱{ねつ}があります。', '喉{のど}が痛{いた}いです。', '薬{くすり}はいつ飲{の}めばいいですか。'],
  },
  {
    id: 'interview',
    level: 'N3',
    title: 'アルバイトの面接{めんせつ}',
    description: both('Phỏng vấn làm thêm ở quán cà phê.', 'A part-time job interview at a café.'),
    aiRole: 'café manager interviewing for a part-time job',
    userRole: 'Vietnamese student applying for the job',
    context: 'The manager asks about the student, available days, experience and why they want the job.',
    suggestions: ['よろしくお願{ねが}いいたします。', '週{しゅう}に三日{みっか}働{はたら}けます。', '接客{せっきゃく}の経験{けいけん}があります。'],
  },
];

/** Conversation topics; the value is sent to the server (English, single line) */
export const JA_TOPICS: { value: string; label: Bilingual }[] = [
  { value: 'free conversation', label: both('Trò chuyện tự do', 'Free conversation') },
  { value: 'introducing yourself', label: both('Giới thiệu bản thân', 'Introducing yourself') },
  { value: 'hobbies', label: both('Sở thích', 'Hobbies') },
  { value: 'food', label: both('Ẩm thực', 'Food') },
  { value: 'travel', label: both('Du lịch', 'Travel') },
  { value: 'work and school', label: both('Công việc và học tập', 'Work and school') },
  { value: 'weekend plans', label: both('Kế hoạch cuối tuần', 'Weekend plans') },
];
