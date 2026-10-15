import { beforeEach, describe, expect, it } from 'vitest';
import type { ExternalAudioHandlers, SpeakOptions, SpeechBackend, SpeechCallbacks } from '../src/tts/backend';
import { ReadingController, type PlayerSnapshot } from '../src/player/ReadingController';

interface Spoken {
  text: string;
  callbacks: SpeechCallbacks;
}

class FakeBackend implements SpeechBackend {
  readonly kind = 'cloud' as const;
  readonly usesMediaElement = true;
  readonly reportsInterruptions = true;
  spoken: Spoken[] = [];
  cancels = 0;
  pauses = 0;
  resumes = 0;
  canPauseInPlace = true;
  external: ExternalAudioHandlers | null = null;

  speak(text: string, _options: SpeakOptions, callbacks: SpeechCallbacks): void {
    this.spoken.push({ text, callbacks });
  }
  cancel(): void {
    this.cancels++;
  }
  pause(): boolean {
    this.pauses++;
    return this.canPauseInPlace;
  }
  resume(): boolean {
    this.resumes++;
    return this.canPauseInPlace;
  }
  setExternalHandlers(handlers: ExternalAudioHandlers | null): void {
    this.external = handlers;
  }
  dispose(): void {}
  last(): Spoken {
    return this.spoken[this.spoken.length - 1];
  }
  finishLast(): void {
    this.last().callbacks.onEnd();
  }
}

const LONG = Array.from({ length: 12 }, (_, i) => `వాక్యం సంఖ్య ${i} చాలా పొడవైన తెలుగు వాక్యం ఇక్కడ ఉంది, దీనిని విభజించాలి.`).join(' ');
const PARAGRAPHS = ['మొదటి పేరా.', LONG, 'మూడవ పేరా.', 'నాలుగవ పేరా.'];

