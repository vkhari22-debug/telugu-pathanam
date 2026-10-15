import type { SpeakOptions, SpeechBackend } from '../tts/backend';
import { segmentText } from '../tts/segment';

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'interrupted' | 'ended' | 'error';

export interface PlayerSnapshot {
  status: PlayerStatus;
  paragraphIndex: number;
  segmentIndex: number;
  segmentCount: number;
  paragraphCount: number;
  error: string | null;
  /** True while waiting for the system to resume after an interruption. */
  autoResumePending: boolean;
}

export interface ControllerOptions {
  /** Converts paragraph text to the text that is spoken (pronunciation rules). */
  prepareText(text: string): string;
  speakOptions(): SpeakOptions;
  onChange(snapshot: PlayerSnapshot): void;
  now?: () => number;
}

/** "Previous" restarts the current paragraph if it has played longer than this. */
export const PREVIOUS_RESTART_THRESHOLD_MS = 3000;

/**
 * Reading state machine shared by the on-screen buttons, keyboard shortcuts,
 * media-session (Bluetooth/lock-screen) actions and system interruptions.
 *
 * Every speak request gets a new token; callbacks carrying an old token are
 * ignored. This prevents duplicate reading or skipped paragraphs when the
 * user pauses, jumps chapters or presses buttons quickly.
 */
export class ReadingController {
  private paragraphs: string[] = [];
  private segmentsCache = new Map<number, string[]>();
  private status: PlayerStatus = 'idle';
  private paragraphIndex = 0;
  private segmentIndex = 0;
  private error: string | null = null;
  private token = 0;
  private pausedInPlace = false;
  private autoResumePending = false;
  private paragraphStartedAt = 0;
  private readonly now: () => number;

  constructor(private backend: SpeechBackend, private readonly options: ControllerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.attachBackend();
  }

  private attachBackend(): void {
    this.backend.setExternalHandlers({
      onExternalPause: () => this.interruptionStarted(),
      onExternalPlay: () => this.interruptionEnded(),
    });
  }

  setBackend(backend: SpeechBackend): void {
    const wasPlaying = this.status === 'playing';
    this.stopSpeech();
    this.backend.setExternalHandlers(null);
    this.backend = backend;
    this.attachBackend();
    if (wasPlaying || this.status === 'paused' || this.status === 'interrupted') {
      this.segmentIndex = 0;
      this.status = 'paused';
      this.autoResumePending = false;
    }
    this.emit();
  }

  getBackend(): SpeechBackend {
    return this.backend;
  }

  load(paragraphs: string[], startIndex = 0): void {
    this.stopSpeech();
    this.paragraphs = paragraphs;
    this.segmentsCache.clear();
    this.paragraphIndex = this.clamp(startIndex);
    this.segmentIndex = 0;
    this.status = 'idle';
    this.error = null;
    this.autoResumePending = false;
    this.emit();
  }

  /** Call when pronunciation rules change so segments are rebuilt. */
  invalidateText(): void {
    this.segmentsCache.clear();
    if (this.segmentIndex >= this.segments(this.paragraphIndex).length) this.segmentIndex = 0;
  }

  snapshot(): PlayerSnapshot {
    return {
      status: this.status,
      paragraphIndex: this.paragraphIndex,
      segmentIndex: this.segmentIndex,
      segmentCount: this.paragraphs.length ? this.segments(this.paragraphIndex).length : 0,
      paragraphCount: this.paragraphs.length,
      error: this.error,
      autoResumePending: this.autoResumePending,
    };
  }

  play(): void {
    if (this.paragraphs.length === 0 || this.status === 'playing') return;
    this.autoResumePending = false;
    this.error = null;
    if (this.status === 'ended') {
      this.paragraphIndex = 0;
      this.segmentIndex = 0;
    }
    if (this.status === 'paused' && this.pausedInPlace && this.backend.resume()) {
      this.pausedInPlace = false;
      this.status = 'playing';
      this.emit();
      return;
    }
    this.pausedInPlace = false;
    this.start();
  }

  /** Manual pause: always wins over automatic resumption. */
  pause(): void {
    this.autoResumePending = false;
    if (this.status === 'playing') {
      if (this.backend.pause()) {
        this.pausedInPlace = true;
      } else {
        this.stopSpeech();
      }
      this.status = 'paused';
    } else if (this.status === 'interrupted') {
      this.stopSpeech();
      this.status = 'paused';
    } else {
      return;
    }
    this.emit();
  }

  toggle(): void {
    if (this.status === 'playing') this.pause();
    else this.play();
  }

  isActive(): boolean {
    return this.status === 'playing';
  }

  next(): void {
    if (this.paragraphIndex >= this.paragraphs.length - 1) return;
    this.goTo(this.paragraphIndex + 1);
  }

