import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGeminiRequest, extractGeminiAudio, GeminiAudioBackend } from '../src/tts/geminiBackend';

describe('Gemini TTS', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds a verbatim single-speaker WAV TTS request', () => {
    expect(buildGeminiRequest('నమస్కారం', 'gemini-3.8-flash-tts', 'Kore')).toEqual({
      model: 'gemini-3.8-flash-tts',
      input: [{ type: 'user_input', content: [{ type: 'text', text: 'నమస్కారం' }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Kore' }] },
    });
  });

  it('extracts audio from both documented Interactions response shapes', () => {
    expect(extractGeminiAudio({ output_audio: { data: 'direct' } })).toBe('direct');
    expect(extractGeminiAudio({
      steps: [{ type: 'model_output', content: [{ type: 'text' }, { type: 'audio', data: 'from-steps' }] }],
    })).toBe('from-steps');
    expect(() => extractGeminiAudio({ error: { message: 'No audio returned' } })).toThrow('No audio returned');
  });

  it('sends the API key in an HTTPS header and plays returned WAV audio', async () => {
    const encoded = btoa('WAV data');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_audio: { data: encoded } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:gemini-audio');

    const audio = {
      paused: true,
      ended: false,
      src: '',
      playbackRate: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      play: vi.fn(async function (this: { paused: boolean }) { this.paused = false; }),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    const backend = new GeminiAudioBackend(() => ({ apiKey: 'test-secret', model: 'gemini-3.8-flash-tts', voice: 'Kore' }), audio);
    const onStart = vi.fn();
    backend.speak('తెలుగు పరీక్ష', { lang: 'te-IN', voiceURI: '', rate: 1.2, pitch: 1 }, {
      onStart,
      onEnd: vi.fn(),
      onError: vi.fn(),
    }, []);

    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-secret');
    expect(JSON.parse(String(init.body)).input[0].content[0].text).toBe('తెలుగు పరీక్ష');
    expect(audio.src).toBe('blob:gemini-audio');
    expect(audio.playbackRate).toBe(1.2);
    backend.dispose();
  });

  it('fails locally without a key and does not call Gemini', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const audio = {
      paused: true,
      ended: false,
      src: '',
      playbackRate: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    const backend = new GeminiAudioBackend(() => ({ apiKey: '', model: 'gemini-3.8-flash-tts', voice: 'Kore' }), audio);
    const onError = vi.fn();
    backend.speak('test', { lang: 'te-IN', voiceURI: '', rate: 1, pitch: 1 }, {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onError,
    }, []);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('Gemini API key ఇవ్వండి.'));
    expect(fetchMock).not.toHaveBeenCalled();
    backend.dispose();
  });
});
