import JSZip from 'jszip';
import type { ImportProgress, Paragraph, ParsedDocument } from '../types';
import { detectLanguage, detectPatternChapters, fileBaseName, headingChapters, ImportError, parseXml } from './common';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

interface StyleInfo {
  id: string;
  name: string;
  basedOn?: string;
  /** Raw outline level 0–9 when the style declares one. */
  outlineLvl?: number;
}

function wAttr(el: Element, name: string): string | null {
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`);
}

function directChild(el: Element, localName: string, ns = W): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName && child.namespaceURI === ns) return child;
  }
  return null;
}

function readOutlineLevel(pPr: Element | null): number | undefined {
  if (!pPr) return undefined;
  const outline = directChild(pPr, 'outlineLvl');
  if (!outline) return undefined;
  const value = Number(wAttr(outline, 'val'));
  return Number.isInteger(value) && value >= 0 && value <= 9 ? value : undefined;
}

export function readStyles(stylesXml: string | null): { styles: Map<string, StyleInfo>; defaultParagraphStyle?: string } {
  const styles = new Map<string, StyleInfo>();
  let defaultParagraphStyle: string | undefined;
  if (!stylesXml) return { styles };
  const doc = parseXml(stylesXml, 'Word styles');
  for (const style of Array.from(doc.getElementsByTagNameNS(W, 'style'))) {
    if (wAttr(style, 'type') !== 'paragraph') continue;
    const id = wAttr(style, 'styleId');
    if (!id) continue;
    const nameEl = directChild(style, 'name');
    const basedOnEl = directChild(style, 'basedOn');
    const info: StyleInfo = {
      id,
      name: nameEl ? wAttr(nameEl, 'val') ?? '' : '',
      basedOn: basedOnEl ? wAttr(basedOnEl, 'val') ?? undefined : undefined,
      outlineLvl: readOutlineLevel(directChild(style, 'pPr')),
    };
    styles.set(id, info);
    const isDefault = wAttr(style, 'default');
    if (isDefault === '1' || isDefault === 'true') defaultParagraphStyle = id;
  }
  return { styles, defaultParagraphStyle };
}

const BUILTIN_HEADING = /^heading\s*([1-9])$/i;

/**
 * Heading level (1–9) for a style, following the basedOn chain so that custom
 * styles inheriting from "Heading 2" (or from a style with an outline level)
 * are recognised. Returns 0 for body text.
 */
export function styleHeadingLevel(styleId: string | undefined, styles: Map<string, StyleInfo>): number {
  const seen = new Set<string>();
  let current = styleId ? styles.get(styleId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.outlineLvl !== undefined) return current.outlineLvl >= 9 ? 0 : current.outlineLvl + 1;
    const builtIn = BUILTIN_HEADING.exec(current.name) ?? BUILTIN_HEADING.exec(current.id);
    if (builtIn) return Number(builtIn[1]);
    current = current.basedOn ? styles.get(current.basedOn) : undefined;
  }
  return 0;
}

function isInside(el: Element, localName: string, ns: string, stop: Element): boolean {
  let parent = el.parentElement;
  while (parent && parent !== stop) {
    if (parent.localName === localName && parent.namespaceURI === ns) return true;
    parent = parent.parentElement;
  }
  return false;
}

/** Text of one w:p, excluding nested text boxes (they are read as their own paragraphs). */
function paragraphText(p: Element): string {
  let text = '';
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.namespaceURI === MC && child.localName === 'Fallback') continue;
      if (child.namespaceURI === W) {
        switch (child.localName) {
          case 'p':
          case 'txbxContent':
          case 'del':
          case 'pPr':
          case 'rPr':
          case 'instrText':
            continue;
          case 't':
            text += child.textContent ?? '';
            continue;
          case 'tab':
            text += '\t';
            continue;
          case 'br':
          case 'cr':
            text += '\n';
            continue;
          case 'noBreakHyphen':
            text += '\u2011';
            continue;
          case 'softHyphen':
            continue;
        }
      }
      walk(child);
    }
  };
  walk(p);
  return text;
}

export function parseDocumentXml(documentXml: string, stylesXml: string | null): Paragraph[] {
  const { styles, defaultParagraphStyle } = readStyles(stylesXml);
  const doc = parseXml(documentXml, 'Word document');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new ImportError('Word ఫైల్‌లో పాఠ్యం కనిపించలేదు.');
  const paragraphs: Paragraph[] = [];
  for (const p of Array.from(body.getElementsByTagNameNS(W, 'p'))) {
    if (isInside(p, 'Fallback', MC, body)) continue;
    const text = paragraphText(p);
    if (!text.trim()) continue;
    const pPr = directChild(p, 'pPr');
    const styleEl = pPr ? directChild(pPr, 'pStyle') : null;
    const styleId = (styleEl && wAttr(styleEl, 'val')) || defaultParagraphStyle;
    const direct = readOutlineLevel(pPr);
    let level = direct !== undefined ? (direct >= 9 ? 0 : direct + 1) : styleHeadingLevel(styleId, styles);
    // Headings inside tables or text boxes are kept as text but not as chapters.
    if (level > 0 && (isInside(p, 'tbl', W, body) || isInside(p, 'txbxContent', W, body))) level = 0;
    paragraphs.push({ text, level });
  }
  return paragraphs;
}

export async function parseDocx(data: ArrayBuffer, fileName: string, progress?: ImportProgress): Promise<ParsedDocument> {
  progress?.('Word ఫైల్ తెరుస్తున్నాం…', 0.1);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ImportError(
      'ఈ ఫైల్ సరైన .docx కాదు. పాత .doc ఫైల్ అయితే, Word లేదా Google Docs‌లో తెరిచి “.docx”గా సేవ్ చేయండి.',
    );
  }
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new ImportError('ఈ .docx ఫైల్‌లో ప్రధాన పాఠ్యం (word/document.xml) లేదు.');
  progress?.('పాఠ్యం చదువుతున్నాం…', 0.4);
  const [documentXml, stylesXml, coreXml] = await Promise.all([
    documentFile.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? Promise.resolve(null),
    zip.file('docProps/core.xml')?.async('string') ?? Promise.resolve(null),
  ]);
  progress?.('శీర్షికలు గుర్తిస్తున్నాం…', 0.7);
  const paragraphs = parseDocumentXml(documentXml, stylesXml);
  if (paragraphs.length === 0) throw new ImportError('ఈ Word ఫైల్‌లో చదవదగిన పాఠ్యం లేదు.');

  let title = '';
  if (coreXml) {
    try {
      title = parseXml(coreXml, 'Word properties').getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent?.trim() ?? '';
    } catch {
      title = '';
    }
  }
  const warnings: string[] = [];
  let chapters = headingChapters(paragraphs);
  if (chapters.length === 0) {
    chapters = detectPatternChapters(paragraphs);
    warnings.push(
      chapters.length
        ? 'Word శీర్షిక శైలులు (Heading) కనిపించలేదు. “పాఠం 1”, “అధ్యాయం 1” వంటి పంక్తులను సూచిత అధ్యాయాలుగా చూపిస్తున్నాం.'
        : 'Word శీర్షిక శైలులు (Heading) కనిపించలేదు. పేరాగ్రాఫ్ జాబితా, వెతుకు ఉపయోగించండి.',
    );
  }
  progress?.('పూర్తయింది', 1);
  return {
    title: title || fileBaseName(fileName),
    format: 'docx',
    language: detectLanguage(paragraphs),
    paragraphs,
    chapters,
    warnings,
  };
}
