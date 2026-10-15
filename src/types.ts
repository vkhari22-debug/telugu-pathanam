export type DocumentFormat = 'docx' | 'epub' | 'txt';

export interface Paragraph {
  /** Exact text from the source document (Telugu Unicode preserved). */
  text: string;
  /** Heading level 1–9, or 0 for ordinary body text. */
  level: number;
}

export interface Chapter {
  title: string;
  /** Hierarchy level starting at 1. */
  level: number;
  /** Index into the document paragraphs where this chapter starts. */
  paragraphIndex: number;
  /** How the chapter was found, so the UI can be honest about guesses. */
  source: 'heading' | 'toc' | 'pattern';
}

export interface ParsedDocument {
  title: string;
  format: DocumentFormat;
  language: string;
  paragraphs: Paragraph[];
  chapters: Chapter[];
  warnings: string[];
}

export interface StoredDocument extends ParsedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  fileName: string;
  format: DocumentFormat;
  paragraphCount: number;
  createdAt: number;
}

export interface ReadingProgress {
  docId: string;
  paragraphIndex: number;
  updatedAt: number;
}

export interface Bookmark {
  id?: number;
  docId: string;
  paragraphIndex: number;
  label: string;
  createdAt: number;
}

export interface PronunciationRule {
  from: string;
  to: string;
}

export type SpeechEngine = 'device' | 'cloud' | 'gemini';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  engine: SpeechEngine;
  voiceURI: string;
  rate: number;
  pitch: number;
  cloudEndpoint: string;
  cloudVoice: string;
  geminiModel: string;
  geminiVoice: string;
  pronunciations: PronunciationRule[];
  theme: ThemeChoice;
  autoScroll: boolean;
  fontScale: number;
  /** Uses the Screen Wake Lock API while reading (screen stays on). */
  keepScreenOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: 'device',
  voiceURI: '',
  rate: 1,
  pitch: 1,
  cloudEndpoint: '',
  cloudVoice: 'te-IN-Standard-A',
  geminiModel: 'gemini-3.8-flash-tts',
  geminiVoice: 'Kore',
  pronunciations: [],
  theme: 'system',
  autoScroll: true,
  fontScale: 1,
  keepScreenOn: false,
};

export type ImportProgress = (stage: string, fraction: number) => void;
