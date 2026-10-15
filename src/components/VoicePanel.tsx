import { useState } from 'react';
import type { Settings } from '../types';
import { sortVoices } from '../tts/deviceBackend';
import { isTeluguVoice } from '../tts/useVoices';
import { validateEndpoint } from '../tts/cloudBackend';

interface Props {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  voices: SpeechSynthesisVoice[];
  voicesLoaded: boolean;
  speechSupported: boolean;
  docLang: string;
  onPreview(): void;
  previewError: string | null;
  geminiApiKey: string;
  onGeminiApiKeyChange(value: string): void;
}

const GEMINI_VOICES = [
  'Kore', 'Aoede', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Callirrhoe',
  'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib',
  'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

export function VoicePanel({
  settings,
  update,
  voices,
  voicesLoaded,
  speechSupported,
  docLang,
  onPreview,
  previewError,
  geminiApiKey,
  onGeminiApiKeyChange,
}: Props) {
  const sorted = sortVoices(voices, docLang);
  const hasTelugu = voices.some(isTeluguVoice);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const endpointProblem = settings.engine === 'cloud' ? validateEndpoint(settings.cloudEndpoint) : null;

  return (
    <div className="stack">
      <fieldset className="field">
        <legend>మాటల ఇంజిన్</legend>
        <label className="radio">
          <input type="radio" name="engine" checked={settings.engine === 'device'} onChange={() => update({ engine: 'device' })} />
          <span>
            <strong>ఫోన్ వాయిస్ (ఉచితం, ఆఫ్‌లైన్ కావచ్చు)</strong>
            <br />
            <span className="muted small">బ్లూటూత్ బటన్లు, లాక్-స్క్రీన్ నియంత్రణలు సాధారణంగా పనిచేయవు.</span>
          </span>
        </label>
        <label className="radio">
          <input type="radio" name="engine" checked={settings.engine === 'cloud'} onChange={() => update({ engine: 'cloud' })} />
          <span>
            <strong>ఆడియో మోడ్ (మీ స్వంత క్లౌడ్ వాయిస్ సర్వర్)</strong>
            <br />
            <span className="muted small">నిజమైన ఆడియోగా ప్లే అవుతుంది — బ్లూటూత్ బటన్లకు ఇది అవసరం. ఇంటర్నెట్ కావాలి; పాఠ్యం మీ సర్వర్‌కు పంపబడుతుంది; ఖర్చు ఉండవచ్చు.</span>
          </span>
        </label>
        <label className="radio">
          <input type="radio" name="engine" checked={settings.engine === 'gemini'} onChange={() => update({ engine: 'gemini' })} />
          <span>
            <strong>Gemini TTS (API keyతో నిజమైన ఆడియో)</strong>
            <br />
            <span className="muted small">Gemini వాయిస్‌తో చదువుతుంది. ఇంటర్నెట్ అవసరం; చదివే పాఠ్యం Google Geminiకి పంపబడుతుంది, ఖర్చు ఉండవచ్చు.</span>
          </span>
        </label>
      </fieldset>

      {settings.engine === 'cloud' && (
        <div className="stack card">
          <label className="field">
            <span>సర్వర్ చిరునామా (https://…)</span>
            <input type="url" inputMode="url" value={settings.cloudEndpoint} onChange={(e) => update({ cloudEndpoint: e.target.value.trim() })} placeholder="https://my-tts.example.com" />
          </label>
          <label className="field">
            <span>క్లౌడ్ వాయిస్ పేరు</span>
            <input value={settings.cloudVoice} onChange={(e) => update({ cloudVoice: e.target.value.trim() })} placeholder="te-IN-Standard-A" />
          </label>
          {endpointProblem && <p className="error">{endpointProblem}</p>}
          <p className="muted small">సర్వర్ ఏర్పాటు: రిపాజిటరీలోని server/README.md చూడండి. API కీ సర్వర్‌లో మాత్రమే ఉంటుంది — ఈ యాప్‌లో ఎప్పుడూ పెట్టవద్దు.</p>
        </div>
      )}

      {settings.engine === 'gemini' && (
        <div className="stack card">
          <label className="field">
            <span>Gemini API key (ఈ సెషన్‌లో మాత్రమే; సేవ్ కాదు)</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={geminiApiKey}
              onChange={(e) => onGeminiApiKeyChange(e.target.value)}
              placeholder="Gemini API key"
            />
          </label>
          <label className="field">
            <span>Gemini TTS మోడల్</span>
            <select value={settings.geminiModel} onChange={(e) => update({ geminiModel: e.target.value })}>
              <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS — సహజ వాయిస్</option>
              <option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash-Lite TTS — వేగవంతం</option>
            </select>
          </label>
          <label className="field">
            <span>Gemini వాయిస్</span>
            <select value={settings.geminiVoice} onChange={(e) => update({ geminiVoice: e.target.value })}>
              {GEMINI_VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
            </select>
          </label>
          <p className="notice small">
            API key ఈ పేజీ తెరిచి ఉన్నంతసేపు మాత్రమే మెమరీలో ఉంటుంది; IndexedDBలో లేదా URLలో నిల్వ చేయము.
            అయినా బ్రౌజర్‌లో key వాడటం పూర్తిగా రహస్యమైన పద్ధతి కాదు—మీ వ్యక్తిగత Google AI Studio key మాత్రమే వాడండి,
            Google AI Studioలో restrictions/ఖర్చు పరిమితులు పెట్టండి. బహిరంగ వెబ్‌సైట్‌లో key పెట్టవద్దు.
            Play బటన్ ద్వారా చిన్న వాక్యాన్ని Gemini APIకి పంపి నిజమైన వాయిస్ పరీక్ష జరుగుతుంది.
          </p>
        </div>
      )}

      {settings.engine === 'device' && (
        <>
          {!speechSupported && <p className="error">ఈ బ్రౌజర్‌లో మాటల సదుపాయం (speechSynthesis) లేదు. Chrome వాడండి.</p>}
          {speechSupported && voicesLoaded && !hasTelugu && (
            <div className="notice">
              <strong>తెలుగు వాయిస్ దొరకలేదు.</strong>
              <ol>
                <li>ఫోన్ Settings → System → Languages &amp; input → Text-to-speech output తెరవండి.</li>
                <li>“Speech Services by Google” ఎంచుకుని ⚙ → Install voice data → తెలుగు (Telugu) డౌన్‌లోడ్ చేయండి.</li>
                <li>Chrome పూర్తిగా మూసి మళ్లీ తెరవండి.</li>
              </ol>
              <span className="small">కొన్ని బ్రౌజర్లు (ఉదా: Firefox) ఫోన్ వాయిస్‌లను చూపకపోవచ్చు.</span>
            </div>
          )}
          <label className="field">
            <span>వాయిస్ ({voices.length})</span>
            <select value={settings.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
              <option value="">స్వయంచాలకం (డాక్యుమెంట్ భాష)</option>
              {sorted.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {isTeluguVoice(v) ? '★ ' : ''}
                  {v.name} ({v.lang}){v.localService ? '' : ' · ఆన్‌లైన్'}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label className="field">
        <span>వేగం: {settings.rate.toFixed(2)}×</span>
        <input type="range" min={0.5} max={2} step={0.05} value={settings.rate} onChange={(e) => update({ rate: Number(e.target.value) })} />
      </label>
      {settings.engine !== 'gemini' && (
        <label className="field">
          <span>స్వరస్థాయి (Pitch): {settings.pitch.toFixed(2)}</span>
          <input type="range" min={0.5} max={1.5} step={0.05} value={settings.pitch} onChange={(e) => update({ pitch: Number(e.target.value) })} />
        </label>
      )}
      <button type="button" onClick={onPreview}>
        {settings.engine === 'gemini' ? '🔊 Gemini API / వాయిస్ పరీక్ష' : '🔊 వాయిస్ పరీక్ష'}
      </button>
      {previewError && <p className="error">{previewError}</p>}

      <details className="card">
        <summary>ఉచ్చారణ మార్పులు ({settings.pronunciations.length})</summary>
        <p className="muted small">చదివేటప్పుడు మాత్రమే పదాన్ని మారుస్తుంది. అసలు డాక్యుమెంట్ మారదు.</p>
        <ul className="para-list">
          {settings.pronunciations.map((r, i) => (
            <li key={i} className="row">
              <span className="grow">
                {r.from} → {r.to}
              </span>
              <button
                type="button"
                className="icon-btn danger"
                aria-label={`${r.from} నియమం తొలగించు`}
                onClick={() => update({ pronunciations: settings.pronunciations.filter((_, j) => j !== i) })}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!from.trim()) return;
            update({ pronunciations: [...settings.pronunciations, { from: from.trim(), to: to.trim() }] });
            setFrom('');
            setTo('');
          }}
        >
          <input aria-label="ఈ పదం" placeholder="ఈ పదం (ఉదా: YSS)" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label="ఇలా చదవాలి" placeholder="ఇలా చదవాలి" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="submit">జోడించు</button>
        </form>
      </details>
    </div>
  );
}
