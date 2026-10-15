import type { PronunciationRule } from '../types';

export const MAX_SEGMENT_LENGTH = 220;

const SENTENCE_END = /(?<=[.!?।॥…;:\u0964\u0965"”’)\]])\s+|\n+/u;
const CLAUSE_END = /(?<=[,;:—–])\s+/u;

function hardSplit(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    // Prefer a space; never split inside a Telugu grapheme cluster.
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= max * 0.4) {
      cut = max;
      while (
        cut > 1 &&
        (/[\u0C00-\u0C04\u0C3C-\u0C56\u0C62\u0C63\u200C\u200D]/u.test(rest[cut]) || /[\u0C4D\u200D]/u.test(rest[cut - 1]))
      ) {
        cut--;
      }
    }
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function splitPiece(piece: string, max: number): string[] {
  if (piece.length <= max) return [piece];
  const clauses = piece.split(CLAUSE_END).filter(Boolean);
  if (clauses.length > 1) return clauses.flatMap((c) => splitPiece(c, max));
  return hardSplit(piece, max);
}

/**
 * Splits a paragraph into speech segments of at most `max` characters,
 * preferring sentence boundaries, then clauses, then spaces. Short sentences
 * are merged so speech stays natural. No characters other than whitespace are
 * dropped (verified by tests).
 */
export function segmentText(text: string, max = MAX_SEGMENT_LENGTH): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pieces = trimmed
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => splitPiece(s, max));
  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length + 1 + piece.length <= max) merged[merged.length - 1] = `${last} ${piece}`;
    else merged.push(piece);
  }
  return merged;
}

/** Applies user pronunciation replacements to the spoken text only; the document is never changed. */
export function applyPronunciations(text: string, rules: PronunciationRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.from) continue;
    result = result.split(rule.from).join(rule.to);
  }
  return result;
}
