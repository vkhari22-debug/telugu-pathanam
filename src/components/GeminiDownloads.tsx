import { useEffect, useRef, useState } from 'react';
import type { PronunciationRule, StoredDocument } from '../types';
import { applyPronunciations, segmentText } from '../tts/segment';
import { synthesizeGeminiWav } from '../tts/geminiBackend';
import { concatenateWav } from '../tts/wav';

interface Props {
  doc: StoredDocument;
  apiKey: string;
  model: string;
  voice: string;
  rate: number;
  pronunciations: PronunciationRule[];
  onPrepare(): void;
}

interface DownloadScope {
  title: string;
  start: number;
  end: number;
}

function filenamePart(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'telugu-audio';
}

function chapterScope(doc: StoredDocument, chapterIndex: number): DownloadScope {
  const chapter = doc.chapters[chapterIndex];
  const next = doc.chapters.slice(chapterIndex + 1).find((item) => item.level <= chapter.level);
  return {
    title: chapter.title,
    start: chapter.paragraphIndex,
    end: next?.paragraphIndex ?? doc.paragraphs.length,
  };
}

export function GeminiDownloads({ doc, apiKey, model, voice, rate, pronunciations, onPrepare }: Props) {
  const [silent, setSilent] = useState(true);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.playbackRate = rate;
      if (!silent) void audioRef.current.play().catch(() => setError('ఆటో ప్లే జరగలేదు. కింద ఆడియో ప్లేయర్‌లో ప్లే నొక్కండి.'));
    }
  }, [audioUrl, silent, rate]);

  const generate = async (scope: DownloadScope) => {
    if (!apiKey.trim()) {
      setError('ముందుగా వాయిస్ సెట్టింగ్‌లలో Gemini API key ఇవ్వండి.');
      return;
    }
    onPrepare();
    const texts = doc.paragraphs
      .slice(scope.start, scope.end)
      .map((paragraph) => applyPronunciations(paragraph.text, pronunciations))
      .flatMap((paragraph) => segmentText(paragraph));
    if (texts.length === 0) {
      setError('ఈ భాగంలో చదవదగిన పాఠ్యం లేదు.');
      return;
    }

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setActiveTitle(scope.title);
    setError(null);
    setProgress({ done: 0, total: texts.length });
    setAudioTitle(scope.title);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);

    try {
      const chunks: ArrayBuffer[] = [];
      for (let i = 0; i < texts.length; i++) {
        if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const wav = await synthesizeGeminiWav(texts[i], { apiKey, model, voice }, abort.signal);
        chunks.push(await wav.arrayBuffer());
        setProgress({ done: i + 1, total: texts.length });
      }
      const output = concatenateWav(chunks);
      const url = URL.createObjectURL(output);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${filenamePart(doc.title)} - ${filenamePart(scope.title)}.wav`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      audioUrlRef.current = url;
      setAudioUrl(url);
      setAudioTitle(scope.title);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setActiveTitle(null);
      setProgress(null);
    }
  };

  const scopes = doc.chapters.map((chapter, index) => ({ ...chapterScope(doc, index), level: chapter.level, key: `${chapter.paragraphIndex}-${index}` }));

  return (
    <section className="stack" aria-label="Gemini ఆడియో డౌన్‌లోడ్">
      <p className="notice small">
        ఎంపిక చేసిన భాగం Geminiకి పేరా-పేరాగా పంపబడుతుంది; ఒక్కో భాగానికి API quota/ఖర్చు ఉండవచ్చు.
        తయారీ క్రమంగా జరుగుతుంది, మధ్యలో రద్దు చేయవచ్చు. డౌన్‌లోడ్ ఒక WAV ఫైల్‌గా కలుస్తుంది.
      </p>
      <label className="radio">
        <input type="checkbox" checked={silent} onChange={(event) => setSilent(event.target.checked)} />
        <span><strong>మౌనంగా తయారు చేసి డౌన్‌లోడ్ చేయి</strong><br /><span className="muted small">ఈ ఎంపికతో ఆడియో వినిపించదు. పూర్తయ్యాక కావాలంటే కింద ప్లేయర్‌లో వినండి.</span></span>
      </label>

      {doc.chapters.length > 0 && (
        <div className="stack">
          <h3>అధ్యాయం వారీగా</h3>
          <ul className="chapter-list">
            {scopes.map((scope) => (
              <li key={scope.key} style={{ paddingInlineStart: `${(Math.min(scope.level, 6) - 1) * 0.8}rem` }}>
                <div className="row">
                  <span className="grow">{scope.title}</span>
                  <button type="button" onClick={() => void generate(scope)} disabled={!!activeTitle}>
                    ⬇ డౌన్‌లోడ్
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="primary" onClick={() => void generate({ title: 'పూర్తి డాక్యుమెంట్', start: 0, end: doc.paragraphs.length })} disabled={!!activeTitle}>
        📥 పూర్తి డాక్యుమెంట్ WAV డౌన్‌లోడ్
      </button>

      {activeTitle && progress && (
        <div role="status" aria-live="polite">
          <p>{activeTitle}: Gemini ఆడియో తయారు చేస్తోంది… {progress.done}/{progress.total}</p>
          <progress max={progress.total} value={progress.done} />
          <button type="button" className="danger" onClick={() => abortRef.current?.abort()}>రద్దు చేయి</button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {audioUrl && (
        <div className="stack card">
          <strong>{audioTitle} — తయారైంది</strong>
          <audio ref={audioRef} controls preload="metadata" src={audioUrl}>
            ఈ బ్రౌజర్ WAV ఆడియో ప్లే చేయదు.
          </audio>
          <a href={audioUrl} download={`${filenamePart(doc.title)} - ${filenamePart(audioTitle)}.wav`}>మళ్లీ డౌన్‌లోడ్ చేయి</a>
        </div>
      )}
    </section>
  );
}