describe('ReadingController', () => {
  let backend: FakeBackend;
  let controller: ReadingController;
  let snap: PlayerSnapshot;
  let clock: number;

  beforeEach(() => {
    backend = new FakeBackend();
    clock = 1000;
    controller = new ReadingController(backend, {
      prepareText: (t) => t,
      speakOptions: () => ({ lang: 'te-IN', voiceURI: '', rate: 1, pitch: 1 }),
      onChange: (s) => (snap = s),
      now: () => clock,
    });
    controller.load(PARAGRAPHS, 0);
  });

  it('restores a position without starting audio', () => {
    controller.load(PARAGRAPHS, 2);
    expect(snap.status).toBe('idle');
    expect(snap.paragraphIndex).toBe(2);
    expect(backend.spoken).toHaveLength(0);
  });

  it('reads every segment of every paragraph exactly once, in order', () => {
    controller.play();
    let guard = 0;
    while (snap.status === 'playing' && guard++ < 100) backend.finishLast();
    expect(snap.status).toBe('ended');
    const joined = backend.spoken.map((s) => s.text).join(' ').replace(/\s+/g, '');
    expect(joined).toBe(PARAGRAPHS.join('').replace(/\s+/g, ''));
    expect(backend.spoken.length).toBeGreaterThan(PARAGRAPHS.length);
  });

  it('ignores stale callbacks after pause, next and chapter changes', () => {
    controller.play();
    const first = backend.last();
    controller.goTo(2, true);
    first.callbacks.onEnd();
    first.callbacks.onError('old');
    expect(snap.paragraphIndex).toBe(2);
    expect(snap.status).toBe('playing');
    expect(backend.spoken).toHaveLength(2);

    const second = backend.last();
    controller.pause();
    second.callbacks.onEnd();
    expect(snap.status).toBe('paused');
    expect(snap.paragraphIndex).toBe(2);
    expect(backend.spoken).toHaveLength(2);
  });

  it('pauses in place and resumes the same audio when the engine supports it', () => {
    controller.play();
    controller.pause();
    expect(backend.pauses).toBe(1);
    controller.play();
    expect(backend.resumes).toBe(1);
    expect(backend.spoken).toHaveLength(1);
    expect(snap.status).toBe('playing');
  });

  it('restarts the current segment when the engine cannot pause in place (device speech)', () => {
    backend.canPauseInPlace = false;
    controller.goTo(1);
    controller.play();
    backend.finishLast();
    const segmentText = backend.last().text;
    controller.pause();
    controller.play();
    expect(backend.last().text).toBe(segmentText);
    expect(snap.segmentIndex).toBe(1);
  });

  it('toggles exactly once per call', () => {
    controller.toggle();
    expect(snap.status).toBe('playing');
    controller.toggle();
    expect(snap.status).toBe('paused');
    controller.toggle();
    expect(snap.status).toBe('playing');
  });

  it('restarts the current paragraph from its beginning', () => {
    controller.goTo(1);
    controller.play();
    backend.finishLast();
    backend.finishLast();
    expect(snap.segmentIndex).toBe(2);
    controller.restartParagraph();
    expect(snap.paragraphIndex).toBe(1);
    expect(snap.segmentIndex).toBe(0);
    expect(backend.last().text.startsWith('వాక్యం సంఖ్య 0')).toBe(true);
  });

  it('defines Previous: restart if >3s or past first segment, otherwise go back', () => {
    controller.goTo(2);
    controller.play();
    clock += 1000;
    controller.previous();
    expect(snap.paragraphIndex).toBe(1);

    clock += 5000;
    controller.previous();
    expect(snap.paragraphIndex).toBe(1);
    expect(snap.segmentIndex).toBe(0);

    controller.pause();
    controller.previous();
    expect(snap.paragraphIndex).toBe(0);
    expect(snap.status).toBe('paused');
    controller.previous();
    expect(snap.paragraphIndex).toBe(0);
  });

  it('Next moves forward and keeps playing; stops at the last paragraph', () => {
    controller.play();
    controller.next();
    expect(snap.paragraphIndex).toBe(1);
    expect(snap.status).toBe('playing');
    controller.goTo(3);
    controller.next();
    expect(snap.paragraphIndex).toBe(3);
  });

  it('auto-resumes an interrupted paragraph from its beginning after a system interruption', () => {
    controller.goTo(1, true);
    backend.finishLast();
    backend.finishLast();
    const spokenBefore = backend.spoken.length;
    backend.external!.onExternalPause();
    expect(snap.status).toBe('interrupted');
    expect(snap.autoResumePending).toBe(true);
    backend.external!.onExternalPause();
    backend.external!.onExternalPlay();
    expect(snap.status).toBe('playing');
    expect(snap.paragraphIndex).toBe(1);
    expect(snap.segmentIndex).toBe(0);
    expect(backend.spoken.length).toBe(spokenBefore + 1);
    backend.external!.onExternalPlay();
    expect(backend.spoken.length).toBe(spokenBefore + 1);
  });

  it('manual pause during an interruption cancels automatic resumption', () => {
    controller.play();
    backend.external!.onExternalPause();
    controller.pause();
    expect(snap.status).toBe('paused');
    expect(snap.autoResumePending).toBe(false);
    const spoken = backend.spoken.length;
    backend.external!.onExternalPlay();
    expect(snap.status).toBe('paused');
    expect(backend.spoken.length).toBe(spoken);
  });

  it('keeps silence if the system tries to resume audio the user paused', () => {
    controller.play();
    controller.pause();
    const pauses = backend.pauses;
    backend.external!.onExternalPlay();
    expect(snap.status).toBe('paused');
    expect(backend.pauses).toBe(pauses + 1);
  });

  it('pauses when the headset is disconnected and stays paused', () => {
    controller.play();
    controller.outputLost();
    expect(snap.status).toBe('paused');
    backend.external!.onExternalPlay();
    expect(snap.status).toBe('paused');
  });

  it('reports TTS errors without losing the reading position', () => {
    controller.goTo(2, true);
    backend.last().callbacks.onError('వాయిస్ లోపం');
    expect(snap.status).toBe('error');
    expect(snap.error).toBe('వాయిస్ లోపం');
    expect(snap.paragraphIndex).toBe(2);
    controller.play();
    expect(snap.status).toBe('playing');
    expect(backend.last().text).toBe('మూడవ పేరా.');
  });

  it('skips paragraphs that become empty after pronunciation rules', () => {
    const c = new ReadingController(backend, {
      prepareText: (t) => (t === 'ఖాళీ' ? '' : t),
      speakOptions: () => ({ lang: 'te-IN', voiceURI: '', rate: 1, pitch: 1 }),
      onChange: (s) => (snap = s),
    });
    c.load(['ఒకటి', 'ఖాళీ', 'మూడు'], 0);
    c.play();
    backend.finishLast();
    expect(backend.last().text).toBe('మూడు');
    expect(snap.paragraphIndex).toBe(2);
  });

  it('switching engines keeps the position and stops playback', () => {
    controller.goTo(2, true);
    const other = new FakeBackend();
    controller.setBackend(other);
    expect(snap.status).toBe('paused');
    expect(snap.paragraphIndex).toBe(2);
    expect(backend.external).toBeNull();
    controller.play();
    expect(other.spoken).toHaveLength(1);
  });
});
