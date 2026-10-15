# తెలుగు పఠనం (Telugu Reader)

Telugu Word (.docx), EPUB and text (.txt) documents ను అధ్యాయాల వారీగా తెరిచి, ఫోన్ వాయిస్‌తో
వినడానికి ఒక వెబ్ యాప్ (PWA). డాక్యుమెంట్లు మీ ఫోన్ బ్రౌజర్‌లోనే ఉంటాయి — ఎక్కడికీ అప్‌లోడ్ కావు.

- 🌐 **యాప్ తెరవండి:** https://vkhari22-debug.github.io/telugu-pathanam/
  (మొదటి deploy పూర్తయ్యాక పని చేస్తుంది; ప్రచురణ స్థితి READMEలోని Deployment విభాగంలో చూడండి.)
- ⚠️ పరిమితులు: [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
- ✅ టెస్ట్ చెక్‌లిస్ట్: [docs/TESTING.md](docs/TESTING.md)

---

## సులభమైన సూచనలు (తెలుగులో)

### 1. సైట్ తెరవడం
1. Android ఫోన్‌లో Chrome తెరిచి పై యాప్ లింక్ నొక్కండి.
2. మొదటిసారి తెరవడానికి ఇంటర్నెట్ అవసరం; తర్వాత app shell offlineలో కూడా తెరుచుకుంటుంది.

### 2. యాప్‌గా ఇన్‌స్టాల్ చేయడం (ఐచ్ఛికం)
1. Chrome లో కుడి పైన **⋮** (మూడు చుక్కలు) నొక్కండి.
2. **"యాప్‌ను ఇన్‌స్టాల్ చేయండి"** లేదా **"హోమ్ స్క్రీన్‌కు జోడించండి"** ఎంచుకోండి.
3. హోమ్ స్క్రీన్‌పై "తెలుగు పఠనం" ఐకాన్ వస్తుంది. ఇంటర్నెట్ లేకపోయినా యాప్ తెరుచుకుంటుంది.

> ఇన్‌స్టాల్ చేయడం వల్ల బ్లూటూత్ బటన్లు / లాక్ స్క్రీన్ పరిమితులు తొలగిపోవు. వివరాలకు
> [LIMITATIONS](docs/LIMITATIONS.md) చూడండి.

### 3. డాక్యుమెంట్ తెరవడం
1. **"డాక్యుమెంట్ తెరవండి"** బటన్ నొక్కండి.
2. ఫోన్‌లోని `.docx`, `.epub` లేదా `.txt` ఫైల్ ఎంచుకోండి.
3. ఫైల్ లైబ్రరీలో సేవ్ అవుతుంది. తర్వాత మళ్లీ ఎంచుకోవాల్సిన అవసరం లేదు.
4. పాత `.doc` ఫైల్ అయితే Word / Google Docs లో తెరిచి **.docx గా సేవ్** చేయండి.
   DRM ఉన్న (కొనుగోలు చేసిన, లాక్ చేసిన) EPUB లు తెరుచుకోవు.

### 4. చదవడం / వినడం
- **అధ్యాయాలు** → ఒక అధ్యాయం నొక్కితే అక్కడి నుంచి వరుసగా చదువుతుంది.
- **పేరాగ్రాఫ్‌లు** → ఏ పేరాకైనా వెళ్లవచ్చు, పదాలతో వెతకవచ్చు.
- **ప్లే / పాజ్**, **⏮ వెనుక**, **⏭ ముందు**, **↺ మొదటి నుంచి** (ప్రస్తుత పేరా మళ్లీ).
- **బుక్‌మార్క్‌లు** → ముఖ్యమైన చోట గుర్తు పెట్టుకోండి.
- మళ్లీ యాప్ తెరిస్తే **ఆపిన పేరా వద్దే** తెరుచుకుంటుంది (ఆటోమేటిక్‌గా చదవడం మొదలుపెట్టదు — ప్లే నొక్కండి).
- **📥 ఆడియో డౌన్‌లోడ్** → Gemini TTS ఎంచుకుని API key ఇచ్చాక ఒక్కో అధ్యాయం లేదా పూర్తి డాక్యుమెంట్‌ను ఒక WAV ఫైల్‌గా తయారుచేయండి. “మౌనంగా తయారు చేసి డౌన్‌లోడ్ చేయి” ఎంపికలో ఆడియో ప్లే కాదు; తయారైన తర్వాత కింద ప్లేయర్‌లో వినవచ్చు. ఈ అభ్యర్థనలు Gemini API quota/ఖర్చు వాడతాయి.

### 5. వాయిస్ ఎంచుకోవడం
1. **వాయిస్** బటన్ నొక్కండి. తెలుగు వాయిస్‌లు ★ గుర్తుతో పైన కనిపిస్తాయి.
2. **వేగం** మరియు **స్వరస్థాయి (Pitch)** సర్దుబాటు చేసి **"🔊 వాయిస్ పరీక్ష"** తో పరీక్షించండి.
3. **Gemini TTS** కావాలంటే ఇంజిన్‌లో ఎంచుకుని, Gemini API key, మోడల్, వాయిస్ ఎంచుకోండి.
   **🔊 Gemini API / వాయిస్ పరీక్ష** నొక్కితే నిజమైన చిన్న API అభ్యర్థన చేస్తుంది.
   చదివే పేరాలు కూడా Googleకి పంపబడతాయి; internet మరియు API billing అవసరం.
   API key ఈ పేజీ తెరిచి ఉన్నంతసేపే memoryలో ఉంటుంది, reload చేస్తే మళ్లీ ఇవ్వాలి.
   Google AI Studioలో ఆ keyకి API/referrer restrictions, ఖర్చు పరిమితులు పెట్టండి.
4. తెలుగు వాయిస్ కనిపించకపోతే:
   ఫోన్ **Settings → System → Languages & input → Text-to-speech output** →
   **Speech Services by Google** ⚙️ → **Install voice data** → **తెలుగు (భారతదేశం)** డౌన్‌లోడ్ చేసి,
   Chrome ను పూర్తిగా మూసి మళ్లీ తెరవండి.
5. **ఉచ్చారణ మార్పులు**: ఒక పదం తప్పుగా పలికితే, దాన్ని ఎలా పలకాలో రాయవచ్చు. అసలు డాక్యుమెంట్ మారదు.

### 6. బ్లూటూత్ హెడ్‌సెట్ గురించి నిజం
- **ఫోన్ వాయిస్** మోడ్‌లో Android Chrome సాధారణంగా హెడ్‌సెట్ బటన్లను ఈ పేజీకి పంపదు.
  (ఇది బ్రౌజర్ పరిమితి — యాప్ లోపం కాదు.)
- **ఆడియో మోడ్** (మీ స్వంత క్లౌడ్ వాయిస్ సర్వర్ — [server/README.md](server/README.md)) లో
  నిజమైన ఆడియో ప్లే అవుతుంది, కాబట్టి హెడ్‌సెట్ బటన్లు / లాక్ స్క్రీన్ కంట్రోల్స్ పని చేసే అవకాశం ఎక్కువ.
  ఇది ఇంటర్నెట్ అవసరం, టెక్స్ట్ సర్వర్‌కు పంపబడుతుంది, Google ఛార్జీలు ఉండవచ్చు.
- **Gemini TTS** కూడా నిజమైన WAV ఆడియో ప్లే చేస్తుంది. API keyని యాప్‌లో స్వయంగా నమోదు చేయాలి.
  అది browser memoryలో మాత్రమే ఉంటుంది; అయినా browserలో API key వాడటం పూర్తిగా రహస్యంగా ఉండదు.
  మీ స్వంత restrictions ఉన్న key మాత్రమే వాడండి. Physical headset/lock-screen పరీక్షలు ఇంకా చేయలేదు.
- **సెట్టింగ్‌లు → హెడ్‌సెట్ బటన్ పరీక్ష** లో మీ బటన్ నొక్కినప్పుడు ఏ సంకేతం వచ్చిందో కనిపిస్తుంది.
- ఈ ఫీచర్లు నిజమైన ఫోన్‌పై ఇంకా **పరీక్షించబడలేదు** — [TESTING.md](docs/TESTING.md) లోని చెక్‌లిస్ట్ ప్రకారం పరీక్షించి చూడండి.

### 7. డేటా
- అన్నీ ఈ బ్రౌజర్‌లోనే (IndexedDB) సేవ్ అవుతాయి. బ్రౌజర్ డేటా క్లియర్ చేస్తే లేదా ఫోన్ స్టోరేజ్ తక్కువైతే
  అవి పోవచ్చు. అసలు ఫైళ్లను వేరేగా ఉంచుకోండి.
- లైబ్రరీలో 🗑 తో ఒక్కో డాక్యుమెంట్, **సెట్టింగ్‌లు → అన్ని డేటా తొలగించు** తో అంతా తొలగించవచ్చు.

---

## For developers

Stack: React 18 + TypeScript + Vite 6, `vite-plugin-pwa` (Workbox), `jszip` (DOCX/EPUB parsing,
no HTML injection — text is extracted from XML into plain strings), `idb` (IndexedDB).

```bash
npm ci                 # reproducible install from package-lock.json
npm run dev            # local dev server
npm run typecheck
npm test               # unit tests (Vitest + jsdom + fake-indexeddb)
npx playwright install chromium
npm run test:e2e       # browser tests (emulated Pixel 7, fake speechSynthesis)
BASE_PATH=/telugu-pathanam/ npm run build   # build for GitHub Pages subpath
```

`BASE_PATH` controls asset URLs, manifest `scope`/`start_url` and service-worker scope.
The app has a single screen (no client-side router), so no SPA 404 fallback is needed.

Layout:

| Path | Purpose |
|---|---|
| `src/parsers/` | DOCX (styles + inheritance + outline levels), EPUB (OPF spine, nav/NCX TOC), TXT |
| `src/tts/` | segmentation, device, own-server audio and Gemini TTS backends |
| `src/player/ReadingController.ts` | playback state machine (generation tokens against stale callbacks, interruption/auto-resume rules) |
| `src/player/mediaSession.ts`, `usePlayer.ts` | Media Session API, headset/media keys, wake lock, output-device loss |
| `src/storage/db.ts` | IndexedDB documents, progress, bookmarks, settings |
| `server/` | optional, separate cloud TTS proxy (cannot run on GitHub Pages) |
| `.github/workflows/` | CI (typecheck, unit, e2e, build) and Pages deployment |

### Deployment

`.github/workflows/deploy-pages.yml` builds and deploys to GitHub Pages on every push to `main`.
This app-only repository is public, and Pages uses **GitHub Actions** as its source.
Site URL: https://vkhari22-debug.github.io/telugu-pathanam/ .

### Privacy

No analytics, no ads, no uploads. Documents never leave the device unless you explicitly switch to
the optional cloud-audio engine, which sends the text being spoken to **your** server, or Gemini
TTS, which sends it directly to Google. No API key is embedded in source code. A Gemini key entered
in the UI stays in page memory only, but is not secret from the browser; use a restricted key.
