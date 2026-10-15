import { useEffect, useState } from 'react';
import { speechSupported } from './deviceBackend';

/** Voices often load asynchronously (Chrome fires "voiceschanged"). */
export function useVoices(): { voices: SpeechSynthesisVoice[]; loaded: boolean; supported: boolean } {
  const supported = speechSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (supported ? window.speechSynthesis.getVoices() : []));
  const [loaded, setLoaded] = useState(voices.length > 0 || !supported);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const update = () => {
      setVoices(synth.getVoices());
      setLoaded(true);
    };
    update();
    synth.addEventListener?.('voiceschanged', update);
    // Some browsers never fire voiceschanged when there are no voices.
    const timer = setTimeout(() => setLoaded(true), 3000);
    return () => {
      synth.removeEventListener?.('voiceschanged', update);
      clearTimeout(timer);
    };
  }, [supported]);

  return { voices, loaded: loaded || voices.length > 0, supported };
}

export function isTeluguVoice(v: SpeechSynthesisVoice): boolean {
  return v.lang.toLowerCase().replace('_', '-').startsWith('te');
}
