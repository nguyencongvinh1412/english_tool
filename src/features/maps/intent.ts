/**
 * Spots a request for a mind map in free text typed into the grammar assistant, e.g.
 * "vẽ sơ đồ tư duy về các thì" or "update my map from what I learned". A map word alone is not enough
 * (a question about "sentence diagrams" is still a question): there must also be a verb that asks for one.
 */

const MAP_WORDS = /(sơ đồ|so do|bản đồ tư duy|mind ?map|diagram)/i;
const CREATE_VERBS = /(tạo|vẽ|ve |làm|lập|xây|soạn|create|make|build|draw|generate|give me)/i;
const UPDATE_VERBS = /(cập nhật|cap nhat|update|sửa|chỉnh|bổ sung|thêm vào|làm mới|refresh|improve|revise)/i;
const LEARNED_WORDS = /(đã học|dựa vào những gì|dựa trên những gì|what i('?ve| have) (learned|studied)|based on (what|my))/i;

export type MapIntent = 'update' | 'learned' | 'topic';

export function mapIntent(text: string): MapIntent | null {
  if (!MAP_WORDS.test(text)) return null;
  if (UPDATE_VERBS.test(text)) return 'update';
  if (!CREATE_VERBS.test(text)) return null;
  return LEARNED_WORDS.test(text) ? 'learned' : 'topic';
}
