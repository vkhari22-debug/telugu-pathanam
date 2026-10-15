import type { SpeakOptions, SpeechBackend, SpeechCallbacks } from './backend';

/** Voices sorted with Telugu first, then the document language, then the rest. */
export function sortVoices(voices: SpeechSynthesisVoice[], docLang: string): SpeechSynthesisVoice[] {
  const lang = docLang.toLowerCase().slice(0, 2);
  const rank = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace('_', '-');
    if (l.startsWith('te')) return 0;
    if (l.startsWith(lang)) return 1;
    if (l.startsWith('en')) return 2;
    return 3;
  };
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function pickVoice(voices: SpeechSynthesisVoice[], voiceURI: string, lang: string): SpeechSynthesisVoice | null {
  const chosen = voices.find((v) => v.voiceURI === voiceURI);
  if (chosen) return chosen;
  const prefix = lang.toLowerCase().slice(0, 2);
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    null
  );
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

const START_TIMEOUT_MS = 15000;

/**
 * Uses the phone/browser's built-in voices (Web Speech API). Works offline when
 * the installed voice is offline-capable. Important limitation: this produces
 * no HTML media element, so Android does not route Bluetooth media buttons or
 * audio-focus changes to the page reliably.
 */
export class DeviceSpeechBackend implements SpeechBackend {
  readonly kind = 'device' as const;
  readonly usesMediaElement = false;
  readonly reportsInterruptions = false;
  private generation = 0;
  private current: SpeechSynthesisUtterance | null = null;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  speak(text: string, options: SpeakOptions, callbacks: SpeechCallbacks): void {
    if (!speechSupported()) {
      callbacks.onError('ఈ బ్రౌజర్‌లో మాటల (Text-to-Speech) సదుపాయం లేదు.');
      return;
    }
    const synth = window.speechSynthesis;
    const generation = ++this.generation;
    clearTimeout(this.watchdog);
    if (synth.speaking || synth.pending) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(synth.getVoices(), options.voiceURI, options.lang);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? options.lang;
    utterance.rate = options.rate;
    utterance.pitch = options.pitch;
    let started = false;
    const live = () => generation === this.generation;
    utterance.onstart = () => {
      if (!live()) return;
      started = true;
      clearTimeout(this.watchdog);
      callbacks.onStart();
    };
    utterance.onend = () => {
      if (!live()) return;
      clearTimeout(this.watchdog);
      this.current = null;
      callbacks.onEnd();
    };
    utterance.onerror = (event) => {
      if (!live()) return;
      clearTimeout(this.watchdog);
      this.current = null;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        // Cancelled by the system or another tab, not by us: report so the position is kept.
        callbacks.onError('మాటలు మధ్యలో ఆగిపోయాయి (వ్యవస్థ అంతరాయం). మళ్లీ ప్లే నొక్కండి.');
        return;
      }
      callbacks.onError(`వాయిస్ లోపం: ${event.error || 'తెలియని లోపం'}`);
    };
    // Keep a reference: some browsers garbage-collect utterances and never fire onend.
    this.current = utterance;
    this.watchdog = setTimeout(() => {
      if (live() && !started && !synth.speaking) {
        this.generation++;
        synth.cancel();
        callbacks.onError('వాయిస్ ప్రారంభం కాలేదు. వేరే వాయిస్ ఎంచుకోండి లేదా ఫోన్ TTS సెట్టింగ్‌లు చూడండి.');
      }
    }, START_TIMEOUT_MS);
    synth.speak(utterance);
  }

  cancel(): void {
    this.generation++;
    clearTimeout(this.watchdog);
    this.current = null;
    if (speechSupported()) window.speechSynthesis.cancel();
  }

  // speechSynthesis.pause() is unreliable on Android (it often cancels), so we
  // always cancel and later restart the current short segment.
  pause(): boolean {
    return false;
  }

  resume(): boolean {
    return false;
  }

  setExternalHandlers(): void {
    // The Web Speech API exposes no audio-focus or system-pause signal.
  }

  dispose(): void {
    this.cancel();
  }

  get hasCurrent(): boolean {
    return this.current !== null;
  }
}
