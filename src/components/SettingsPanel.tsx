import type { MediaActionLogEntry, MediaSessionRegistration } from '../player/mediaSession';
import type { Settings, ThemeChoice } from '../types';

interface Props {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  registration: MediaSessionRegistration;
  usesMediaElement: boolean;
  mediaLog: MediaActionLogEntry[];
  outputEvents: string[];
  clearMediaLog(): void;
  storage: { usage?: number; quota?: number; persisted?: boolean };
  onClearAll(): void;
}

const ACTION_LABEL: Record<string, string> = {
  play: 'ప్లే',
  pause: 'పాజ్',
  stop: 'ఆపు',
  nexttrack: 'తర్వాతి పేరా',
  previoustrack: 'వెనుక',
  seekbackward: 'వెనక్కి (పేరా మొదటి నుంచి)',
  seekforward: 'ముందుకు (తర్వాతి పేరా)',
};

const mb = (n?: number) => (n === undefined ? '?' : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function SettingsPanel({ settings, update, registration, usesMediaElement, mediaLog, outputEvents, clearMediaLog, storage, onClearAll }: Props) {
  return (
    <div className="stack">
      <fieldset className="field">
        <legend>థీమ్</legend>
        <div className="row">
          {(
            [
              ['system', 'ఫోన్ ప్రకారం'],
              ['light', 'వెలుగు'],
              ['dark', 'చీకటి'],
            ] as [ThemeChoice, string][]
          ).map(([value, label]) => (
            <label key={value} className="chip">
              <input type="radio" name="theme" checked={settings.theme === value} onChange={() => update({ theme: value })} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <span className="grow">అక్షర పరిమాణం</span>
        <button type="button" onClick={() => update({ fontScale: Math.max(0.8, +(settings.fontScale - 0.1).toFixed(1)) })} aria-label="అక్షరాలు చిన్నవి">
          A−
        </button>
        <button type="button" onClick={() => update({ fontScale: Math.min(1.8, +(settings.fontScale + 0.1).toFixed(1)) })} aria-label="అక్షరాలు పెద్దవి">
          A+
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.autoScroll} onChange={(e) => update({ autoScroll: e.target.checked })} /> చదువుతున్న పేరాకు స్వయంగా స్క్రోల్ చేయి
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.keepScreenOn} onChange={(e) => update({ keepScreenOn: e.target.checked })} /> చదివేటప్పుడు స్క్రీన్ ఆన్‌లో ఉంచు (ఫోన్ వాయిస్‌తో స్క్రీన్ ఆపితే చదవడం ఆగిపోవచ్చు)
      </label>

      <section className="card" aria-labelledby="hs-title">
        <h3 id="hs-title">🎧 హెడ్‌సెట్ బటన్ పరీక్ష</h3>
        <ul className="small">
          <li>Media Session API: {registration.supported ? `నమోదైంది (${registration.registered.length} చర్యలు)` : 'ఈ బ్రౌజర్‌లో లేదు'}</li>
          {registration.failed.length > 0 && <li>నమోదు కాని చర్యలు: {registration.failed.join(', ')}</li>}
          <li>ప్రస్తుత ఇంజిన్ నిజమైన ఆడియో ప్లే చేస్తుందా: {usesMediaElement ? 'అవును (ఆడియో మోడ్)' : 'లేదు (ఫోన్ వాయిస్)'}</li>
        </ul>
        <p className="notice small">
          “నమోదైంది” అంటే బటన్లు పనిచేస్తాయని హామీ కాదు. చదువుతున్నప్పుడు హెడ్‌సెట్ బటన్ నొక్కండి — కింద ఆ నొక్కుడు కనిపిస్తే మాత్రమే మీ ఫోన్‌లో నిజంగా పనిచేస్తోంది.
        </p>
        {mediaLog.length === 0 ? (
          <p className="muted small">ఇంకా ఏ బటన్ సంకేతం అందలేదు.</p>
        ) : (
          <ol className="log" aria-live="polite">
            {mediaLog.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                {new Date(e.at).toLocaleTimeString()} — {ACTION_LABEL[e.action] ?? e.action}
              </li>
            ))}
          </ol>
        )}
        {outputEvents.length > 0 && (
          <ol className="log">
            {outputEvents.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ol>
        )}
        <button type="button" onClick={clearMediaLog}>
          లాగ్ తుడిచివేయి
        </button>
      </section>

      <section className="card" aria-labelledby="kb-title">
        <h3 id="kb-title">⌨ కీబోర్డ్</h3>
        <p className="small">Space / K: ప్లే-పాజ్ · → / N: తర్వాతి పేరా · ← / P: వెనుక · R: పేరా మొదటి నుంచి · Esc: ప్యానెల్ మూసివేయి</p>
      </section>

      <section className="card" aria-labelledby="st-title">
        <h3 id="st-title">💾 నిల్వ</h3>
        <p className="small">
          డాక్యుమెంట్లు, బుక్‌మార్క్‌లు, చదివిన స్థానం ఈ బ్రౌజర్‌లోనే (IndexedDB) ఉంటాయి. వాడుక: {mb(storage.usage)} / {mb(storage.quota)}.{' '}
          {storage.persisted ? 'శాశ్వత నిల్వ అనుమతి ఉంది.' : 'శాశ్వత నిల్వ అనుమతి లేదు — స్థలం తక్కువైతే బ్రౌజర్ డేటాను తొలగించవచ్చు.'} బ్రౌజర్ డేటా/కుకీలు క్లియర్ చేస్తే ఇవన్నీ పోతాయి.
          అసలు ఫైళ్లను మీ దగ్గర భద్రంగా ఉంచుకోండి.
        </p>
        <button type="button" className="danger" onClick={onClearAll}>
          అన్ని డేటా తొలగించు
        </button>
      </section>
    </div>
  );
}
