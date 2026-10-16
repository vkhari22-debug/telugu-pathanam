import { expect, test, type Page } from '@playwright/test';
import { buildDocx } from '../tests/fixtures/builders';

/**
 * Replaces the browser's speechSynthesis with a deterministic fake so the
 * reading flow can be tested in headless Chromium (which has no voices).
 * Real voices and Bluetooth hardware are NOT exercised by these tests.
 */
async function installFakeSpeech(page: Page, ms = 250) {
  await page.addInitScript((speechMs) => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    w.__spoken = spoken;
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onstart: ((e: unknown) => void) | null = null;
      onend: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: FakeUtterance | null = null;
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [{ name: 'Telugu Test Voice', lang: 'te-IN', voiceURI: 'te-test', default: true, localService: true }],
      speak(u: FakeUtterance) {
        current = u;
        synth.speaking = true;
        spoken.push(u.text);
        setTimeout(() => u.onstart?.({}), 5);
        timer = setTimeout(() => {
          synth.speaking = false;
          current = null;
          u.onend?.({});
        }, speechMs);
      },
      cancel() {
        clearTimeout(timer);
        const u = current;
        current = null;
        synth.speaking = false;
        u?.onerror?.({ error: 'canceled' });
      },
      pause() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    w.SpeechSynthesisUtterance = FakeUtterance;
  }, ms);
}

async function importDocx(page: Page) {
  const data = await buildDocx(
    [
      { text: 'పాఠం 1: మొదటి పాఠం', style: 'Heading1' },
      { text: 'మొదటి పాఠంలో మొదటి పేరా.' },
      { text: 'మొదటి పాఠంలో రెండవ పేరా.' },
      { text: 'ఉపశీర్షిక', style: 'Heading2' },
      { text: 'ఉపశీర్షిక కింద పేరా.' },
      { text: 'పాఠం 2: రెండవ పాఠం', style: 'Heading1' },
      { text: 'రెండవ పాఠంలో మొదటి పేరా.' },
      { text: 'రెండవ పాఠంలో రెండవ పేరా.' },
    ],
    { title: 'పరీక్ష పాఠాలు' },
  );
  await page.getByTestId('file-input').setInputFiles({
    name: 'lessons.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(data),
  });
  await expect(page.getByRole('heading', { level: 1, name: 'పరీక్ష పాఠాలు' })).toBeVisible();
}

const spokenTexts = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('mobile layout, import, chapters, reading and resume without autoplay', async ({ page }) => {
  await installFakeSpeech(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /డాక్యుమెంట్ తెరవండి/ })).toBeVisible();
  await importDocx(page);

  // Mobile layout: controls fit the viewport and nothing scrolls horizontally.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['వెనుక పేరా', 'పేరాగ్రాఫ్ మొదటి నుంచి', 'ప్లే', 'ముందు పేరా']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }

  // Chapter selection starts reading from that heading.
  await page.getByRole('button', { name: /అధ్యాయాలు/ }).click();
  await expect(page.getByRole('dialog', { name: 'అధ్యాయాలు' })).toBeVisible();
  await page.getByRole('button', { name: 'పాఠం 2: రెండవ పాఠం' }).click();
  await expect(page.getByRole('button', { name: 'పాజ్', exact: true })).toBeVisible();
  await expect.poll(() => spokenTexts(page)).toEqual(expect.arrayContaining(['పాఠం 2: రెండవ పాఠం', 'రెండవ పాఠంలో మొదటి పేరా.']));
  expect((await spokenTexts(page))[0]).toBe('పాఠం 2: రెండవ పాఠం');

  // Pause, then confirm the position is kept after reload and audio does not start by itself.
  await page.getByRole('button', { name: 'పాజ్', exact: true }).click();
  await expect(page.getByText('పాజ్ చేయబడింది')).toBeVisible();
  const position = await page.locator('.para.current').textContent();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'పరీక్ష పాఠాలు' })).toBeVisible();
  await expect(page.locator('.para.current')).toHaveText(position!);
  await expect(page.getByText('సిద్ధం', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await spokenTexts(page)).toEqual([]);

  // Restart current paragraph and keyboard toggle.
  await page.keyboard.press('k');
  await expect.poll(() => spokenTexts(page)).toEqual([position]);
  await page.getByRole('button', { name: 'పేరాగ్రాఫ్ మొదటి నుంచి' }).click();
  await expect.poll(async () => (await spokenTexts(page)).filter((t) => t === position).length).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('k');
  await expect(page.getByText('పాజ్ చేయబడింది')).toBeVisible();
});

