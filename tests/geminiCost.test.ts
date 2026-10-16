import { describe, expect, it } from 'vitest';
import { downloadSegments, estimateGeminiCost } from '../src/tts/geminiCost';

const date = new Date('2026-10-16T00:00:00Z');

describe('Gemini download estimate', () => {
  it('counts the exact requests after pronunciation and segmentation', () => {
    const texts = downloadSegments([{ text: 'YSS' }, { text: '' }, { text: 'పాఠ్యం '.repeat(100) }], [{ from: 'YSS', to: 'వై ఎస్ ఎస్' }]);
    expect(texts[0]).toBe('వై ఎస్ ఎస్');
    expect(estimateGeminiCost(texts, 'gemini-3.8-flash-tts', date)?.requests).toBe(texts.length);
    expect(texts.every((text) => text.length <= 220)).toBe(true);
  });

  it('uses documented input/audio Standard prices and explicit pacing assumptions', () => {
    const cost = estimateGeminiCost(['a '.repeat(170).trim()], 'gemini-3.8-flash-tts', date)!;
    expect(cost.words).toBe(170);
    expect(cost.minutesLow).toBe(1);
    expect(cost.usdLow).toBeCloseTo((339 / 4 * 0.5 + 60 * 25 * 9) / 1_000_000);
    expect(cost.usdHigh).toBeGreaterThan(cost.usdLow);
    const lite = estimateGeminiCost(['a '.repeat(170).trim()], 'gemini-3.8-flash-lite-tts', date)!;
    expect(lite.usdHigh).toBeLessThan(cost.usdHigh);
  });

  it('applies announced 2027 price change without guessing unknown model prices', () => {
    const before = estimateGeminiCost(['నమస్కారం'], 'gemini-3.8-flash-tts', date)!;
    const after = estimateGeminiCost(['నమస్కారం'], 'gemini-3.8-flash-tts', new Date('2027-01-01T00:00:00Z'))!;
    expect(after.usdLow).toBe(before.usdLow * 2);
    expect(estimateGeminiCost(['text'], 'unknown', date)).toBeNull();
  });

  it('estimates no charges or requests for an empty document', () => {
    const cost = estimateGeminiCost([], 'gemini-3.8-flash-tts', date)!;
    expect(cost.usdHigh).toBe(0);
    expect(cost.requests).toBe(0);
  });
});
