import type { ExternalAudioHandlers, SpeakOptions, SpeechBackend, SpeechCallbacks } from './backend';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  voice: string;
}

export interface GeminiAudioConfig {
  apiKey: string;
  model: string;
  voice: string;
}

interface GeminiAudioBlock {
  type?: string;
  data?: string;
}

interface GeminiResponse {
  output_audio?: GeminiAudioBlock;
  steps?: Array<{ type?: string; content?: GeminiAudioBlock[] }>;
  error?: { message?: string };
}

export function buildGeminiRequest(text: string, model: string, voice: string) {
  return {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  };
}

export function extractGeminiAudio(response: GeminiResponse): string {
  const direct = response.output_audio?.data;
  if (direct) return direct;
  const audio = response.steps
    ?.filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'audio')
    .at(-1)?.data;
  if (audio) return audio;
  throw new Error(response.error?.message || 'Gemini API ఆడియో ఇవ్వలేదు.');
}

export async function synthesizeGeminiWav(text: string, config: GeminiAudioConfig, signal?: AbortSignal): Promise<Blob> {
  if (!config.apiKey.trim()) throw new Error('Gemini API key ఇవ్వండి.');
  if (!config.model.trim() || !config.voice.trim()) throw new Error('Gemini మోడల్ మరియు వాయిస్ ఎంచుకోండి.');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey.trim() },
    body: JSON.stringify(buildGeminiRequest(text, config.model, config.voice)),
    signal,
  });
  const data = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    const detail = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gemini API లోపం: ${detail.slice(0, 240)}`);
  }
  const binary = atob(extractGeminiAudio(data));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'audio/wav' });
}

const CACHE_LIMIT = 4;

/** Plays Gemini TTS WAV output through a real media element. The API key is read from memory only. */
export class GeminiAudioBackend implements SpeechBackend {
  readonly kind = 'gemini' as const;
  readonly usesMediaElement = true;
  readonly reportsInterruptions = true;
  readonly audio: HTMLAudioElement;
  private generation = 0;
  private callbacks: SpeechCallbacks | null = null;
  private external: ExternalAudioHandlers | null = null;
  private ownPause = false;
  private ownPlay = false;
  private cache = new Map<string, Promise<string>>();

  constructor(private readonly getConfig: () => GeminiConfig, audio?: HTMLAudioElement) {
    this.audio = audio ?? new Audio();
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
    this.audio.addEventListener('pause', this.handlePause);
    this.audio.addEventListener('play', this.handlePlay);
  }

  private key(text: string): string {
    const { model, voice } = this.getConfig();
    return JSON.stringify([text, model, voice]);
  }

  private fetchAudio(text: string): Promise<string> {
    const cacheKey = this.key(text);
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;
    const config = this.getConfig();
    const request = synthesizeGeminiWav(text, config).then((blob) => URL.createObjectURL(blob));
    request.catch(() => this.cache.delete(cacheKey));
    this.cache.set(cacheKey, request);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.entries().next().value as [string, Promise<string>] | undefined;
      if (!oldest) break;
      this.cache.delete(oldest[0]);
      oldest[1].then((url) => this.revokeUnlessPlaying(url)).catch(() => undefined);
    }
    return request;
  }

  private revokeUnlessPlaying(url: string): void {
    if (this.audio.src !== url) URL.revokeObjectURL(url);
  }

  speak(text: string, options: SpeakOptions, callbacks: SpeechCallbacks, upcoming: string[]): void {
    const generation = ++this.generation;
    this.callbacks = callbacks;
    this.stopElement();
    this.fetchAudio(text)
      .then((url) => {
        if (generation !== this.generation) return;
        this.audio.src = url;
        this.audio.playbackRate = options.rate;
        this.ownPlay = true;
        return this.audio.play().then(() => {
          if (generation === this.generation) callbacks.onStart();
        });
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.ownPlay = false;
        const message = error instanceof Error ? error.message : String(error);
        if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
          callbacks.onError('ఇంటర్నెట్ లేదా Gemini API అందుబాటులో లేదు. కీ restriction/CORS సెట్టింగ్‌లు తనిఖీ చేయండి.');
        } else if (error instanceof DOMException && error.name === 'NotAllowedError') {
          callbacks.onError('బ్రౌజర్ ఆడియో ప్రారంభాన్ని అడ్డుకుంది. ప్లే బటన్ మళ్లీ నొక్కండి.');
        } else {
          callbacks.onError(message);
        }
      });
    for (const next of upcoming.slice(0, 2)) this.fetchAudio(next).catch(() => undefined);
  }

  private stopElement(): void {
    if (!this.audio.paused) {
      this.ownPause = true;
      this.audio.pause();
    }
  }

  cancel(): void {
    this.generation++;
    this.callbacks = null;
    this.stopElement();
  }

  pause(): boolean {
    if (!this.callbacks || !this.audio.src || this.audio.paused || this.audio.ended) return false;
    this.ownPause = true;
    this.audio.pause();
    return true;
  }

  resume(): boolean {
    if (!this.callbacks || !this.audio.src || !this.audio.paused || this.audio.ended) return false;
    const generation = this.generation;
    const callbacks = this.callbacks;
    this.ownPlay = true;
    this.audio.play().catch((error: unknown) => {
      if (generation !== this.generation) return;
      this.ownPlay = false;
      callbacks.onError(error instanceof Error ? error.message : String(error));
    });
    return true;
  }

  setExternalHandlers(handlers: ExternalAudioHandlers | null): void {
    this.external = handlers;
  }

  private handleEnded = () => {
    const callbacks = this.callbacks;
    if (!callbacks) return;
    this.callbacks = null;
    callbacks.onEnd();
  };

  private handleError = () => {
    const callbacks = this.callbacks;
    if (!callbacks || !this.audio.src) return;
    this.callbacks = null;
    callbacks.onError('Gemini ఆడియో ప్లే చేయడంలో లోపం.');
  };

  private handlePause = () => {
    if (this.ownPause) {
      this.ownPause = false;
      return;
    }
    if (!this.audio.ended && this.callbacks) this.external?.onExternalPause();
  };

  private handlePlay = () => {
    if (this.ownPlay) {
      this.ownPlay = false;
      return;
    }
    this.external?.onExternalPlay();
  };

  dispose(): void {
    this.cancel();
    this.audio.removeEventListener('ended', this.handleEnded);
    this.audio.removeEventListener('error', this.handleError);
    this.audio.removeEventListener('pause', this.handlePause);
    this.audio.removeEventListener('play', this.handlePlay);
    this.audio.removeAttribute('src');
    for (const cached of this.cache.values()) cached.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    this.cache.clear();
  }
}
