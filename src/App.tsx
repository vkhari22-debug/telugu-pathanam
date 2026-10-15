import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFile } from './parsers';
import * as store from './storage/db';
import { DEFAULT_SETTINGS, type Bookmark, type DocumentSummary, type Settings, type StoredDocument } from './types';
import { currentChapterTitle, usePlayer } from './player/usePlayer';
import type { PlayerStatus } from './player/ReadingController';
import { useVoices, isTeluguVoice } from './tts/useVoices';
import { DeviceSpeechBackend, pickVoice } from './tts/deviceBackend';
import { CloudAudioBackend } from './tts/cloudBackend';
import { GeminiAudioBackend } from './tts/geminiBackend';
import { Library, OpenButton, type ImportState } from './components/Library';
import { Sheet } from './components/Sheet';
import { BookmarksPanel, ChaptersPanel, ParagraphsPanel } from './components/NavPanels';
import { VoicePanel } from './components/VoicePanel';
import { SettingsPanel } from './components/SettingsPanel';
import { GeminiDownloads } from './components/GeminiDownloads';

type Panel = 'chapters' | 'paragraphs' | 'bookmarks' | 'voice' | 'downloads' | 'settings' | null;

const LAST_DOC_KEY = 'telugu-pathanam:lastDoc';

const STATUS_LABEL: Record<PlayerStatus, string> = {
  idle: 'సిద్ధం',
  playing: 'చదువుతోంది…',
  paused: 'పాజ్ చేయబడింది',
  interrupted: 'వేరే ఆడియో వల్ల ఆగింది — అది ముగిశాక ఈ పేరా మొదటి నుంచి కొనసాగుతుంది',
  ended: 'డాక్యుమెంట్ పూర్తయింది',
  error: 'లోపం',
};

