import JSZip from 'jszip';
import type { Chapter, ImportProgress, Paragraph, ParsedDocument } from '../types';
import { detectLanguage, fileBaseName, headingChapters, ImportError, parseXml } from './common';

const OPF_NS = 'http://www.idpf.org/2007/opf';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const NCX_NS = 'http://www.daisy.org/z3986/2005/ncx/';
const OPS_NS = 'http://www.idpf.org/2007/ops';
const ENC_NS = 'http://www.w3.org/2001/04/xmlenc#';

/** Font obfuscation is not DRM: the text itself stays readable. */
const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);

/** Resolve a relative href against the directory of `base` (zip paths, no leading slash). */
export function resolvePath(base: string, href: string): string {
  const clean = href.split('#')[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  if (decoded.startsWith('/')) decoded = decoded.slice(1);
  const parts = base.includes('/') ? base.slice(0, base.lastIndexOf('/')).split('/') : [];
  if (href.startsWith('/')) parts.length = 0;
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function fragmentOf(href: string): string {
  const i = href.indexOf('#');
  if (i < 0) return '';
  try {
    return decodeURIComponent(href.slice(i + 1));
  } catch {
    return href.slice(i + 1);
  }
}

const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'blockquote', 'pre', 'li', 'ul', 'ol',
  'dl', 'dt', 'dd', 'figure', 'figcaption', 'table', 'tr', 'td', 'th', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'body', 'address', 'center',
]);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'iframe', 'object', 'embed', 'math', 'svg']);

export interface ContentResult {
  paragraphs: Paragraph[];
  /** element id -> paragraph index (relative to the start of this file) */
  anchors: Map<string, number>;
}

/**
 * Extracts block text from an XHTML content document. Nothing is rendered as
 * HTML and no scripts are executed: DOMParser documents are inert and we only
 * keep text nodes.
 */
export function extractXhtml(source: string): ContentResult {
  let doc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    doc = new DOMParser().parseFromString(source, 'text/html');
  }
  const paragraphs: Paragraph[] = [];
  const anchors = new Map<string, number>();
  let buffer = '';
  let bufferLevel = 0;
  const flush = () => {
    const text = buffer.replace(/[ \t\r\n\f]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
    if (text) paragraphs.push({ text, level: bufferLevel });
    buffer = '';
    bufferLevel = 0;
  };
  const walk = (node: Node, level: number) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        buffer += child.nodeValue ?? '';
        if (level && !bufferLevel) bufferLevel = level;
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const name = el.localName.toLowerCase();
      if (SKIP.has(name)) continue;
      const id = el.getAttribute('id');
      if (name === 'br') {
        buffer += '\u0000';
        continue;
      }
      const block = BLOCK.has(name);
      if (block) flush();
      if (id && !anchors.has(id)) anchors.set(id, paragraphs.length);
      const heading = /^h([1-6])$/.exec(name);
      walk(el, heading ? Number(heading[1]) : level);
      if (block) flush();
    }
  };
  const root = doc.getElementsByTagName('body')[0] ?? doc.documentElement;
  walk(root, 0);
  flush();
  // Restore explicit line breaks that were protected from whitespace collapsing.
  for (const p of paragraphs) p.text = p.text.replace(/ ?\u0000 ?/g, '\n').trim();
  return { paragraphs: paragraphs.filter((p) => p.text), anchors };
}

interface TocEntry {
  title: string;
  href: string;
  level: number;
}

