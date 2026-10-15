import type { Chapter, Paragraph } from '../types';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export function parseXml(source: string, what: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImportError(`${what} ఫైల్‌ను చదవలేకపోయాం (XML లోపం). ఫైల్ పాడై ఉండవచ్చు.`);
  }
  return doc;
}

const TELUGU = /[\u0C00-\u0C7F]/g;
const LATIN = /[A-Za-z]/g;

export function detectLanguage(paragraphs: Paragraph[]): string {
  let telugu = 0;
  let latin = 0;
  for (const p of paragraphs.slice(0, 400)) {
    telugu += p.text.match(TELUGU)?.length ?? 0;
    latin += p.text.match(LATIN)?.length ?? 0;
  }
  if (telugu === 0 && latin === 0) return 'te-IN';
  return telugu >= latin * 0.3 ? 'te-IN' : 'en-US';
}

const CHAPTER_PATTERN =
  /^\s*(పాఠం|అధ్యాయం|అధ్యాయము|భాగం|ప్రకరణం|Chapter|CHAPTER|Lesson|LESSON|Part|PART)\s*[-–:.]?\s*([0-9౦-౯]+|[IVXLC]+)(?![0-9A-Za-z])/u;

/**
 * Only used when a document has no real headings. Short paragraphs that begin
 * like "పాఠం 21:" or "Chapter 3" are offered as suggested chapters; they are
 * labelled as guesses in the UI. Bold text alone is never treated as a heading.
 */
export function detectPatternChapters(paragraphs: Paragraph[]): Chapter[] {
  const chapters: Chapter[] = [];
  paragraphs.forEach((p, index) => {
    const text = p.text.trim();
    if (text.length > 0 && text.length <= 160 && CHAPTER_PATTERN.test(text)) {
      chapters.push({ title: text, level: 1, paragraphIndex: index, source: 'pattern' });
    }
  });
  return chapters;
}

export function headingChapters(paragraphs: Paragraph[]): Chapter[] {
  const chapters: Chapter[] = [];
  paragraphs.forEach((p, index) => {
    if (p.level > 0 && p.text.trim()) {
      chapters.push({ title: p.text.trim(), level: p.level, paragraphIndex: index, source: 'heading' });
    }
  });
  return chapters;
}

export function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}
