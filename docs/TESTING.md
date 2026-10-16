# Test report and device checklist

Labels:
- **AUTO** – automatically tested (Vitest unit tests or Playwright in emulated Android Chrome / Pixel 7, Chromium).
- **PHYSICAL** – tested on a real phone with a real headset.
- **UNVERIFIED** – not tested yet.

No physical Android phone or Bluetooth headset was available when this was built, so **no item
is PHYSICAL yet**. Registering Media Session handlers is *not* counted as hardware support.

## Automated results

Run: `npm test` (52 unit tests) and `npm run test:e2e` (8 browser tests). Both run in CI.

| Requirement | Status | Test |
|---|---|---|
| Word Heading 1–9, inherited styles, outline levels | AUTO | `docx.test.ts` – detects Heading 1–9 … |
| Bold text not treated as heading | AUTO | `docx.test.ts` – does not treat bold text … |
| EPUB spine order, nav TOC, NCX fallback, DRM rejection | AUTO | `epub.test.ts` |
| Script/style never kept from imported content | AUTO | `epub.test.ts` – never keeps script … |
| Telugu text preservation (DOCX, UTF-8/UTF-16 TXT) | AUTO | `docx.test.ts`, `text.test.ts` |
| Long-paragraph segmentation without loss, no broken conjuncts | AUTO | `text.test.ts` |
| Pronunciation rules affect speech only | AUTO | `text.test.ts` |
| Chapter selection starts there and continues in order | AUTO | `app.spec.ts` (e2e) |
| Continuous reading, no skips or repeats | AUTO | `controller.test.ts`, `app.spec.ts` |
| Pause / resume | AUTO | `controller.test.ts`, `app.spec.ts` |
| Restart current paragraph | AUTO | `controller.test.ts`, `app.spec.ts` |
| Previous-button rule | AUTO | `controller.test.ts` |
| Toggle exactly once; duplicate press guard | AUTO | `controller.test.ts`, `storage-media.test.ts` |
| Stale callbacks ignored after pause/next/chapter change | AUTO | `controller.test.ts` |
| Interruption → resume from paragraph start; manual pause cancels | AUTO (logic, simulated events) | `controller.test.ts` |
| Headset disconnect → pause, stays paused | AUTO (logic, simulated) | `controller.test.ts` |
| Saved progress per document; resume without autoplay | AUTO | `storage-media.test.ts`, `app.spec.ts` |
| Missing voices / TTS errors keep position | AUTO | `controller.test.ts`, `app.spec.ts` |
| Telugu voices listed first | AUTO | `storage-media.test.ts`, `app.spec.ts` |
| Gemini TTS request format, audio extraction, request header, playback rate, missing-key error | AUTO (mocked API) | `gemini.test.ts` |
| Gemini key is not persisted after reload | AUTO (emulated browser) | `app.spec.ts` |
| Chapter download range, sequential Gemini requests, one WAV download, silent mode/player | AUTO (mocked API) | `app.spec.ts` |
| Concatenated WAV headers/data and incompatible-format rejection | AUTO | `wav.test.ts` |
| Document/chapter cost assumptions, rates, request counts and 2027 price change | AUTO | `geminiCost.test.ts` |
| Silent key test success, missing key, quota error, USD/INR estimate | AUTO (mocked API) | `app.spec.ts` |
| Search, bookmarks, delete, unsupported-file errors | AUTO | `app.spec.ts` |
| Mobile layout (no horizontal overflow, large controls) | AUTO (emulated) | `app.spec.ts` |
| Offline application loading (service worker) | AUTO | `app.spec.ts` |

## Physical device checklist

Fill in device, Android version, browser + version, headset model. Use Settings →
**🎧 హెడ్‌సెట్ బటన్ పరీక్ష** to see whether each press reached the page.

Test each row in all engines: **D** = phone voice, **A** = audio mode (own server), **G** = Gemini TTS (API key).

| # | Test | Visible site | Google Maps visible | Screen locked |
|---|---|---|---|---|
| 1 | Play button starts/resumes | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 2 | Pause button pauses immediately | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 3 | Single Play/Pause button toggles exactly once | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 4 | Next → next paragraph | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 5 | Previous → restart / previous paragraph (rule below) | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 6 | Headset disconnect pauses | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 7 | Lock-screen media controls appear and work | — | — | D: UNVERIFIED · A: UNVERIFIED |
| 8 | Continuous background playback ≥ 30 min | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 9 | Maps prompt pauses narration | — | D: UNVERIFIED · A: UNVERIFIED | D: UNVERIFIED · A: UNVERIFIED |
| 10 | After prompt: interrupted paragraph restarts from beginning | — | A: UNVERIFIED (D: not supported) | A: UNVERIFIED (D: not supported) |
| 11 | Pause during prompt → stays paused | — | A: UNVERIFIED | A: UNVERIFIED |
| 12 | Repeated prompts: no overlap, no skipped text | — | A: UNVERIFIED | A: UNVERIFIED |

Gemini API request/audio handling tests are mocked; no real API request was made because no API key
was supplied. Gemini physical playback and device control behavior are also **UNVERIFIED**.
Because Gemini also plays WAV through an HTML audio element, its expected headset behavior is
similar to A, but must be tested separately on the actual phone/browser.

Expected for **D** (phone voice) on Android Chrome: rows 1–7 most likely **do not work**
(no media session). This is a browser limitation; see [LIMITATIONS.md](LIMITATIONS.md).

**Previous rule:** while playing, if the paragraph has been playing more than 3 seconds or is
past its first segment → restart the current paragraph; otherwise → previous paragraph.
While paused → previous paragraph.

### How to test Google Maps

1. Start a navigation route in Google Maps (voice on), then open the reader and press Play.
2. Bring Maps to the foreground (column 2) or lock the phone (column 3).
3. Wait for a spoken direction. Note whether narration paused, ducked or kept playing, and
   where it resumed.
4. During a prompt press Pause on the headset; after the prompt it must stay paused.
