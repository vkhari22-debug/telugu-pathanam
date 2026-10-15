import { describe, expect, it } from 'vitest';
import { parseDocx } from '../src/parsers/docx';
import { buildDocx } from './fixtures/builders';

const TELUGU_BODY = 'యోగం ఒక శాస్త్రం. దాని ద్వారా ఆత్మ శరీరం, మనస్సు అనే సాధనాలపై ఆధిపత్యం సాధిస్తుంది — “ఆత్మసాక్షాత్కారం”.';

describe('Word (.docx) import', () => {
  it('detects Heading 1–9 including inherited styles and outline levels, in document order', async () => {
    const data = await buildDocx(
      [
        { text: 'పాఠం 27: శరీరాన్నీ, మనస్సునూ', style: 'Heading1' },
        { text: TELUGU_BODY },
        { text: 'ఉపశీర్షిక', style: 'Heading2' },
        { text: 'పేరు ఆధారిత శీర్షిక', style: 'Heading3NoOutline' },
        { text: 'అనుకూల శైలి (Heading 1 నుంచి వారసత్వం)', style: 'LessonTitle' },
        { text: 'అనుకూల ఉపశైలి outline 1', style: 'SubLesson' },
        { text: 'నేరుగా outline level 4', outline: 4 },
        { text: 'ముఖ్యమైన బోల్డ్ పాఠ్యం', bold: true },
        { text: 'body override', style: 'BodyOverride' },
        { text: 'కోట్', style: 'Quote' },
      ],
      { title: 'యోగ పాఠాలు' },
    );
    const doc = await parseDocx(data, 'lessons.docx');
    expect(doc.title).toBe('యోగ పాఠాలు');
    expect(doc.format).toBe('docx');
    expect(doc.language).toBe('te-IN');
    expect(doc.paragraphs.map((p) => p.level)).toEqual([1, 0, 2, 3, 1, 2, 5, 0, 0, 0]);
    expect(doc.chapters.map((c) => [c.title, c.level, c.paragraphIndex])).toEqual([
      ['పాఠం 27: శరీరాన్నీ, మనస్సునూ', 1, 0],
      ['ఉపశీర్షిక', 2, 2],
      ['పేరు ఆధారిత శీర్షిక', 3, 3],
      ['అనుకూల శైలి (Heading 1 నుంచి వారసత్వం)', 1, 4],
      ['అనుకూల ఉపశైలి outline 1', 2, 5],
      ['నేరుగా outline level 4', 5, 6],
    ]);
    expect(doc.chapters.every((c) => c.source === 'heading')).toBe(true);
  });

  it('preserves Telugu Unicode text exactly, including line breaks and order', async () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => ({ text: `${i + 1}. ${TELUGU_BODY}` }));
    paragraphs.push({ text: 'మొదటి పంక్తి|రెండవ పంక్తి' });
    const doc = await parseDocx(await buildDocx(paragraphs), 'x.docx');
    expect(doc.paragraphs).toHaveLength(51);
    doc.paragraphs.slice(0, 50).forEach((p, i) => expect(p.text).toBe(`${i + 1}. ${TELUGU_BODY}`));
    expect(doc.paragraphs[50].text).toBe('మొదటి పంక్తి\nరెండవ పంక్తి');
    expect(doc.paragraphs[0].text.normalize('NFC')).toBe(doc.paragraphs[0].text);
  });

  it('does not treat bold text as a heading and offers pattern chapters only when no headings exist', async () => {
    const doc = await parseDocx(
      await buildDocx([
        { text: 'పాఠం 19: నిజమైన సత్యాన్వేషకులుగా మారడం', bold: true },
        { text: TELUGU_BODY },
        { text: 'బోల్డ్ వాక్యం', bold: true },
        { text: 'పాఠం 20: మనస్సు', bold: true },
        { text: TELUGU_BODY },
      ]),
      'lessons.docx',
    );
    expect(doc.paragraphs.every((p) => p.level === 0)).toBe(true);
    expect(doc.chapters.map((c) => [c.paragraphIndex, c.source])).toEqual([
      [0, 'pattern'],
      [3, 'pattern'],
    ]);
    expect(doc.warnings.join(' ')).toContain('Heading');
  });

  it('reads table cells and keeps headings inside tables as plain text', async () => {
    const doc = await parseDocx(
      await buildDocx([{ text: 'ముందు' }, { text: 'పట్టికలో శీర్షిక', style: 'Heading1', inTable: true }, { text: 'తర్వాత' }]),
      't.docx',
    );
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['ముందు', 'పట్టికలో శీర్షిక', 'తర్వాత']);
    expect(doc.paragraphs[1].level).toBe(0);
  });

  it('ignores deleted revisions and mc:Fallback duplicates', async () => {
    const extra =
      '<w:p><w:r><w:t>ఉంచిన</w:t></w:r><w:del><w:r><w:delText>తొలగించిన</w:delText></w:r></w:del></w:p>' +
      '<w:p><mc:AlternateContent><mc:Choice Requires="wps"><w:r><w:t>ఎంపిక</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>నకలు</w:t></w:r></mc:Fallback></mc:AlternateContent></w:p>';
    const doc = await parseDocx(await buildDocx([], { extraBody: extra }), 'r.docx');
    expect(doc.paragraphs.map((p) => p.text)).toEqual(['ఉంచిన', 'ఎంపిక']);
  });

  it('works without styles.xml and falls back to the file name for the title', async () => {
    const doc = await parseDocx(await buildDocx([{ text: 'పాఠ్యం' }], { styles: null }), 'నా పుస్తకం.docx');
    expect(doc.title).toBe('నా పుస్తకం');
    expect(doc.paragraphs).toEqual([{ text: 'పాఠ్యం', level: 0 }]);
  });

  it('gives a clear error for legacy or corrupt files', async () => {
    const legacy = new TextEncoder().encode('\xD0\xCF\x11\xE0 not a zip').buffer;
    await expect(parseDocx(legacy, 'old.docx')).rejects.toThrow(/\.doc/);
  });
});