test('reads continuously to the end without skipping or repeating', async ({ page }) => {
  await installFakeSpeech(page, 40);
  await page.goto('./');
  await importDocx(page);
  await page.getByRole('button', { name: 'ప్లే', exact: true }).click();
  await expect(page.getByText('డాక్యుమెంట్ పూర్తయింది')).toBeVisible({ timeout: 10_000 });
  const spoken = await spokenTexts(page);
  const paragraphs = await page.locator('.reader .para').allTextContents();
  expect(spoken).toEqual(paragraphs);
});

test('search paragraphs, bookmarks, delete document, and clear errors for unsupported files', async ({ page }) => {
  await installFakeSpeech(page);
  await page.goto('./');
  await page.getByTestId('file-input').setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('xx') });
  await expect(page.getByRole('alert')).toContainText('.docx');

  await importDocx(page);
  await page.getByRole('button', { name: /పేరాగ్రాఫ్‌లు/ }).click();
  await page.getByRole('searchbox').fill('ఉపశీర్షిక కింద');
  await page.getByRole('button', { name: /ఉపశీర్షిక కింద పేరా/ }).click();
  await expect(page.locator('.para.current')).toHaveText('ఉపశీర్షిక కింద పేరా.');

  await page.getByRole('button', { name: /బుక్‌మార్క్‌లు/ }).click();
  await page.getByRole('button', { name: /గుర్తుపెట్టు/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /ఉపశీర్షిక కింద పేరా/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'లైబ్రరీకి తిరిగి' }).click();
  await expect(page.getByText(/% చదివారు/)).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'పరీక్ష పాఠాలు తొలగించు' }).click();
  await expect(page.getByText('ఇంకా ఏ డాక్యుమెంట్ తెరవలేదు.')).toBeVisible();
});

test('voice panel lists Telugu voices first and shows media-session status honestly', async ({ page }) => {
  await installFakeSpeech(page);
  await page.goto('./');
  await importDocx(page);
  await page.getByRole('button', { name: /వాయిస్/ }).first().click();
  await expect(page.getByRole('combobox')).toContainText('★ Telugu Test Voice');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'సెట్టింగ్‌లు, సహాయం' }).click();
  await expect(page.getByText(/Media Session API: నమోదైంది/)).toBeVisible();
  await expect(page.getByText(/లేదు \(ఫోన్ వాయిస్\)/)).toBeVisible();
  await expect(page.getByText('ఇంకా ఏ బటన్ సంకేతం అందలేదు.')).toBeVisible();
});

test('Gemini TTS settings expose the API key without persisting it', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'సెట్టింగ్‌లు, సహాయం' }).click();
  await page.getByRole('button', { name: /వాయిస్ ఎంచుకోండి/ }).click();
  await page.getByRole('radio', { name: /Gemini TTS/ }).check();
  await expect(page.getByLabel(/Gemini API key/)).toBeVisible();
  await expect(page.getByLabel('Gemini TTS మోడల్')).toHaveValue('gemini-3.8-flash-tts');
  await page.getByLabel(/Gemini API key/).fill('temporary-test-key');
  await page.reload();
  await page.getByRole('button', { name: 'సెట్టింగ్‌లు, సహాయం' }).click();
  await page.getByRole('button', { name: /వాయిస్ ఎంచుకోండి/ }).click();
  await expect(page.getByLabel(/Gemini API key/)).toHaveValue('');
});

