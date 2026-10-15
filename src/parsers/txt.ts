import type { ImportProgress, ParsedDocument } from '../types';
import { detectLanguage, detectPatternChapters, fileBaseName, ImportError } from './common';

export function decodeText(data: ArrayBuffer): { text: string; warning?: string } {
  const bytes = new Uint8Array(data);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)) };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)) };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes) };
  } catch {
    return {
      text: new TextDecoder('utf-8').decode(bytes),
      warning: 'ఈ టెక్స్ట్ ఫైల్ UTF-8 కాదు. కొన్ని అక్షరాలు తప్పుగా కనిపించవచ్చు; ఫైల్‌ను UTF-8గా సేవ్ చేసి మళ్లీ తెరవండి.',
    };
  }
}

export function splitPlainText(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n[ \t\u00a0]*\n/);
  const nonEmpty = blocks.map((b) => b.trim()).filter(Boolean);
  // A file with no blank lines at all: treat every line as a paragraph.
  if (nonEmpty.length === 1 && nonEmpty[0].includes('\n')) {
    return nonEmpty[0].split('\n').map((line) => line.trim()).filter(Boolean);
  }
  return nonEmpty;
}

export async function parseTxt(data: ArrayBuffer, fileName: string, progress?: ImportProgress): Promise<ParsedDocument> {
  progress?.('టెక్స్ట్ చదువుతున్నాం…', 0.3);
  const { text, warning } = decodeText(data);
  const paragraphs = splitPlainText(text).map((t) => ({ text: t, level: 0 }));
  if (paragraphs.length === 0) throw new ImportError('ఈ టెక్స్ట్ ఫైల్ ఖాళీగా ఉంది.');
  const chapters = detectPatternChapters(paragraphs);
  const warnings = warning ? [warning] : [];
  if (chapters.length === 0) warnings.push('టెక్స్ట్ ఫైల్‌లో అధ్యాయాలు లేవు. పేరాగ్రాఫ్ జాబితా, వెతుకు ఉపయోగించండి.');
  else warnings.push('“అధ్యాయం 1”, “పాఠం 1” వంటి పంక్తులను సూచిత అధ్యాయాలుగా చూపిస్తున్నాం.');
  progress?.('పూర్తయింది', 1);
  return { title: fileBaseName(fileName), format: 'txt', language: detectLanguage(paragraphs), paragraphs, chapters, warnings };
}