function parseNavToc(source: string, navPath: string): TocEntry[] {
  let doc = new DOMParser().parseFromString(source, 'application/xhtml+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) doc = new DOMParser().parseFromString(source, 'text/html');
  const navs = Array.from(doc.getElementsByTagName('nav'));
  const toc =
    navs.find((n) => (n.getAttributeNS(OPS_NS, 'type') ?? n.getAttribute('epub:type') ?? '').split(/\s+/).includes('toc')) ??
    navs[0];
  if (!toc) return [];
  const entries: TocEntry[] = [];
  const walkList = (list: Element, level: number) => {
    for (const li of Array.from(list.children).filter((c) => c.localName.toLowerCase() === 'li')) {
      const link = Array.from(li.children).find((c) => c.localName.toLowerCase() === 'a');
      if (link?.getAttribute('href')) {
        entries.push({
          title: (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: resolvePath(navPath, link.getAttribute('href')!) + (fragmentOf(link.getAttribute('href')!) ? `#${fragmentOf(link.getAttribute('href')!)}` : ''),
          level,
        });
      }
      for (const nested of Array.from(li.children).filter((c) => c.localName.toLowerCase() === 'ol' || c.localName.toLowerCase() === 'ul')) {
        walkList(nested, level + 1);
      }
    }
  };
  const top = Array.from(toc.children).find((c) => c.localName.toLowerCase() === 'ol' || c.localName.toLowerCase() === 'ul');
  if (top) walkList(top, 1);
  return entries;
}

function parseNcx(source: string, ncxPath: string): TocEntry[] {
  const doc = parseXml(source, 'EPUB NCX');
  const navMap = doc.getElementsByTagNameNS(NCX_NS, 'navMap')[0] ?? doc.getElementsByTagName('navMap')[0];
  if (!navMap) return [];
  const entries: TocEntry[] = [];
  const walk = (parent: Element, level: number) => {
    for (const point of Array.from(parent.children).filter((c) => c.localName === 'navPoint')) {
      const label = Array.from(point.children).find((c) => c.localName === 'navLabel');
      const content = Array.from(point.children).find((c) => c.localName === 'content');
      const src = content?.getAttribute('src');
      if (src) {
        const frag = fragmentOf(src);
        entries.push({
          title: (label?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          href: resolvePath(ncxPath, src) + (frag ? `#${frag}` : ''),
          level,
        });
      }
      walk(point, level + 1);
    }
  };
  walk(navMap, 1);
  return entries;
}

async function assertNotDrm(zip: JSZip): Promise<void> {
  if (zip.file('META-INF/rights.xml')) {
    throw new ImportError('ఈ EPUB DRM రక్షణతో ఉంది (Adobe/ఇతర). DRM ఉన్న పుస్తకాలను ఈ యాప్ తెరవదు; DRM లేని EPUB ఉపయోగించండి.');
  }
  const encryption = zip.file('META-INF/encryption.xml');
  if (!encryption) return;
  const doc = parseXml(await encryption.async('string'), 'EPUB encryption');
  const methods = [
    ...Array.from(doc.getElementsByTagNameNS(ENC_NS, 'EncryptionMethod')),
    ...Array.from(doc.getElementsByTagName('EncryptionMethod')),
  ];
  if (methods.some((m) => !FONT_OBFUSCATION.has(m.getAttribute('Algorithm') ?? ''))) {
    throw new ImportError('ఈ EPUB DRM/ఎన్‌క్రిప్షన్‌తో రక్షించబడింది. DRM ఉన్న పుస్తకాలను ఈ యాప్ తెరవదు; DRM లేని EPUB ఉపయోగించండి.');
  }
}

export async function parseEpub(data: ArrayBuffer, fileName: string, progress?: ImportProgress): Promise<ParsedDocument> {
  progress?.('EPUB తెరుస్తున్నాం…', 0.05);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new ImportError('ఈ ఫైల్ సరైన EPUB కాదు లేదా పాడైంది.');
  }
  await assertNotDrm(zip);
  const container = zip.file('META-INF/container.xml');
  if (!container) throw new ImportError('EPUB‌లో META-INF/container.xml లేదు. ఫైల్ పాడై ఉండవచ్చు.');
  const containerDoc = parseXml(await container.async('string'), 'EPUB container');
  const rootfile = containerDoc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!rootfile || !zip.file(rootfile)) throw new ImportError('EPUB ప్యాకేజీ (OPF) ఫైల్ కనిపించలేదు.');
  const opf = parseXml(await zip.file(rootfile)!.async('string'), 'EPUB package');

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const item of Array.from(opf.getElementsByTagNameNS(OPF_NS, 'item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) {
      manifest.set(id, {
        href: resolvePath(rootfile, href),
        mediaType: item.getAttribute('media-type') ?? '',
        properties: item.getAttribute('properties') ?? '',
      });
    }
  }
  const spineEl = opf.getElementsByTagNameNS(OPF_NS, 'spine')[0];
  const spine = Array.from(opf.getElementsByTagNameNS(OPF_NS, 'itemref'))
    .map((ref) => manifest.get(ref.getAttribute('idref') ?? ''))
    .filter((item): item is NonNullable<typeof item> => Boolean(item) && /html|xml/.test(item!.mediaType));
  if (spine.length === 0) throw new ImportError('EPUB‌లో చదవదగిన అధ్యాయాలు (spine) లేవు.');

  const paragraphs: Paragraph[] = [];
  const fileStart = new Map<string, number>();
  const anchorIndex = new Map<string, number>();
  for (let i = 0; i < spine.length; i++) {
    const item = spine[i];
    progress?.(`అధ్యాయాలు చదువుతున్నాం (${i + 1}/${spine.length})…`, 0.1 + (0.8 * i) / spine.length);
    const file = zip.file(item.href);
    if (!file) continue;
    const { paragraphs: part, anchors } = extractXhtml(await file.async('string'));
    fileStart.set(item.href, paragraphs.length);
    for (const [id, index] of anchors) anchorIndex.set(`${item.href}#${id}`, paragraphs.length + Math.min(index, Math.max(part.length - 1, 0)));
    paragraphs.push(...part);
  }
  if (paragraphs.length === 0) throw new ImportError('ఈ EPUB‌లో చదవదగిన పాఠ్యం కనిపించలేదు (చిత్రాలు మాత్రమే ఉండవచ్చు).');

  progress?.('విషయసూచిక చదువుతున్నాం…', 0.92);
  let toc: TocEntry[] = [];
  const navItem = Array.from(manifest.values()).find((m) => m.properties.split(/\s+/).includes('nav'));
  if (navItem && zip.file(navItem.href)) toc = parseNavToc(await zip.file(navItem.href)!.async('string'), navItem.href);
  if (toc.length === 0) {
    const ncxId = spineEl?.getAttribute('toc');
    const ncx = (ncxId && manifest.get(ncxId)) || Array.from(manifest.values()).find((m) => m.mediaType === 'application/x-dtbncx+xml');
    if (ncx && zip.file(ncx.href)) toc = parseNcx(await zip.file(ncx.href)!.async('string'), ncx.href);
  }

  const chapters: Chapter[] = [];
  for (const entry of toc) {
    const [path] = entry.href.split('#');
    const index = anchorIndex.get(entry.href) ?? fileStart.get(path);
    if (index === undefined || index >= paragraphs.length) continue;
    chapters.push({ title: entry.title || paragraphs[index].text.slice(0, 80), level: entry.level, paragraphIndex: index, source: 'toc' });
  }
  const warnings: string[] = [];
  let finalChapters = chapters;
  if (finalChapters.length === 0) {
    finalChapters = headingChapters(paragraphs);
    warnings.push(
      finalChapters.length
        ? 'EPUB విషయసూచిక కనిపించలేదు; శీర్షికల (h1–h6) ఆధారంగా అధ్యాయాలు చూపిస్తున్నాం.'
        : 'EPUB విషయసూచిక కనిపించలేదు. పేరాగ్రాఫ్ జాబితా, వెతుకు ఉపయోగించండి.',
    );
  }

  const title = opf.getElementsByTagNameNS(DC_NS, 'title')[0]?.textContent?.trim();
  const language = opf.getElementsByTagNameNS(DC_NS, 'language')[0]?.textContent?.trim();
  progress?.('పూర్తయింది', 1);
  return {
    title: title || fileBaseName(fileName),
    format: 'epub',
    language: language?.toLowerCase().startsWith('te') ? 'te-IN' : detectLanguage(paragraphs),
    paragraphs,
    chapters: finalChapters,
    warnings,
  };
}