test('Gemini downloads a chapter silently as one playable WAV', async ({ page }) => {
  await installFakeSpeech(page);
  const wav = Buffer.alloc(48);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(40, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(4, 40);
  wav.set([1, 2, 3, 4], 44);
  const sentTexts: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/v1beta/interactions', async (route) => {
    const body = route.request().postDataJSON();
    sentTexts.push(body.input[0].content[0].text);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ output_audio: { data: wav.toString('base64') } }),
    });
  });
  await page.goto('./');
  await importDocx(page);
  await page.getByRole('button', { name: 'వాయిస్', exact: false }).click();
  await page.getByRole('radio', { name: /Gemini TTS/ }).check();
  await page.getByLabel(/Gemini API key/).fill('test-key');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /ఆడియో డౌన్‌లోడ్/ }).click();
  await expect(page.getByTestId('document-cost')).toContainText('USD');
  await expect(page.getByTestId('document-cost')).toContainText('8 API requests');
  await page.getByLabel(/రూపాయల్లో చూడటానికి/).fill('85');
  await expect(page.getByTestId('document-cost')).toContainText('₹');
  await page.getByRole('button', { name: 'Gemini API key పరీక్షించు', exact: true }).click();
  await expect(page.getByText(/పరీక్ష విజయవంతం:/)).toBeVisible();
  expect(sentTexts).toEqual(['నమస్కారం.']);
  sentTexts.length = 0;
  await expect(page.getByRole('checkbox', { name: /మౌనంగా తయారు/ })).toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ డౌన్‌లోడ్' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('పాఠం 1');
  await expect(page.locator('audio')).toBeVisible();
  expect(await page.locator('audio').evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(sentTexts).toEqual([
    'పాఠం 1: మొదటి పాఠం',
    'మొదటి పాఠంలో మొదటి పేరా.',
    'మొదటి పాఠంలో రెండవ పేరా.',
    'ఉపశీర్షిక',
    'ఉపశీర్షిక కింద పేరా.',
  ]);

  const wholeDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /పూర్తి డాక్యుమెంట్ WAV డౌన్‌లోడ్/ }).click();
  const wholeDownload = await wholeDownloadPromise;
  expect(wholeDownload.suggestedFilename()).toContain('పూర్తి డాక్యుమెంట్');
  expect(sentTexts.slice(-8)).toEqual([
    'పాఠం 1: మొదటి పాఠం',
    'మొదటి పాఠంలో మొదటి పేరా.',
    'మొదటి పాఠంలో రెండవ పేరా.',
    'ఉపశీర్షిక',
    'ఉపశీర్షిక కింద పేరా.',
    'పాఠం 2: రెండవ పాఠం',
    'రెండవ పాఠంలో మొదటి పేరా.',
    'రెండవ పాఠంలో రెండవ పేరా.',
  ]);
});

test('Gemini key test reports missing key and quota errors without claiming success', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'సెట్టింగ్‌లు, సహాయం' }).click();
  await page.getByRole('button', { name: /వాయిస్ ఎంచుకోండి/ }).click();
  await page.getByRole('radio', { name: /Gemini TTS/ }).check();
  await page.getByRole('button', { name: 'Gemini API key పరీక్షించు', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ముందుగా Gemini API key');
  await page.getByLabel(/Gemini API key/).fill('test-key');
  await page.route('https://generativelanguage.googleapis.com/v1beta/interactions', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Rate limit exceeded on Free Tier' } }) }));
  await page.getByRole('button', { name: 'Gemini API key పరీక్షించు', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Rate limit exceeded on Free Tier');
  await expect(page.getByText(/పరీక్ష విజయవంతం:/)).toHaveCount(0);
});

test('application shell loads offline after the first visit', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /డాక్యుమెంట్ తెరవండి/ })).toBeVisible();
  await context.setOffline(false);
});
