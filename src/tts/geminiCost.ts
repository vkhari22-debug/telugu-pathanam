import { applyPronunciations, segmentText } from './segment';
import type { PronunciationRule } from '../types';

export function downloadSegments(paragraphs: { text: string }[], rules: PronunciationRule[]): string[] {
  return paragraphs.flatMap((paragraph) => segmentText(applyPronunciations(paragraph.text, rules)));
}

/** Planning estimate, not tokenization or a billing quote. Rates verified 2026-10-16. */
export function estimateGeminiCost(texts: string[], model: string, now = new Date()) {
  const outputRate = model === 'gemini-3.8-flash-tts' ? 9
    : model === 'gemini-3.8-flash-lite-tts' ? 6 : null;
  if (outputRate === null) return null;
  const text = texts.join(' ');
  const words = text.match(/\S+/gu)?.length ?? 0;
  const characters = [...text].length;
  const minutesLow = words / 170;
  const minutesHigh = words / 110;
  const multiplier = now.getTime() >= Date.UTC(2027, 0, 1) ? 2 : 1;
  const inputRate = 0.5 * multiplier;
  const audioRate = outputRate * multiplier;
  return {
    requests: texts.length,
    words,
    minutesLow,
    minutesHigh,
    inputRate,
    audioRate,
    usdLow: ((characters / 4) * inputRate + minutesLow * 60 * 25 * audioRate) / 1_000_000,
    usdHigh: (characters * inputRate + minutesHigh * 60 * 25 * audioRate) / 1_000_000,
  };
}