  /**
   * Previous: while playing, if the current paragraph has been playing for
   * more than 3 seconds (or is past its first segment), restart it from the
   * beginning; otherwise move to the previous paragraph. When not playing,
   * always move to the previous paragraph.
   */
  previous(): void {
    const playing = this.status === 'playing';
    const elapsed = this.now() - this.paragraphStartedAt;
    if (playing && (this.segmentIndex > 0 || elapsed > PREVIOUS_RESTART_THRESHOLD_MS)) {
      this.restartParagraph();
      return;
    }
    if (this.paragraphIndex === 0) {
      this.restartParagraph();
      return;
    }
    this.goTo(this.paragraphIndex - 1);
  }

  restartParagraph(): void {
    this.goTo(this.paragraphIndex);
  }

  /**
   * Jump to a paragraph. Keeps playing if currently playing; `autoplay` forces
   * playback (used when choosing a chapter).
   */
  goTo(index: number, autoplay = false): void {
    if (this.paragraphs.length === 0) return;
    const keepPlaying = autoplay || this.status === 'playing';
    this.stopSpeech();
    this.paragraphIndex = this.clamp(index);
    this.segmentIndex = 0;
    this.autoResumePending = false;
    this.error = null;
    if (keepPlaying) {
      this.start();
      return;
    }
    if (this.status === 'ended' || this.status === 'error' || this.status === 'interrupted') this.status = 'paused';
    this.emit();
  }

  /** System paused our audio (e.g. navigation announcement took audio focus). */
  interruptionStarted(): void {
    if (this.status !== 'playing') return;
    this.stopSpeech();
    this.segmentIndex = 0;
    this.status = 'interrupted';
    this.autoResumePending = true;
    this.emit();
  }

  /** System resumed our audio: restart the interrupted paragraph from its beginning. */
  interruptionEnded(): void {
    if (this.status !== 'interrupted' || !this.autoResumePending) {
      // A system "play" we did not ask for while paused: keep silence.
      if (this.status === 'playing') return;
      if (this.pausedInPlace) {
        if (!this.backend.pause()) this.stopSpeech();
      } else {
        this.backend.cancel();
      }
      return;
    }
    this.autoResumePending = false;
    this.segmentIndex = 0;
    this.start();
  }

  /** Bluetooth headset disconnected or similar: behave like a manual pause. */
  outputLost(): void {
    if (this.status === 'playing' || this.status === 'interrupted') this.pause();
  }

  dispose(): void {
    this.stopSpeech();
    this.backend.setExternalHandlers(null);
  }

  private clamp(index: number): number {
    if (this.paragraphs.length === 0) return 0;
    return Math.max(0, Math.min(this.paragraphs.length - 1, Math.floor(index) || 0));
  }

  private segments(index: number): string[] {
    let segments = this.segmentsCache.get(index);
    if (!segments) {
      segments = segmentText(this.options.prepareText(this.paragraphs[index] ?? ''));
      this.segmentsCache.set(index, segments);
    }
    return segments;
  }

  private stopSpeech(): void {
    this.token++;
    this.pausedInPlace = false;
    this.backend.cancel();
  }

  private start(): void {
    this.status = 'playing';
    if (this.segmentIndex === 0) this.paragraphStartedAt = this.now();
    this.speakCurrent();
  }

  private speakCurrent(): void {
    // Skip paragraphs that produce no speech (e.g. only punctuation after replacements).
    while (this.paragraphIndex < this.paragraphs.length && this.segmentIndex >= this.segments(this.paragraphIndex).length) {
      if (this.paragraphIndex === this.paragraphs.length - 1) break;
      this.paragraphIndex++;
      this.segmentIndex = 0;
      this.paragraphStartedAt = this.now();
    }
    const segments = this.segments(this.paragraphIndex);
    if (this.segmentIndex >= segments.length) {
      this.token++;
      this.status = 'ended';
      this.segmentIndex = 0;
      this.emit();
      return;
    }
    const token = ++this.token;
    const upcoming = this.upcomingSegments(3);
    this.emit();
    this.backend.speak(
      segments[this.segmentIndex],
      this.options.speakOptions(),
      {
        onStart: () => undefined,
        onEnd: () => {
          if (token !== this.token || this.status !== 'playing') return;
          this.segmentIndex++;
          if (this.segmentIndex >= segments.length && this.paragraphIndex < this.paragraphs.length - 1) {
            this.paragraphIndex++;
            this.segmentIndex = 0;
            this.paragraphStartedAt = this.now();
          }
          this.speakCurrent();
        },
        onError: (message) => {
          if (token !== this.token) return;
          this.token++;
          this.pausedInPlace = false;
          this.status = 'error';
          this.error = message;
          this.emit();
        },
      },
      upcoming,
    );
  }

  private upcomingSegments(count: number): string[] {
    const out: string[] = [];
    let p = this.paragraphIndex;
    let s = this.segmentIndex + 1;
    while (out.length < count && p < this.paragraphs.length) {
      const segments = this.segments(p);
      if (s < segments.length) {
        out.push(segments[s]);
        s++;
      } else {
        p++;
        s = 0;
      }
    }
    return out;
  }

  private emit(): void {
    this.options.onChange(this.snapshot());
  }
}
