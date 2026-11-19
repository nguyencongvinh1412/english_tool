import { apiFetch } from './http';
import { AI_USED_EVENT, getSelectedModel } from '@/services/api';

export interface ReviewChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Pictures attached to a user message (JPEG data URLs) */
  images?: string[];
}

export const reviewChatApi = {
  /** Asks the AI about a part of an answer review; `material` is the text of that part */
  send: (messages: ReviewChatMessage[], material: string) =>
    apiFetch<{ message: string }>('/api/chat/review', {
      method: 'POST',
      json: { messages: messages.map(({ role, content, images }) => ({ role, content, ...(images?.length ? { images } : {}) })), material, model: getSelectedModel() ?? undefined },
    }).then((r) => {
      window.dispatchEvent(new Event(AI_USED_EVENT));
      return r.message;
    }),
};
