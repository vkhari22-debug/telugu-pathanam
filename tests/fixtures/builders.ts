import JSZip from 'jszip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface DocxParagraphSpec {
  text: string;
  style?: string;
  outline?: number;
  bold?: boolean;
  /** Put a line break between halves of text separated by "|". */
  inTable?: boolean;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paragraphXml(p: DocxParagraphSpec): string {
  const pPr = [
    p.style ? `<w:pStyle w:val="${p.style}"/>` : '',
    p.outline !== undefined ? `<w:outlineLvl w:val="${p.outline}"/>` : '',
  ].join('');
  const runs = p.text
    .split('|')
    .map((part, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${p.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`)
    .join('');
  const xml = `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
  return p.inTable ? `<w:tbl><w:tr><w:tc>${xml}</w:tc></w:tr></w:tbl>` : xml;
}

export const DEFAULT_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3NoOutline"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="LessonTitle"><w:name w:val="Lesson Title"/><w:basedOn w:val="Heading1"/></w:style>
  <w:style w:type="paragraph" w:styleId="SubLesson"><w:name w:val="Sub Lesson"/><w:basedOn w:val="LessonTitle"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="BodyOverride"><w:name w:val="Body override"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>
</w:styles>`;

export function documentXml(paragraphs: DocxParagraphSpec[], extraBody = ''): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>${paragraphs.map(paragraphXml).join('')}${extraBody}<w:sectPr/></w:body></w:document>`;
}

export async function buildDocx(paragraphs: DocxParagraphSpec[], options: { styles?: string | null; title?: string; extraBody?: string } = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', documentXml(paragraphs, options.extraBody));
  if (options.styles !== null) zip.file('word/styles.xml', options.styles ?? DEFAULT_STYLES);
  if (options.title) {
    zip.file(
      'docProps/core.xml',
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(options.title)}</dc:title></cp:coreProperties>`,
    );
  }
  return zip.generateAsync({ type: 'arraybuffer' });
}

export interface EpubChapterSpec {
  file: string;
  html: string;
}

export async function buildEpub(options: {
  chapters: EpubChapterSpec[];
  spine: string[];
  nav?: string;
  ncx?: string;
  title?: string;
  encryption?: string;
  opfDir?: string;
}): Promise<ArrayBuffer> {
  const dir = options.opfDir ?? 'OEBPS';
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="${dir}/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  if (options.encryption) zip.file('META-INF/encryption.xml', options.encryption);
  const items = options.chapters
    .map((c) => `<item id="${c.file.replace(/\W/g, '_')}" href="${c.file}" media-type="application/xhtml+xml"/>`)
    .join('');
  const navItem = options.nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : '';
  const ncxItem = options.ncx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : '';
  const spine = options.spine.map((f) => `<itemref idref="${f.replace(/\W/g, '_')}"/>`).join('');
  zip.file(
    `${dir}/content.opf`,
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${options.title ?? 'పుస్తకం'}</dc:title><dc:language>te</dc:language></metadata><manifest>${items}${navItem}${ncxItem}</manifest><spine${options.ncx ? ' toc="ncx"' : ''}>${spine}</spine></package>`,
  );
  for (const c of options.chapters) {
    zip.file(`${dir}/${c.file}`, `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${c.html}</body></html>`);
  }
  if (options.nav) zip.file(`${dir}/nav.xhtml`, options.nav);
  if (options.ncx) zip.file(`${dir}/toc.ncx`, options.ncx);
  return zip.generateAsync({ type: 'arraybuffer' });
}
