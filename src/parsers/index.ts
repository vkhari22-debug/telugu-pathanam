import type { ImportProgress, ParsedDocument } from '../types';
import { ImportError } from './common';
import { parseDocx } from './docx';
import { parseEpub } from './epub';
import { parseTxt } from './txt';

export { ImportError };

export const ACCEPTED_EXTENSIONS = '.docx,.epub,.txt';
export const MAX_FILE_BYTES = 150 * 1024 * 1024;

const UNSUPPORTED: Record<string, string> = {
  doc: 'పాత Word (.doc) ఫార్మాట్‌కు మద్దతు లేదు. Word లేదా Google Docs‌లో తెరిచి “File → Save as / Download → .docx”గా సేవ్ చేసి తెరవండి.',
  pdf: 'PDF ఫైళ్లకు మద్దతు లేదు. PDFలో పేరాగ్రాఫ్ క్రమం, తెలుగు అక్షరాలు తరచుగా సరిగా రావు. .docx, .epub లేదా .txt ఉపయోగించండి.',
  rtf: 'RTF ఫార్మాట్‌కు మద్దతు లేదు. Word‌లో తెరిచి .docxగా సేవ్ చేయండి.',
  odt: 'ODT ఫార్మాట్‌కు మద్దతు లేదు. LibreOffice‌లో “Save As → Word (.docx)” చేసి తెరవండి.',
  mobi: 'MOBI/Kindle ఫార్మాట్‌కు మద్దతు లేదు. DRM లేని EPUB ఉపయోగించండి.',
  azw: 'Kindle (AZW) పుస్తకాలు సాధారణంగా DRM రక్షితం; వాటికి మద్దతు లేదు.',
  azw3: 'Kindle (AZW3) పుస్తకాలు సాధారణంగా DRM రక్షితం; వాటికి మద్దతు లేదు.',
};

export function extensionOf(name: string): string {
  const match = /\.([^.]+)$/.exec(name.toLowerCase());
  return match ? match[1] : '';
}

export async function parseFile(file: File, progress?: ImportProgress): Promise<ParsedDocument> {
  const ext = extensionOf(file.name);
  if (UNSUPPORTED[ext]) throw new ImportError(UNSUPPORTED[ext]);
  if (!['docx', 'epub', 'txt'].includes(ext)) {
    throw new ImportError(`“.${ext || '?'}” ఫైళ్లకు మద్దతు లేదు. .docx, .epub, .txt ఫైళ్లు మాత్రమే తెరవగలం.`);
  }
  if (file.size === 0) throw new ImportError('ఫైల్ ఖాళీగా ఉంది.');
  if (file.size > MAX_FILE_BYTES) throw new ImportError('ఫైల్ చాలా పెద్దది (150 MB కంటే ఎక్కువ).');
  progress?.('ఫైల్ లోడ్ అవుతోంది…', 0.02);
  const data = await file.arrayBuffer();
  if (ext === 'docx') return parseDocx(data, file.name, progress);
  if (ext === 'epub') return parseEpub(data, file.name, progress);
  return parseTxt(data, file.name, progress);
}