const PREVIEW_TEXT: Record<string, string> = {
  te: 'నమస్కారం. ఇది తెలుగు పఠనం వాయిస్ పరీక్ష.',
  en: 'Hello. This is a voice preview for Telugu Reader.',
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [doc, setDoc] = useState<StoredDocument | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [importing, setImporting] = useState<ImportState | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [storageInfo, setStorageInfo] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const { voices, loaded: voicesLoaded, supported: speechOk } = useVoices();
  const player = usePlayer(doc, settings, startIndex, geminiApiKey);
  const { snapshot, controller } = player;
  const paragraphRefs = useRef<(HTMLElement | null)[]>([]);

  const refreshLibrary = useCallback(async () => {
    const [docs, progress] = await Promise.all([store.listDocuments(), store.getAllProgress()]);
    setDocuments(docs);
    setProgressMap(Object.fromEntries(progress.map((p) => [p.docId, p.paragraphIndex])));
  }, []);

  const openDocument = useCallback(async (id: string) => {
    const [stored, progress, marks] = await Promise.all([store.getDocument(id), store.getProgress(id), store.listBookmarks(id)]);
    if (!stored) {
      localStorage.removeItem(LAST_DOC_KEY);
      return;
    }
    setStartIndex(progress?.paragraphIndex ?? 0);
    setBookmarks(marks);
    setDoc(stored);
    setPanel(null);
    localStorage.setItem(LAST_DOC_KEY, id);
  }, []);

  // Initial load: settings, library and the last opened document (without starting audio).
  useEffect(() => {
    (async () => {
      try {
        setSettings(await store.loadSettings());
        await refreshLibrary();
        const last = localStorage.getItem(LAST_DOC_KEY);
        if (last) await openDocument(last);
        void store.requestPersistentStorage();
      } catch {
        setMessage({ kind: 'error', text: 'బ్రౌజర్ నిల్వ (IndexedDB) తెరవలేకపోయాం. ప్రైవేట్/ఇన్‌కాగ్నిటో మోడ్‌లో ఉంటే సాధారణ విండోలో తెరవండి.' });
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, [refreshLibrary, openDocument]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  useEffect(() => {
    if (settingsLoaded) void store.saveSettings(settings).catch(() => undefined);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings.theme, settings.fontScale]);

  // Save reading position (debounced) and immediately when the page is hidden.
  const positionRef = useRef({ docId: '', index: 0 });
  useEffect(() => {
    if (!doc || snapshot.paragraphCount === 0) return;
    positionRef.current = { docId: doc.id, index: snapshot.paragraphIndex };
    const timer = setTimeout(() => {
      void store.saveProgress(doc.id, snapshot.paragraphIndex).catch(() => undefined);
      setProgressMap((m) => ({ ...m, [doc.id]: snapshot.paragraphIndex }));
    }, 400);
    return () => clearTimeout(timer);
  }, [doc, snapshot.paragraphIndex, snapshot.paragraphCount]);

  useEffect(() => {
    const flush = () => {
      const { docId, index } = positionRef.current;
      if (docId) void store.saveProgress(docId, index).catch(() => undefined);
    };
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Highlight and optionally scroll to the current paragraph.
  useEffect(() => {
    if (!doc || !settings.autoScroll) return;
    const el = paragraphRefs.current[snapshot.paragraphIndex];
    if (el && document.visibilityState === 'visible') el.scrollIntoView({ block: 'center', behavior: snapshot.status === 'playing' ? 'smooth' : 'auto' });
  }, [doc, snapshot.paragraphIndex, settings.autoScroll, snapshot.status]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!doc || panel || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        if (key === ' ' && target.closest('button')) return;
        e.preventDefault();
        controller.toggle();
      } else if (key === 'arrowright' || key === 'n') controller.next();
      else if (key === 'arrowleft' || key === 'p') controller.previous();
      else if (key === 'r') controller.restartParagraph();
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, panel, controller]);

  useEffect(() => {
    if (panel === 'settings') void store.storageEstimate().then(setStorageInfo);
  }, [panel]);

  const handleImport = useCallback(
    async (file: File) => {
      setMessage(null);
      setImporting({ stage: 'తెరుస్తోంది…', fraction: 0, fileName: file.name });
      try {
        const parsed = await parseFile(file, (stage, fraction) => setImporting({ stage, fraction, fileName: file.name }));
        setImporting({ stage: 'భద్రపరుస్తోంది…', fraction: 1, fileName: file.name });
        const saved = await store.saveDocument(parsed, file);
        await refreshLibrary();
        await openDocument(saved.id);
        const notes = [`${parsed.paragraphs.length} పేరాలు, ${parsed.chapters.length} అధ్యాయాలు దొరికాయి.`, ...parsed.warnings];
        setMessage({ kind: 'info', text: notes.join(' ') });
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        setMessage({ kind: 'error', text: /quota/i.test(text) ? 'ఫోన్/బ్రౌజర్ నిల్వ నిండిపోయింది. పాత డాక్యుమెంట్లు తొలగించి మళ్లీ ప్రయత్నించండి.' : text });
      } finally {
        setImporting(null);
      }
    },
    [refreshLibrary, openDocument],
  );

  const closeDocument = useCallback(async () => {
    controller.pause();
    const { docId, index } = positionRef.current;
    if (docId) await store.saveProgress(docId, index).catch(() => undefined);
    positionRef.current = { docId: '', index: 0 };
    setDoc(null);
    setMessage(null);
    localStorage.removeItem(LAST_DOC_KEY);
    await refreshLibrary();
  }, [controller, refreshLibrary]);

  const handleDelete = useCallback(
    async (d: DocumentSummary) => {
      if (!window.confirm(`“${d.title}” ను తొలగించాలా? చదివిన స్థానం, బుక్‌మార్క్‌లు కూడా పోతాయి.`)) return;
      if (doc?.id === d.id) await closeDocument();
      await store.deleteDocument(d.id);
      await refreshLibrary();
    },
    [doc, closeDocument, refreshLibrary],
  );

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('అన్ని డాక్యుమెంట్లు, బుక్‌మార్క్‌లు, చదివిన స్థానాలు, సెట్టింగ్‌లు తొలగించాలా?')) return;
    controller.pause();
    positionRef.current = { docId: '', index: 0 };
    setDoc(null);
    localStorage.removeItem(LAST_DOC_KEY);
    await store.clearAllData();
    setSettings(DEFAULT_SETTINGS);
    setGeminiApiKey('');
    setPanel(null);
    await refreshLibrary();
  }, [controller, refreshLibrary]);

  const selectParagraph = useCallback(
    (index: number, autoplay: boolean) => {
      controller.goTo(index, autoplay);
      setPanel(null);
    },
    [controller],
  );

  const preview = useCallback(() => {
    setPreviewError(null);
    controller.pause();
    const lang = doc?.language ?? 'te-IN';
    const text = PREVIEW_TEXT[lang.slice(0, 2)] ?? PREVIEW_TEXT.te;
    const backend =
      settings.engine === 'cloud'
        ? new CloudAudioBackend(() => ({ endpoint: settings.cloudEndpoint, voice: settings.cloudVoice }))
        : settings.engine === 'gemini'
          ? new GeminiAudioBackend(() => ({ apiKey: geminiApiKey, model: settings.geminiModel, voice: settings.geminiVoice }))
          : new DeviceSpeechBackend();
    backend.speak(
      text,
      { lang, voiceURI: settings.voiceURI, rate: settings.rate, pitch: settings.pitch },
      { onStart: () => undefined, onEnd: () => backend.dispose(), onError: (m) => (setPreviewError(m), backend.dispose()) },
      [],
    );
  }, [controller, doc, geminiApiKey, settings]);

  const addBookmark = useCallback(async () => {
    if (!doc) return;
    const text = doc.paragraphs[snapshot.paragraphIndex]?.text ?? '';
    await store.addBookmark({ docId: doc.id, paragraphIndex: snapshot.paragraphIndex, label: text.slice(0, 80), createdAt: Date.now() });
    setBookmarks(await store.listBookmarks(doc.id));
  }, [doc, snapshot.paragraphIndex]);

  const removeBookmark = useCallback(
    async (b: Bookmark) => {
      if (!doc || b.id === undefined) return;
      await store.deleteBookmark(b.id);
      setBookmarks(await store.listBookmarks(doc.id));
    },
    [doc],
  );

  const chapter = useMemo(() => currentChapterTitle(doc, snapshot.paragraphIndex), [doc, snapshot.paragraphIndex]);
  const percent = doc ? Math.round(((snapshot.paragraphIndex + 1) / doc.paragraphs.length) * 100) : 0;
  const activeVoice = settings.engine === 'device' ? pickVoice(voices, settings.voiceURI, doc?.language ?? 'te-IN') : null;
  const voiceStatus =
    settings.engine === 'gemini'
      ? `Gemini TTS: ${settings.geminiVoice}`
      : settings.engine === 'cloud'
        ? `ఆడియో మోడ్: ${settings.cloudVoice}`
      : !speechOk
        ? 'మాటల సదుపాయం లేదు'
        : !voicesLoaded
          ? 'వాయిస్‌లు లోడ్ అవుతున్నాయి…'
          : activeVoice
            ? `${isTeluguVoice(activeVoice) ? '' : '⚠ '}వాయిస్: ${activeVoice.name}`
            : '⚠ సరిపోయే వాయిస్ లేదు';
  const playing = snapshot.status === 'playing';

  return (
    <div className="app">
      <a className="skip" href="#main">
        ప్రధాన భాగానికి వెళ్లండి
      </a>
      <header className="topbar">
        {doc ? (
          <button type="button" className="icon-btn" onClick={closeDocument} aria-label="లైబ్రరీకి తిరిగి">
            ←
          </button>
        ) : (
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={36} height={36} />
        )}
        <div className="grow title-block">
          <h1>{doc ? doc.title : 'తెలుగు పఠనం'}</h1>
          {doc && <div className="muted small ellipsis">{chapter || '—'}</div>}
        </div>
        <button type="button" className="icon-btn" onClick={() => setPanel('settings')} aria-label="సెట్టింగ్‌లు, సహాయం">
          ⚙
        </button>
      </header>

      {message && (
        <div className={message.kind === 'error' ? 'banner error' : 'banner info'} role={message.kind === 'error' ? 'alert' : 'status'}>
          <span className="grow">{message.text}</span>
          <button type="button" className="icon-btn" onClick={() => setMessage(null)} aria-label="సందేశం మూసివేయి">
            ✕
          </button>
        </div>
      )}

      {!doc ? (
        <Library documents={documents} progress={progressMap} importing={importing} onImport={handleImport} onOpen={openDocument} onDelete={handleDelete} />
      ) : (
        <>
          <nav className="toolbar" aria-label="డాక్యుమెంట్ నావిగేషన్">
            <button type="button" onClick={() => setPanel('chapters')}>
              📑 అధ్యాయాలు
            </button>
            <button type="button" onClick={() => setPanel('paragraphs')}>
              ¶ పేరాగ్రాఫ్‌లు
            </button>
            <button type="button" onClick={() => setPanel('bookmarks')}>
              🔖 బుక్‌మార్క్‌లు
            </button>
            <button type="button" onClick={() => setPanel('voice')}>
              🗣 వాయిస్
            </button>
            <button type="button" onClick={() => setPanel('downloads')}>
              📥 ఆడియో డౌన్‌లోడ్
            </button>
          </nav>
          <main className="reader" id="main" lang={doc.language.slice(0, 2)}>
            {doc.paragraphs.map((p, i) => {
              const Tag = p.level ? (`h${Math.min(p.level + 1, 6)}` as 'h2') : 'p';
              return (
                <Tag
                  key={i}
                  ref={(el: HTMLElement | null) => {
                    paragraphRefs.current[i] = el;
                  }}
                  className={`para${i === snapshot.paragraphIndex ? ' current' : ''}`}
                  aria-current={i === snapshot.paragraphIndex ? 'true' : undefined}
                  onClick={() => controller.goTo(i)}
                >
                  {p.text}
                </Tag>
              );
            })}
          </main>
          <footer className="player" aria-label="ప్లేయర్">
            <div className="player-info">
              <div className="row small">
                <span className="grow" role="status" aria-live="polite">
                  {STATUS_LABEL[snapshot.status]}
                  {snapshot.status === 'error' && snapshot.error ? `: ${snapshot.error}` : ''}
                </span>
                <span>
                  పేరా {snapshot.paragraphIndex + 1}/{doc.paragraphs.length} · {percent}%
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
              <div className="muted small ellipsis">{voiceStatus}</div>
            </div>
            <div className="controls">
              <button type="button" className="ctrl" onClick={() => controller.previous()} aria-label="వెనుక పేరా" title="వెనుక (←)">
                ⏮<span>వెనుక</span>
              </button>
              <button type="button" className="ctrl" onClick={() => controller.restartParagraph()} aria-label="పేరాగ్రాఫ్ మొదటి నుంచి" title="పేరాగ్రాఫ్ మొదటి నుంచి (R)">
                ↺<span>మొదటి నుంచి</span>
              </button>
              <button
                type="button"
                className="ctrl play"
                onClick={() => controller.toggle()}
                aria-label={playing ? 'పాజ్' : 'ప్లే'}
                aria-pressed={playing}
                title="ప్లే / పాజ్ (Space)"
              >
                {playing ? '⏸' : '▶'}
                <span>{playing ? 'పాజ్' : 'ప్లే'}</span>
              </button>
              <button type="button" className="ctrl" onClick={() => controller.next()} aria-label="ముందు పేరా" title="ముందు (→)">
                ⏭<span>ముందు</span>
              </button>
            </div>
          </footer>
        </>
      )}

      {doc && panel === 'chapters' && (
        <Sheet title="అధ్యాయాలు" onClose={() => setPanel(null)}>
          <ChaptersPanel doc={doc} current={snapshot.paragraphIndex} onSelect={(i) => selectParagraph(i, true)} />
        </Sheet>
      )}
      {doc && panel === 'paragraphs' && (
        <Sheet title="పేరాగ్రాఫ్‌లు" onClose={() => setPanel(null)}>
          <ParagraphsPanel doc={doc} current={snapshot.paragraphIndex} onSelect={(i) => selectParagraph(i, false)} />
        </Sheet>
      )}
      {doc && panel === 'bookmarks' && (
        <Sheet title="బుక్‌మార్క్‌లు" onClose={() => setPanel(null)}>
          <BookmarksPanel bookmarks={bookmarks} doc={doc} current={snapshot.paragraphIndex} onAdd={addBookmark} onDelete={removeBookmark} onSelect={(i) => selectParagraph(i, false)} />
        </Sheet>
      )}
      {doc && panel === 'downloads' && (
        <Sheet title="Gemini ఆడియో డౌన్‌లోడ్" onClose={() => setPanel(null)}>
          {settings.engine !== 'gemini' && (
            <p className="notice">
              ముందుగా వాయిస్ → Gemini TTS ఎంచుకుని API key ఇవ్వండి. API key పేజీ తెరిచి ఉన్నంతసేపు మాత్రమే ఉంటుంది.
            </p>
          )}
          <GeminiDownloads
            doc={doc}
            apiKey={geminiApiKey}
            model={settings.geminiModel}
            voice={settings.geminiVoice}
            rate={settings.rate}
            pronunciations={settings.pronunciations}
            onPrepare={() => controller.pause()}
          />
        </Sheet>
      )}
      {panel === 'voice' && (
        <Sheet title="వాయిస్" onClose={() => setPanel(null)}>
          <VoicePanel
            settings={settings}
            update={updateSettings}
            voices={voices}
            voicesLoaded={voicesLoaded}
            speechSupported={speechOk}
            docLang={doc?.language ?? 'te-IN'}
            onPreview={preview}
            previewError={previewError}
            geminiApiKey={geminiApiKey}
            onGeminiApiKeyChange={setGeminiApiKey}
          />
        </Sheet>
      )}
      {panel === 'settings' && (
        <Sheet title="సెట్టింగ్‌లు & సహాయం" onClose={() => setPanel(null)}>
          {!doc && (
            <div className="stack">
              <OpenButton onImport={handleImport} disabled={!!importing} />
              <button type="button" onClick={() => setPanel('voice')}>
                🗣 వాయిస్ ఎంచుకోండి
              </button>
            </div>
          )}
          <SettingsPanel
            settings={settings}
            update={updateSettings}
            registration={player.registration}
            usesMediaElement={player.backend.usesMediaElement}
            mediaLog={player.mediaLog}
            outputEvents={player.outputEvents}
            clearMediaLog={player.clearMediaLog}
            storage={storageInfo}
            onClearAll={handleClearAll}
          />
        </Sheet>
      )}
    </div>
  );
}
