import { useEffect, useRef, useState } from 'react';
import { synthesizeGeminiWav } from '../tts/geminiBackend';

export function GeminiKeyTest({ apiKey, model, voice }: { apiKey: string; model: string; voice: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setBusy(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [apiKey, model, voice]);

  const test = async () => {
    if (request.current) return;
    if (!apiKey.trim()) {
      setResult({ ok: false, message: 'ముందుగా Gemini API key ఇవ్వండి.' });
      return;
    }
    const abort = new AbortController();
    request.current = abort;
    setBusy(true);
    setResult(null);
    try {
      const audio = await synthesizeGeminiWav('నమస్కారం.', { apiKey, model, voice }, abort.signal);
      if (abort.signal.aborted) return;
      if (!audio.size) throw new Error('Gemini ఖాళీ ఆడియో ఇచ్చింది.');
      setResult({ ok: true, message: 'పరీక్ష విజయవంతం: ఈ key, మోడల్, వాయిస్‌తో Gemini ఆడియో వచ్చింది. పూర్తి డాక్యుమెంట్‌కు సరిపడే quota ఉందని ఇది హామీ కాదు.' });
    } catch (error) {
      if (abort.signal.aborted) return;
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (request.current === abort) {
        request.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <div className="stack card">
      <button type="button" disabled={busy} onClick={() => void test()}>
        {busy ? 'API key పరీక్షిస్తోంది…' : 'Gemini API key పరీక్షించు'}
      </button>
      <p className="muted small">ఒక చిన్న వాక్యంతో నిజమైన TTS request చేస్తుంది; quota/ఖర్చు వాడుతుంది. ఆడియో వినిపించదు. Gemini subscription మరియు API billing వేర్వేరు.</p>
      {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error'}>{result.message}</p>}
    </div>
  );
}
