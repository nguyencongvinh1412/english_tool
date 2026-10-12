/**
 * Kana tables (hiragana; katakana is derived) with Hepburn romaji
 */

export type KanaScript = 'hiragana' | 'katakana';
export type KanaGroup = 'basic' | 'dakuten' | 'combo';

export interface KanaCell {
  kana: string;
  romaji: string;
}

/** Rows of five; null keeps the gojūon grid aligned (や row, わ row) */
type Row = (KanaCell | null)[];

const row = (...cells: (string | null)[]): Row =>
  cells.map((cell) => {
    if (!cell) return null;
    const [kana, romaji] = cell.split(':');
    return { kana, romaji };
  });

export const KANA_ROWS: Record<KanaGroup, Row[]> = {
  basic: [
    row('あ:a', 'い:i', 'う:u', 'え:e', 'お:o'),
    row('か:ka', 'き:ki', 'く:ku', 'け:ke', 'こ:ko'),
    row('さ:sa', 'し:shi', 'す:su', 'せ:se', 'そ:so'),
    row('た:ta', 'ち:chi', 'つ:tsu', 'て:te', 'と:to'),
    row('な:na', 'に:ni', 'ぬ:nu', 'ね:ne', 'の:no'),
    row('は:ha', 'ひ:hi', 'ふ:fu', 'へ:he', 'ほ:ho'),
    row('ま:ma', 'み:mi', 'む:mu', 'め:me', 'も:mo'),
    row('や:ya', null, 'ゆ:yu', null, 'よ:yo'),
    row('ら:ra', 'り:ri', 'る:ru', 'れ:re', 'ろ:ro'),
    row('わ:wa', null, null, null, 'を:wo'),
    row('ん:n', null, null, null, null),
  ],
  dakuten: [
    row('が:ga', 'ぎ:gi', 'ぐ:gu', 'げ:ge', 'ご:go'),
    row('ざ:za', 'じ:ji', 'ず:zu', 'ぜ:ze', 'ぞ:zo'),
    row('だ:da', 'ぢ:ji', 'づ:zu', 'で:de', 'ど:do'),
    row('ば:ba', 'び:bi', 'ぶ:bu', 'べ:be', 'ぼ:bo'),
    row('ぱ:pa', 'ぴ:pi', 'ぷ:pu', 'ぺ:pe', 'ぽ:po'),
  ],
  combo: [
    row('きゃ:kya', 'きゅ:kyu', 'きょ:kyo'),
    row('しゃ:sha', 'しゅ:shu', 'しょ:sho'),
    row('ちゃ:cha', 'ちゅ:chu', 'ちょ:cho'),
    row('にゃ:nya', 'にゅ:nyu', 'にょ:nyo'),
    row('ひゃ:hya', 'ひゅ:hyu', 'ひょ:hyo'),
    row('みゃ:mya', 'みゅ:myu', 'みょ:myo'),
    row('りゃ:rya', 'りゅ:ryu', 'りょ:ryo'),
    row('ぎゃ:gya', 'ぎゅ:gyu', 'ぎょ:gyo'),
    row('じゃ:ja', 'じゅ:ju', 'じょ:jo'),
    row('びゃ:bya', 'びゅ:byu', 'びょ:byo'),
    row('ぴゃ:pya', 'ぴゅ:pyu', 'ぴょ:pyo'),
  ],
};

/**
 * Hiragana → katakana (the blocks are 0x60 apart)
 */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

/**
 * Cells of the chosen groups in one script, without grid gaps
 */
export function kanaCells(script: KanaScript, groups: KanaGroup[]): KanaCell[] {
  return groups.flatMap((group) =>
    KANA_ROWS[group].flatMap((r) => r.filter((cell): cell is KanaCell => cell !== null)).map((cell) =>
      script === 'katakana' ? { ...cell, kana: toKatakana(cell.kana) } : cell
    )
  );
}

export type KanaQuestion =
  | { type: 'read'; cell: KanaCell; options: string[] } // see kana, pick romaji
  | { type: 'listen'; cell: KanaCell; options: string[] }; // hear it, pick kana

const shuffle = <T>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Builds a quiz: half reading questions, half listening ones, with three distinct wrong options each
 */
export function buildKanaQuiz(cells: KanaCell[], count: number): KanaQuestion[] {
  // ぢ/じ and づ/ず share romaji, so options are compared by the answer text, not by cell
  return shuffle(cells)
    .slice(0, count)
    .map((cell, index) => {
      const type = index % 2 === 0 ? 'read' : 'listen';
      const answer = type === 'read' ? cell.romaji : cell.kana;
      const pool = [...new Set(cells.map((c) => (type === 'read' ? c.romaji : c.kana)).filter((value) => value !== answer))];
      return { type, cell, options: shuffle([answer, ...shuffle(pool).slice(0, 3)]) };
    });
}

/**
 * The correct option of a question
 */
export const answerOf = (question: KanaQuestion): string => (question.type === 'read' ? question.cell.romaji : question.cell.kana);
