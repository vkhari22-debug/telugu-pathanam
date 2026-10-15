export interface SpeakOptions {
  lang: string;
  voiceURI: string;
  rate: number;
  pitch: number;
}

export interface SpeechCallbacks {
  onStart(): void;
  onEnd(): void;
  onError(message: string): void;
}

/** Signals that the platform (not the user via this app) paused or resumed our audio. */
export interface ExternalAudioHandlers {
  onExternalPause(): void;
  onExternalPlay(): void;
}

export interface SpeechBackend {
  readonly kind: 'device' | 'cloud' | 'gemini';
  /** True when audio plays through an HTML media element (needed for reliable media keys). */
  readonly usesMediaElement: boolean;
  /** True when this backend can report system-initiated pauses (e.g. audio focus loss). */
  readonly reportsInterruptions: boolean;
  speak(text: string, options: SpeakOptions, callbacks: SpeechCallbacks, upcoming: string[]): void;
  /** Stop immediately; callbacks for the cancelled speech must never fire afterwards. */
  cancel(): void;
  /** Pause in place. Returns false when the backend can only cancel. */
  pause(): boolean;
  /** Resume an in-place pause. Returns false when nothing can be resumed. */
  resume(): boolean;
  setExternalHandlers(handlers: ExternalAudioHandlers | null): void;
  dispose(): void;
}
