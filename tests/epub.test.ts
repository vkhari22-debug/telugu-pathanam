import { describe, expect, it } from 'vitest';
import { extractXhtml, parseEpub, resolvePath } from '../src/parsers/epub';
import { buildEpub } from './fixtures/builders';

const NAV = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="landmarks"><ol><li><a href="text/ch2.xhtml">wrong nav</a></li></ol></nav>
<nav epub:type="toc"><ol>
  <li><a href="text/ch1.xhtml">మొదటి అధ్యాయం</a>
    <ol><li><a href="text/ch1.xhtml#sec2">ఉప భాగం</a></li></ol>
  </li>
  <li><a href="text/ch%202.xhtml">రెండవ అధ్యాయం</a></li>
</ol></nav></body></html>`;

const NCX = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
<navPoint id="a"><navLabel><text>NCX ఒకటి</text></navLabel><content src="text/ch1.xhtml"/>
  <navPoint id="b"><navLabel><text>NCX ఉప</text></navLabel><content src="text/ch1.xhtml#sec2"/></navPoint>
</navPoint>
<navPoint id="c"><navLabel><text>NCX రెండు</text></navLabel><content src="text/ch%202.xhtml"/></navPoint>
</navMap></ncx>`;

const CH1 = '<h1>మొదటి అధ్యాయం</h1><p>మొదటి పేరా <b>బోల్డ్</b> పాఠ్యం.</p><p id="sec2">రెండవ <span>భాగం</span><br/>కొత్త పంక్తి</p><script>window.hacked = true;</script>';
const CH2 = '<h2>రెండవ అధ్యాయం</h2><div><p>చివరి పేరా</p></div><ul><li>జాబితా అంశం</li></ul>';

describe('EPUB import', () => {
  it('follows spine order (not manifest order) and uses the nav TOC', async () => {
    const data = await buildEpub({
      chapters: [
        { file: 'text/ch 2.xhtml', html: CH2 },
        { file: 'text/ch1.xhtml', html: CH1 },
      ],
      spine: ['text/ch1.xhtml', 'text/ch 2.xhtml'],
      nav: NAV,
      ncx: NCX,
    });
    const doc = await parseEpub(data, 'book.epub');
    expect(doc.paragraphs.map((p) => p.text)).toEqual([
      'మొదటి అధ్యాయం',
      'మొదటి పేరా బోల్డ్ పాఠ్యం.',
      'రెండవ భాగం\nకొత్త పంక్తి',
      'రెండవ అధ్యాయం',
      'చివరి పేరా',
      'జాబితా అంశం',
    ]);
    expect(doc.chapters.map((c) => [c.title, c.level, c.paragraphIndex, c.source])).toEqual([
      ['మొదటి అధ్యాయం', 1, 0, 'toc'],
      ['ఉప భాగం', 2, 2, 'toc'],
      ['రెండవ అధ్యాయం', 1, 3, 'toc'],
    ]);
    expect(doc.language).toBe('te-IN');
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('falls back to the NCX when there is no nav document', async () => {
    const data = await buildEpub({
      chapters: [
        { file: 'text/ch1.xhtml', html: CH1 },
        { file: 'text/ch 2.xhtml', html: CH2 },
      ],
      spine: ['text/ch1.xhtml', 'text/ch 2.xhtml'],
      ncx: NCX,
    });
    const doc = await parseEpub(data, 'book.epub');
    expect(doc.chapters.map((c) => [c.title, c.level, c.paragraphIndex])).toEqual([
      ['NCX ఒకటి', 1, 0],
      ['NCX ఉప', 2, 2],
      ['NCX రెండు', 1, 3],
    ]);
  });

  it('uses h1–h6 headings when there is no TOC', async () => {
    const data = await buildEpub({ chapters: [{ file: 'a.xhtml', html: CH1 + CH2 }], spine: ['a.xhtml'] });
    const doc = await parseEpub(data, 'book.epub');
    expect(doc.chapters.map((c) => [c.level, c.paragraphIndex])).toEqual([
      [1, 0],
      [2, 3],
    ]);
  });

  it('rejects DRM-protected books but accepts font obfuscation', async () => {
    const drm = `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></enc:EncryptedData></encryption>`;
    const fonts = drm.replace('http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'http://www.idpf.org/2008/embedding');
    const base = { chapters: [{ file: 'a.xhtml', html: CH1 }], spine: ['a.xhtml'] };
    await expect(parseEpub(await buildEpub({ ...base, encryption: drm }), 'd.epub')).rejects.toThrow(/DRM/);
    await expect(parseEpub(await buildEpub({ ...base, encryption: fonts }), 'f.epub')).resolves.toBeTruthy();
  });

  it('resolves relative paths', () => {
    expect(resolvePath('OEBPS/content.opf', 'text/a.xhtml')).toBe('OEBPS/text/a.xhtml');
    expect(resolvePath('OEBPS/text/nav.xhtml', '../images/x.png#y')).toBe('OEBPS/images/x.png');
    expect(resolvePath('content.opf', 'a%20b.xhtml')).toBe('a b.xhtml');
  });

  it('never keeps script or style content', () => {
    const { paragraphs } = extractXhtml('<html xmlns="http://www.w3.org/1999/xhtml"><body><style>p{}</style><p>సరే</p><script>alert(1)</script></body></html>');
    expect(paragraphs.map((p) => p.text)).toEqual(['సరే']);
  });
});
