import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../src/storage/db';
import { DEFAULT_SETTINGS, type ParsedDocument } from '../src/types';
import { registerMediaSession, DUPLICATE_PRESS_MS } from '../src/player/mediaSession';
import { pickVoice, sortVoices } from '../src/tts/deviceBackend';
import { validateEndpoint, pitchToSemitones } from '../src/tts/cloudBackend';

const doc: ParsedDocument = {
  title: 'పాఠాలు',
  format: 'docx',
  language: 'te-IN',
  paragraphs: [
    { text: 'పాఠం 1', level: 1 },
    { text: 'పాఠ్యం', level: 0 },
  ],
  chapters: [{ title: 'పాఠం 1', level: 1, paragraphIndex: 0, source: 'heading' }],
  warnings: [],
};

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    await store.clearAllData();
  });

  it('stores documents, per-document progress and bookmarks', async () => {
    const a = await store.saveDocument(doc, { name: 'a.docx', size: 10 });
    const b = await store.saveDocument({ ...doc, title: 'రెండవది' }, { name: 'b.docx', size: 20 });
    await store.saveProgress(a.id, 1);
    await store.saveProgress(b.id, 0);
    expect((await store.getProgress(a.id))?.paragraphIndex).toBe(1);
    expect((await store.getProgress(b.id))?.paragraphIndex).toBe(0);
    expect((await store.getDocument(a.id))?.paragraphs).toEqual(doc.paragraphs);
    expect((await store.listDocuments()).map((d) => d.paragraphCount)).toEqual([2, 2]);

    await store.addBookmark({ docId: a.id, paragraphIndex: 1, label: 'గుర్తు', createdAt: 1 });
    await store.addBookmark({ docId: b.id, paragraphIndex: 0, label: 'వేరే', createdAt: 1 });
    expect((await store.listBookmarks(a.id)).map((x) => x.label)).toEqual(['గుర్తు']);

    await store.deleteDocument(a.id);
    expect(await store.getDocument(a.id)).toBeUndefined();
    expect(await store.getProgress(a.id)).toBeUndefined();
    expect(await store.listBookmarks(a.id)).toEqual([]);
    expect(await store.listBookmarks(b.id)).toHaveLength(1);
  });

  it('saves settings and clears everything', async () => {
    expect(await store.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await store.saveSettings({ ...DEFAULT_SETTINGS, rate: 0.8, pronunciations: [{ from: 'YSS', to: 'వై ఎస్ ఎస్' }] });
    expect((await store.loadSettings()).rate).toBe(0.8);
    await store.saveDocument(doc, { name: 'a.docx', size: 1 });
    await store.clearAllData();
    expect(await store.listDocuments()).toEqual([]);
    expect(await store.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Media Session', () => {
  it('registers headset actions, logs every press and treats duplicate toggles as one press', () => {
    const handlers = new Map<string, (() => void) | null>();
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: {
        setActionHandler: (name: string, h: (() => void) | null) => {
          if (name === 'seekforward') throw new Error('unsupported');
          handlers.set(name, h);
        },
      },
    });
    const commands = { play: vi.fn(), pause: vi.fn(), previous: vi.fn(), next: vi.fn(), restart: vi.fn(), isPlaying: () => false };
    const log = vi.fn();
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const result = registerMediaSession(commands, log);
    expect(result.supported).toBe(true);
    expect(result.failed).toEqual(['seekforward']);
    expect(result.registered).toContain('nexttrack');

    handlers.get('play')!();
    handlers.get('play')!();
    expect(commands.play).toHaveBeenCalledTimes(1);
    now.mockReturnValue(10_000 + DUPLICATE_PRESS_MS + 1);
    handlers.get('pause')!();
    handlers.get('nexttrack')!();
    handlers.get('previoustrack')!();
    expect(commands.pause).toHaveBeenCalledTimes(1);
    expect(commands.next).toHaveBeenCalledTimes(1);
    expect(commands.previous).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(5);
    now.mockRestore();
    delete (navigator as unknown as Record<string, unknown>).mediaSession;
  });
});

describe('voices and engines', () => {
  const voice = (name: string, lang: string, isDefault = false) =>
    ({ name, lang, voiceURI: name, default: isDefault, localService: true }) as SpeechSynthesisVoice;

  it('lists Telugu voices first and picks one for Telugu documents', () => {
    const voices = [voice('English', 'en-US', true), voice('Hindi', 'hi-IN'), voice('Telugu', 'te-IN'), voice('Telugu 2', 'te_IN')];
    expect(sortVoices(voices, 'te-IN').map((v) => v.name).slice(0, 2)).toEqual(['Telugu', 'Telugu 2']);
    expect(pickVoice(voices, '', 'te-IN')?.name).toBe('Telugu');
    expect(pickVoice(voices, 'Hindi', 'te-IN')?.name).toBe('Hindi');
    expect(pickVoice([], '', 'te-IN')).toBeNull();
    expect(pickVoice([voice('English', 'en-US')], '', 'te-IN')).toBeNull();
  });

  it('validates the optional cloud endpoint', () => {
    expect(validateEndpoint('https://tts.example.com')).toBeNull();
    expect(validateEndpoint('http://localhost:8787')).toBeNull();
    expect(validateEndpoint('http://example.com')).toBeTruthy();
    expect(validateEndpoint('not a url')).toBeTruthy();
    expect(pitchToSemitones(1)).toBe(0);
  });
});
