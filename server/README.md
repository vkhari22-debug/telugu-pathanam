# Optional cloud voice server (క్లౌడ్ వాయిస్ సర్వర్ — ఐచ్ఛికం)

The web app works **without** this server, using the voices on your phone (device speech).
This server is only needed for the **"ఆడియో మోడ్ (మీ స్వంత క్లౌడ్ వాయిస్ సర్వర్)"** engine. That engine plays real audio files
through an HTML `<audio>` element, which is what Android Chrome needs to route
Bluetooth headset buttons, lock-screen controls and audio-focus pauses (e.g. Google Maps
prompts) to the page.

## Important facts

- **GitHub Pages cannot host this server.** Pages only serves static files. Run it on a Node 18+
  host (Cloud Run, Render, Fly.io, a home PC, …).
- **Text is sent over the internet.** Each paragraph segment you listen to is sent to this server
  and then to Google Cloud Text-to-Speech. Do not use cloud mode for private documents you
  don't want to transmit.
- **Internet required.** Cloud mode does not work offline.
- **Costs.** Google Cloud TTS is billed per character after the free tier
  (see https://cloud.google.com/text-to-speech/pricing). Set a billing budget/alert.
  A whole book can be hundreds of thousands of characters.
- **The API key stays on the server.** It is never sent to the browser, never stored in the
  browser and must never be committed to GitHub.

## Setup

1. Create a Google Cloud project, enable "Cloud Text-to-Speech API", create an API key and
   restrict it to that API.
2. Set environment variables (see `.env.example`):
   - `GOOGLE_TTS_API_KEY` – the key
   - `ALLOWED_ORIGINS` – the web app origin, e.g. `https://vkhari22-debug.github.io`
3. Run: `node server/index.mjs` (Node 18+; no npm packages needed).
4. In the app: వాయిస్ → "ఆడియో మోడ్" → enter the server's `https://` address and a
   voice name such as `te-IN-Standard-A`.

## API

`POST /synthesize` with JSON `{ text, languageCode, voice, speakingRate, pitch }` → `audio/mpeg`.
`GET /health` → `ok`.

Protections: origin allow-list (CORS), per-IP rate limit, maximum text length,
64 KB request limit, input validation.
