/**
 * AI cost estimates in credits (1 credit is about 1/1000 USD).
 * Prices are the public API prices per million tokens; check the providers' pricing pages before
 * relying on them. Providers do not always report token counts through the proxy, so tokens are
 * estimated from the text length.
 */
import type { ChatMessage } from '../services/cliproxy.js';

interface Price {
  /** USD per million input and output tokens */
  input: number;
  output: number;
}

/** Longest matching prefix wins; the last entry is the default for unknown models */
const PRICES: [prefix: string, price: Price][] = [
  ['claude-haiku', { input: 0.1, output: 0.5 }],
  ['claude-sonnet', { input: 2, output: 10 }],
  ['claude-opus', { input: 15, output: 75 }],
  ['claude', { input: 2, output: 10 }],
  ['gemini', { input: 0.5, output: 3 }],
  ['gpt', { input: 1.25, output: 10 }],
];
const UNKNOWN_MODEL: Price = { input: 2, output: 10 };

/** Roughly 3.2 characters per token for mixed English and Vietnamese */
const CHARS_PER_TOKEN = 3.2;
/** An image in a message costs about this many input tokens */
const IMAGE_TOKENS = 1500;
/** 1 credit = 0.001 USD */
const USD_PER_CREDIT = 0.001;

const priceOf = (model: string): Price => PRICES.filter(([prefix]) => model.startsWith(prefix)).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? UNKNOWN_MODEL;

/** Input tokens of a request */
export function inputTokens(systemPrompt: string | undefined, messages: ChatMessage[]): number {
  let chars = systemPrompt?.length ?? 0;
  let images = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') chars += message.content.length;
    else {
      for (const part of message.content) {
        if (part.type === 'text') chars += part.text.length;
        else images++;
      }
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
}

/**
 * Estimated cost of one request in credits
 */
export function estimateCredits(model: string, input: number, reply: string): number {
  const price = priceOf(model);
  const output = Math.ceil(reply.length / CHARS_PER_TOKEN);
  const usd = (input * price.input + output * price.output) / 1_000_000;
  // Rounded to 1/100 credit so tiny requests still add up
  return Math.round((usd / USD_PER_CREDIT) * 100) / 100;
}
