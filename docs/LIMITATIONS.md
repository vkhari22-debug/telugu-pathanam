# Browser and platform limitations (నిజాయితీగా పరిమితులు)

This page explains what a **website** can and cannot do on Android. Installing the site as a
PWA (home-screen app) does **not** remove any of these limits.

## 1. Speech engines

| | Phone voice (`speechSynthesis`) | Audio mode (own server) | Gemini TTS |
|---|---|---|---|
| Cost / internet | Free; offline if voice data is downloaded | Internet; Google Cloud charges | Internet; Google Gemini API billing / quotas |
| Privacy | Text stays on phone | Text sent to your server and Google | Text sent from browser to Google Gemini |
| API key | None | Kept server-side | Entered into UI, memory only; visible to browser/runtime |
| How audio is produced | OS TTS; **no media element** | Server returns MP3, played through `<audio>` | Gemini Interactions API returns WAV, played through `<audio>` |
| Bluetooth headset buttons | **Generally not delivered** | Expected — *unverified on hardware* | Expected — *unverified on hardware* |
| Lock-screen controls | Generally not shown | Expected — *unverified* | Expected — *unverified* |
| Screen off / background | Chrome may stop/throttle speech | Expected like normal web audio — *unverified* | Expected like normal web audio — *unverified* |
| Google Maps prompts | No signal available | Audio focus may pause and resume paragraph — *unverified* | Audio focus may pause and resume paragraph — *unverified* |

### Gemini API key safety

The Gemini key is held in page memory only and is **not** written to IndexedDB, local storage,
or the URL. Reloading the page clears it. However, a browser-direct API key is not a secret from
the person/browser running the page and can be seen in developer tools/network instrumentation.
Use a dedicated key with suitable API/referrer restrictions and billing limits; do not put a
production/shared key in a public site. For a public deployment, proxy Gemini through a backend
that keeps the key server-side. The spoken document text is sent directly to Google.
The selected voice names are Google's prebuilt voice IDs; the app does not claim one voice is
better for Telugu. Test the short preview and judge the pronunciation yourself.

Why: Android Chrome routes headset buttons (AVRCP) and lock-screen controls to the tab that owns
an active **media session**, which is created by playing an `<audio>`/`<video>` element.
`speechSynthesis` is not a media element, so registering Media Session handlers alone is not
enough. The app registers them anyway (some browsers/desktops do deliver them) and shows a live
**headset button test log** in Settings so you can see whether presses actually arrive.

The app deliberately does **not** play a silent audio loop to fake a media session.

## 2. Google Maps interruptions

- A web page cannot receive Android audio-focus events directly and cannot detect that another
  app (Google Maps) is speaking.
- In **audio mode**, if Android takes audio focus, Chrome pauses the `<audio>` element and the app
  sees a `pause` that it did not request. It marks the paragraph as *interrupted*. If Chrome then
  resumes playback after the transient loss, the app restarts **the interrupted paragraph from its
  beginning**. If you pressed Pause meanwhile, it stays paused.
- Maps may only **duck** (lower volume) instead of pausing; then no signal exists and narration
  simply continues quieter.
- If Chrome does not auto-resume after the prompt, press Play (or the headset button).
- Tab visibility changes and timers are **not** used to guess announcements.
- In **phone-voice mode**, no automatic handling is possible. Use Pause and
  **"పేరాగ్రాఫ్ మొదటి నుంచి"** (restart current paragraph).
- **Gemini TTS** uses Google's Interactions API and returns WAV audio; the selected speech rate
  is applied to playback. Gemini TTS's pitch is not adjustable by the app.
- Chapter/document downloads make a separate Gemini request for each short text segment,
  concatenate same-format WAV data without re-encoding, and download one `.wav` file. Large
  documents can take a long time, use substantial browser memory, or hit API quota/rate limits;
  generation is sequential and can be cancelled. The “silent” option means the generated audio
  is not played while preparing/downloading; the completed file has an audio player so it can
  be listened to on demand. Downloaded audio uses Gemini's generated pace; the player speed
  control changes only in-browser playback, not the saved WAV.

## 3. Headset disconnection

- Audio mode: Android sends "audio becoming noisy" and Chrome pauses the element. The app treats
  this like an interruption without auto-resume certainty; you press Play to continue.
- Both modes: when `navigator.mediaDevices` reports that an audio output disappeared, the app
  pauses. Many Android browsers do not expose output devices, so this may not fire.

## 4. Background and screen-off listening

- Chrome on Android may suspend background tabs, and phone makers' battery savers
  (Xiaomi, Samsung, Oppo, Vivo…) may kill them. Exclude Chrome from battery optimisation for
  better results.
- The optional "screen stays on" setting uses the Screen Wake Lock API and only works while the
  page is visible.
- Errors do not lose the position: playback stops on the current paragraph and the position is saved.

## 5. Voices and pronunciation

- Available voices depend on the phone, Android version and Google TTS voice data.
  Pronunciation quality is the TTS engine's; this app cannot improve it beyond the optional
  replacement rules.
- Offline speech works only if the voice data is installed on the phone.

## 6. Documents

- Supported: `.docx`, `.epub` (without DRM), `.txt` (UTF-8/UTF-16).
- Not supported: legacy `.doc`, `.pdf`, DRM-protected EPUB. Convert `.doc` to `.docx` in Word or Google Docs.
- Images, footnote layout and formatting are not shown; only text in reading order.

## 7. Storage

- Documents, progress, bookmarks and settings are in browser IndexedDB. Clearing site data,
  uninstalling the browser or low storage can delete them. The app asks for persistent storage,
  but the browser may refuse.

## 8. When a native Android component is needed

A reliable combination of **offline device voices + Bluetooth buttons + lock-screen controls +
Google Maps audio-focus handling** needs native Android code: `TextToSpeech` (or
`synthesizeToFile` + `MediaPlayer`), a foreground `MediaSessionService`, and an
`AudioManager.OnAudioFocusChangeListener`. A website (PWA or not) cannot do this with the
phone's built-in voices. This repository delivers the web application only; the audio mode
gives the closest web approximation at the cost of internet use and cloud charges.
