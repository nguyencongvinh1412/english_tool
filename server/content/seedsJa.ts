/**
 * Built-in Japanese Content
 * Original starter lessons so the Japanese skills work before any AI generation.
 * Every kanji carries its reading (漢字{かんじ}); the content schemas check this on startup.
 */
import type { ContentKind, JlptLevel } from './schemas.js';

interface JaSeedItem {
  id: string;
  kind: ContentKind;
  level: JlptLevel;
  topic: string;
  payload: unknown;
}

const both = (vi: string, en: string) => ({ vi, en });

export const JA_SEED_ITEMS: JaSeedItem[] = [
  {
    id: 'builtin-ja-dictation-morning',
    kind: 'ja-dictation',
    level: 'N5',
    topic: 'daily routine',
    payload: {
      title: 'Buổi sáng của tôi · My morning',
      sentences: [
        { text: '私{わたし}は毎朝{まいあさ}六時{ろくじ}に起{お}きます。', translation: both('Tôi dậy lúc sáu giờ mỗi sáng.', 'I get up at six every morning.') },
        { text: '顔{かお}を洗{あら}って、歯{は}を磨{みが}きます。', translation: both('Tôi rửa mặt và đánh răng.', 'I wash my face and brush my teeth.') },
        { text: '朝{あさ}ごはんはパンと卵{たまご}です。', translation: both('Bữa sáng là bánh mì và trứng.', 'Breakfast is bread and eggs.') },
        { text: '七時半{しちじはん}に家{いえ}を出{で}ます。', translation: both('Tôi ra khỏi nhà lúc bảy giờ rưỡi.', 'I leave home at half past seven.') },
        { text: '駅{えき}まで歩{ある}いて十分{じゅっぷん}です。', translation: both('Đi bộ đến ga mất mười phút.', 'It is a ten-minute walk to the station.') },
      ],
    },
  },
  {
    id: 'builtin-ja-dictation-weekend',
    kind: 'ja-dictation',
    level: 'N4',
    topic: 'weekend trip',
    payload: {
      title: 'Cuối tuần ở biển · A weekend at the sea',
      sentences: [
        {
          text: '先週{せんしゅう}の土曜日{どようび}、友達{ともだち}と海{うみ}へ行{い}きました。',
          translation: both('Thứ bảy tuần trước, tôi đi biển với bạn.', 'Last Saturday I went to the sea with a friend.'),
        },
        {
          text: '天気{てんき}がよかったので、たくさん泳{およ}ぐことができました。',
          translation: both('Vì trời đẹp nên chúng tôi bơi được nhiều.', 'The weather was nice, so we could swim a lot.'),
        },
        {
          text: 'お昼{ひる}は海{うみ}の近{ちか}くのレストランで魚{さかな}を食{た}べました。',
          translation: both('Buổi trưa chúng tôi ăn cá ở nhà hàng gần biển.', 'For lunch we ate fish at a restaurant near the sea.'),
        },
        { text: '帰{かえ}りの電車{でんしゃ}はとても混{こ}んでいました。', translation: both('Chuyến tàu về rất đông.', 'The train home was very crowded.') },
        { text: '疲{つか}れましたが、楽{たの}しい一日{いちにち}でした。', translation: both('Tuy mệt nhưng là một ngày vui.', 'I was tired, but it was a fun day.') },
      ],
    },
  },
  {
    id: 'builtin-ja-listening-cafe',
    kind: 'ja-listening',
    level: 'N5',
    topic: 'ordering at a café',
    payload: {
      title: 'Ở quán cà phê · At a café',
      format: 'dialogue',
      speakers: { A: { name: 'Clerk', gender: 'female' }, B: { name: 'Minh', gender: 'male' } },
      script: [
        { speaker: 'A', text: 'いらっしゃいませ。ご注文{ちゅうもん}は何{なん}ですか。' },
        { speaker: 'B', text: 'コーヒーを一{ひと}つください。' },
        { speaker: 'A', text: 'ホットとアイス、どちらがいいですか。' },
        { speaker: 'B', text: 'アイスでお願{ねが}いします。それから、チーズケーキもください。' },
        { speaker: 'A', text: 'はい。全部{ぜんぶ}で八百五十円{はっぴゃくごじゅうえん}です。' },
        { speaker: 'B', text: 'カードで払{はら}ってもいいですか。' },
        { speaker: 'A', text: 'すみません、現金{げんきん}だけです。' },
        { speaker: 'B', text: 'わかりました。じゃ、千円{せんえん}でお願{ねが}いします。' },
      ],
      questions: [
        {
          prompt: '男{おとこ}の人{ひと}は何{なに}を頼{たの}みましたか。',
          options: ['ホットコーヒーだけ', 'アイスコーヒーだけ', 'アイスコーヒーとチーズケーキ', 'ホットコーヒーとチーズケーキ'],
          answerIndex: 2,
          explanation: both('Anh ấy gọi cà phê đá và bánh phô mai.', 'He orders an iced coffee and a cheesecake.'),
        },
        {
          prompt: '全部{ぜんぶ}でいくらですか。',
          options: ['八百円{はっぴゃくえん}', '八百五十円{はっぴゃくごじゅうえん}', '九百五十円{きゅうひゃくごじゅうえん}', '千円{せんえん}'],
          answerIndex: 1,
          explanation: both('Nhân viên nói tổng cộng 850 yên.', 'The clerk says it is 850 yen in total.'),
        },
        {
          prompt: '男{おとこ}の人{ひと}はどうやって払{はら}いますか。',
          options: ['カードで払{はら}います', '現金{げんきん}で払{はら}います', 'スマホで払{はら}います', '払{はら}いません'],
          answerIndex: 1,
          explanation: both('Quán chỉ nhận tiền mặt nên anh ấy trả 1000 yên tiền mặt.', 'The café only takes cash, so he pays with a 1,000-yen note.'),
        },
      ],
    },
  },
  {
    id: 'builtin-ja-reading-family',
    kind: 'ja-reading',
    level: 'N5',
    topic: 'family',
    payload: {
      title: '私{わたし}の家族{かぞく}',
      paragraphs: [
        '私{わたし}の家族{かぞく}は四人{よにん}です。父{ちち}と母{はは}と妹{いもうと}と私{わたし}です。父{ちち}は銀行{ぎんこう}で働{はたら}いています。母{はは}は料理{りょうり}が上手{じょうず}です。妹{いもうと}は十五歳{じゅうごさい}で、高校生{こうこうせい}です。週末{しゅうまつ}はみんなで公園{こうえん}へ散歩{さんぽ}に行{い}きます。',
      ],
      questions: [
        {
          prompt: '家族{かぞく}は何人{なんにん}ですか。',
          options: ['三人{さんにん}', '四人{よにん}', '五人{ごにん}', '六人{ろくにん}'],
          answerIndex: 1,
          explanation: both('Câu đầu: gia đình có bốn người.', 'The first sentence says the family has four people.'),
        },
        {
          prompt: 'お父{とう}さんの仕事{しごと}は何{なん}ですか。',
          options: ['先生{せんせい}です', '医者{いしゃ}です', '銀行{ぎんこう}で働{はたら}いています', '料理{りょうり}を作{つく}ります'],
          answerIndex: 2,
          explanation: both('Bố làm việc ở ngân hàng (銀行で働いています).', 'The father works at a bank (銀行で働いています).'),
        },
        {
          prompt: '週末{しゅうまつ}、家族{かぞく}は何{なに}をしますか。',
          options: ['公園{こうえん}へ散歩{さんぽ}に行{い}きます', '海{うみ}へ行{い}きます', '料理{りょうり}を作{つく}ります', '銀行{ぎんこう}へ行{い}きます'],
          answerIndex: 0,
          explanation: both('Cuối tuần cả nhà đi dạo ở công viên.', 'At weekends the whole family goes for a walk in the park.'),
        },
      ],
    },
  },
  {
    id: 'builtin-ja-reading-library',
    kind: 'ja-reading',
    level: 'N4',
    topic: 'a new library',
    payload: {
      title: '新{あたら}しい図書館{としょかん}',
      paragraphs: [
        '町{まち}に新{あたら}しい図書館{としょかん}ができました。駅{えき}から歩{ある}いて五分{ごふん}のところにあって、とても便利{べんり}です。',
        'この図書館{としょかん}は朝{あさ}九時{くじ}から夜{よる}九時{くじ}まで開{あ}いています。月曜日{げつようび}は休{やす}みです。二階{にかい}には静{しず}かに勉強{べんきょう}できる部屋{へや}があるので、学生{がくせい}がたくさん来{き}ます。',
        '本{ほん}は一回{いっかい}に十冊{じゅっさつ}まで借{か}りることができます。借{か}りた本{ほん}は二週間{にしゅうかん}以内{いない}に返{かえ}さなければなりません。',
      ],
      questions: [
        {
          prompt: '図書館{としょかん}が休{やす}みなのは何曜日{なんようび}ですか。',
          options: ['日曜日{にちようび}', '月曜日{げつようび}', '土曜日{どようび}', '水曜日{すいようび}'],
          answerIndex: 1,
          explanation: both('Đoạn 2: thứ hai thư viện nghỉ.', 'Paragraph 2: the library is closed on Mondays.'),
        },
        {
          prompt: '学生{がくせい}がたくさん来{く}るのはどうしてですか。',
          options: [
            '駅{えき}から遠{とお}いから',
            '静{しず}かに勉強{べんきょう}できる部屋{へや}があるから',
            '本{ほん}が安{やす}いから',
            '朝{あさ}早{はや}くから開{あ}いているから',
          ],
          answerIndex: 1,
          explanation: both('Có phòng học yên tĩnh ở tầng 2 nên nhiều học sinh đến.', 'There is a quiet study room on the second floor, so many students come.'),
        },
        {
          prompt: '本{ほん}について正{ただ}しいものはどれですか。',
          options: [
            '一回{いっかい}に二十冊{にじゅっさつ}借{か}りられる',
            '一週間{いっしゅうかん}以内{いない}に返{かえ}す',
            '一回{いっかい}に十冊{じゅっさつ}まで借{か}りられる',
            '借{か}りることはできない',
          ],
          answerIndex: 2,
          explanation: both('Mỗi lần mượn được tối đa 10 cuốn và trả trong 2 tuần.', 'You can borrow up to ten books at a time and return them within two weeks.'),
        },
      ],
    },
  },
  {
    id: 'builtin-ja-writing-self-intro',
    kind: 'ja-writing',
    level: 'N5',
    topic: 'self-introduction',
    payload: {
      title: 'Tự giới thiệu · Self-introduction',
      instructions: both(
        'Viết đoạn tự giới thiệu: tên, quê, công việc hoặc trường học và sở thích. Dùng thể です/ます.',
        'Write a self-introduction: your name, hometown, job or school, and hobbies. Use the です/ます style.'
      ),
      prompt: '自己紹介{じこしょうかい}を書{か}いてください。',
      minChars: 60,
      timeMinutes: 15,
    },
  },
  {
    id: 'builtin-ja-writing-trip',
    kind: 'ja-writing',
    level: 'N3',
    topic: 'a memorable trip',
    payload: {
      title: 'Một chuyến đi đáng nhớ · A memorable trip',
      instructions: both(
        'Kể về chuyến đi bạn nhớ nhất: đi đâu, với ai, đã làm gì và vì sao bạn nhớ mãi.',
        'Write about your most memorable trip: where, with whom, what you did and why you remember it.'
      ),
      prompt: '今{いま}までで一番{いちばん}思{おも}い出{で}に残{のこ}っている旅行{りょこう}について書{か}いてください。',
      minChars: 200,
      timeMinutes: 30,
    },
  },
];
