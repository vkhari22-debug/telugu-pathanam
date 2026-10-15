import { describe, expect, it } from 'vitest';
import { applyPronunciations, MAX_SEGMENT_LENGTH, segmentText } from '../src/tts/segment';
import { decodeText, parseTxt, splitPlainText } from '../src/parsers/txt';
import { extensionOf, parseFile } from '../src/parsers';

const SENTENCE = 'ఏకాగ్రమైన మనస్సు బాగా ఎండిన మంచి అగ్గిపుల్ల వంటిది.';

const strip = (s: string) => s.replace(/\s+/g, '');

describe('speech segmentation', () => {
  it('keeps short paragraphs as one segment', () => {
    expect(segmentText(SENTENCE)).toEqual([SENTENCE]);
    expect(segmentText('   ')).toEqual([]);
  });

  it('splits long Telugu paragraphs at sentence boundaries without losing text', () => {
    const long = Array.from({ length: 30 }, (_, i) => `${i}. ${SENTENCE}`).join(' ');
    const segments = segmentText(long);
    expect(segments.length).toBeGreaterThan(5);
    expect(segments.every((s) => s.length <= MAX_SEGMENT_LENGTH)).toBe(true);
    expect(strip(segments.join(''))).toBe(strip(long));
    expect(segments.every((s) => /[.]$/.test(s))).toBe(true);
  });

  it('splits huge sentences without punctuation and never breaks a Telugu conjunct', () => {
    const word = 'క్షేత్రజ్ఞుడు';
    const noPunct = Array.from({ length: 200 }, () => word).join('');
    const segments = segmentText(noPunct, 50);
    expect(strip(segments.join(''))).toBe(noPunct);
    for (const s of segments) {
      expect(s.length).toBeLessThanOrEqual(50);
      expect(/^[\u0C3E-\u0C56\u0C4D\u0C01-\u0C03]/u.test(s)).toBe(false);
      expect(/\u0C4D$/u.test(s)).toBe(false);
    }
  });

  it('applies pronunciation replacements to spoken text only', () => {
    const original = 'YSS పాఠం, Dr. రావు';
    const spoken = applyPronunciations(original, [
      { from: 'YSS', to: 'వై ఎస్ ఎస్' },
      { from: 'Dr.', to: 'డాక్టర్' },
      { from: '', to: 'ignored' },
    ]);
    expect(spoken).toBe('వై ఎస్ ఎస్ పాఠం, డాక్టర్ రావు');
    expect(original).toBe('YSS పాఠం, Dr. రావు');
  });
});

describe('text file import', () => {
  it('splits on blank lines, or on lines when there are none', () => {
    expect(splitPlainText('ఒకటి\nకొనసాగింపు\n\nరెండు\r\n\r\nమూడు')).toEqual(['ఒకటి\nకొనసాగింపు', 'రెండు', 'మూడు']);
    expect(splitPlainText('ఒకటి\nరెండు\nమూడు')).toEqual(['ఒకటి', 'రెండు', 'మూడు']);
  });

  it('decodes UTF-8 and UTF-16 Telugu text', () => {
    const text = 'తెలుగు పఠనం';
    expect(decodeText(new TextEncoder().encode(text).buffer).text).toBe(text);
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) {
      utf16[2 + i * 2] = text.charCodeAt(i) & 0xff;
      utf16[3 + i * 2] = text.charCodeAt(i) >> 8;
    }
    expect(decodeText(utf16.buffer).text).toBe(text);
    expect(decodeText(new Uint8Array([0xff, 0x41]).buffer).warning).toBeTruthy();
  });

  it('suggests chapters from "అధ్యాయం" lines', async () => {
    const doc = await parseTxt(new TextEncoder().encode('అధ్యాయం 1\n\nపాఠ్యం\n\nఅధ్యాయం 2\n\nమరింత').buffer, 'book.txt');
    expect(doc.chapters.map((c) => c.paragraphIndex)).toEqual([0, 2]);
    expect(doc.chapters[0].source).toBe('pattern');
  });

  it('explains unsupported formats', async () => {
    expect(extensionOf('a.B.DOCX')).toBe('docx');
    await expect(parseFile(new File(['x'], 'old.doc'))).rejects.toThrow(/\.docx/);
    await expect(parseFile(new File(['x'], 'scan.pdf'))).rejects.toThrow(/PDF/);
    await expect(parseFile(new File(['x'], 'photo.jpg'))).rejects.toThrow(/మద్దతు లేదు/);
    await expect(parseFile(new File([], 'empty.txt'))).rejects.toThrow(/ఖాళీ/);
  });
});
