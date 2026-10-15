import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReadingController, type PlayerSnapshot } from './ReadingController';
import { registerMediaSession, unregisterMediaSession, updateMediaSession, type MediaActionLogEntry, type MediaSessionRegistration } from './mediaSession';
import { DeviceSpeechBackend } from '../tts/deviceBackend';
import { CloudAudioBackend } from '../tts/cloudBackend';
import { GeminiAudioBackend } from '../tts/geminiBackend';
import type { SpeechBackend } from '../tts/backend';
import { applyPronunciations } from '../tts/segment';
import type { Settings, StoredDocument } from '../types';

const EMPTY: PlayerSnapshot = {
  status: 'idle',
  paragraphIndex: 0,
  segmentIndex: 0,
  segmentCount: 0,
  paragraphCount: 0,
  error: null,
  autoResumePending: false,
};

export interface PlayerApi {
  snapshot: PlayerSnapshot;
  controller: ReadingController;
  backend: SpeechBackend;
  registration: MediaSessionRegistration;
  mediaLog: MediaActionLogEntry[];
  outputEvents: string[];
  clearMediaLog(): void;
}

export function currentChapterTitle(doc: StoredDocument | null, paragraphIndex: number): string {
  if (!doc) return '';
  let title = '';
  for (const c of doc.chapters) {
    if (c.paragraphIndex <= paragraphIndex) title = c.title;
    else break;
  }
  return title;
}

export function usePlayer(doc: StoredDocument | null, settings: Settings, startIndex: number, geminiApiKey: string): PlayerApi {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const geminiApiKeyRef = useRef(geminiApiKey);
  geminiApiKeyRef.current = geminiApiKey;
  const docRef = useRef(doc);
  docRef.current = doc;

  const backends = useMemo(
    () => ({
      device: new DeviceSpeechBackend(),
      cloud: new CloudAudioBackend(() => ({ endpoint: settingsRef.current.cloudEndpoint, voice: settingsRef.current.cloudVoice })),
      gemini: new GeminiAudioBackend(() => ({
        apiKey: geminiApiKeyRef.current,
        model: settingsRef.current.geminiModel,
        voice: settingsRef.current.geminiVoice,
      })),
    }),
    [],
  );

  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(EMPTY);
  const [mediaLog, setMediaLog] = useState<MediaActionLogEntry[]>([]);
  const [outputEvents, setOutputEvents] = useState<string[]>([]);
  const [registration, setRegistration] = useState<MediaSessionRegistration>({ supported: false, registered: [], failed: [] });

  const controller = useMemo(
    () =>
      new ReadingController(backends[settings.engine], {
        prepareText: (text) => applyPronunciations(text, settingsRef.current.pronunciations),
        speakOptions: () => ({
          lang: docRef.current?.language ?? 'te-IN',
          voiceURI: settingsRef.current.voiceURI,
          rate: settingsRef.current.rate,
          pitch: settingsRef.current.pitch,
        }),
        onChange: setSnapshot,
      }),
    // The controller lives for the whole app session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (controller.getBackend() !== backends[settings.engine]) controller.setBackend(backends[settings.engine]);
  }, [settings.engine, controller, backends]);

  useEffect(() => {
    controller.load(doc ? doc.paragraphs.map((p) => p.text) : [], startIndex);
    // Only reload when the document changes; startIndex is read once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, controller]);

  const pronunciationKey = JSON.stringify(settings.pronunciations);
  useEffect(() => {
    controller.invalidateText();
  }, [pronunciationKey, controller]);

  useEffect(() => {
    const result = registerMediaSession(
      {
        play: () => controller.play(),
        pause: () => controller.pause(),
        previous: () => controller.previous(),
        next: () => controller.next(),
        restart: () => controller.restartParagraph(),
        isPlaying: () => controller.isActive(),
      },
      (entry) => setMediaLog((log) => [entry, ...log].slice(0, 30)),
    );
    setRegistration(result);
    return () => unregisterMediaSession();
  }, [controller]);

  // Keyboard fallback for media keys when the Media Session API is missing.
  useEffect(() => {
    if (registration.supported) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'MediaPlayPause') controller.toggle();
      else if (e.key === 'MediaTrackNext') controller.next();
      else if (e.key === 'MediaTrackPrevious') controller.previous();
      else return;
      setMediaLog((log) => [{ action: `key:${e.key}`, at: Date.now() }, ...log].slice(0, 30));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registration.supported, controller]);

  // Audio output removed (e.g. Bluetooth headset disconnected). Only works where
  // the browser lists audio outputs; on Android this is often unavailable.
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.enumerateDevices || !devices.addEventListener) return;
    let outputs = -1;
    const count = async () => (await devices.enumerateDevices()).filter((d) => d.kind === 'audiooutput').length;
    count().then((n) => (outputs = n)).catch(() => undefined);
    const onChange = async () => {
      try {
        const n = await count();
        setOutputEvents((events) => [`${new Date().toLocaleTimeString()} ఆడియో అవుట్‌పుట్‌లు ${outputs} → ${n}`, ...events].slice(0, 10));
        if (outputs > 0 && n < outputs) controller.outputLost();
        outputs = n;
      } catch {
        // ignore
      }
    };
    devices.addEventListener('devicechange', onChange);
    return () => devices.removeEventListener('devicechange', onChange);
  }, [controller]);

  useEffect(() => {
    if (!doc) {
      updateMediaSession({ title: '', documentTitle: '', chapter: '', playing: false, active: false, artworkBase: import.meta.env.BASE_URL });
      return;
    }
    const chapter = currentChapterTitle(doc, snapshot.paragraphIndex);
    updateMediaSession({
      title: `${chapter || doc.title} — పేరా ${snapshot.paragraphIndex + 1}/${doc.paragraphs.length}`,
      documentTitle: doc.title,
      chapter,
      playing: snapshot.status === 'playing',
      active: snapshot.status !== 'idle',
      artworkBase: import.meta.env.BASE_URL,
    });
  }, [doc, snapshot.paragraphIndex, snapshot.status]);

  // Optional: keep the screen on while reading.
  useEffect(() => {
    if (!settings.keepScreenOn || snapshot.status !== 'playing' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [settings.keepScreenOn, snapshot.status]);

  useEffect(() => () => controller.dispose(), [controller]);

  const clearMediaLog = useCallback(() => setMediaLog([]), []);

  return { snapshot, controller, backend: backends[settings.engine], registration, mediaLog, outputEvents, clearMediaLog };
}
