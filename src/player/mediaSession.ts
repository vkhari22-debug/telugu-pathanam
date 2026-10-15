export type MediaActionName = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'stop' | 'seekbackward' | 'seekforward';

export interface MediaActionLogEntry {
  action: string;
  at: number;
}

export interface MediaCommands {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  restart(): void;
  isPlaying(): boolean;
}

export interface MediaSessionRegistration {
  supported: boolean;
  registered: MediaActionName[];
  failed: MediaActionName[];
}

/** Two identical toggle events closer than this are treated as one press. */
export const DUPLICATE_PRESS_MS = 300;

export function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

/**
 * Registers Media Session action handlers. Registration only proves the
 * browser accepted the handlers; whether a Bluetooth headset's buttons reach
 * them depends on the browser and on audio playing through a media element.
 */
export function registerMediaSession(commands: MediaCommands, log: (entry: MediaActionLogEntry) => void): MediaSessionRegistration {
  const result: MediaSessionRegistration = { supported: mediaSessionSupported(), registered: [], failed: [] };
  if (!result.supported) return result;
  let lastToggle = { action: '', at: 0 };
  const guard = (action: string, run: () => void) => () => {
    const at = Date.now();
    log({ action, at });
    if ((action === 'play' || action === 'pause') && lastToggle.action === action && at - lastToggle.at < DUPLICATE_PRESS_MS) return;
    if (action === 'play' || action === 'pause') lastToggle = { action, at };
    run();
  };
  const handlers: Record<MediaActionName, () => void> = {
    play: guard('play', () => commands.play()),
    pause: guard('pause', () => commands.pause()),
    stop: guard('stop', () => commands.pause()),
    previoustrack: guard('previoustrack', () => commands.previous()),
    nexttrack: guard('nexttrack', () => commands.next()),
    // Some headsets/watches send seek actions instead of track actions.
    seekbackward: guard('seekbackward', () => commands.restart()),
    seekforward: guard('seekforward', () => commands.next()),
  };
  for (const [name, handler] of Object.entries(handlers) as [MediaActionName, () => void][]) {
    try {
      navigator.mediaSession.setActionHandler(name, handler);
      result.registered.push(name);
    } catch {
      result.failed.push(name);
    }
  }
  return result;
}

export function unregisterMediaSession(): void {
  if (!mediaSessionSupported()) return;
  for (const name of ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward'] as MediaActionName[]) {
    try {
      navigator.mediaSession.setActionHandler(name, null);
    } catch {
      // ignore
    }
  }
}

export function updateMediaSession(state: {
  title: string;
  documentTitle: string;
  chapter: string;
  playing: boolean;
  active: boolean;
  artworkBase: string;
}): void {
  if (!mediaSessionSupported()) return;
  const session = navigator.mediaSession;
  session.playbackState = state.active ? (state.playing ? 'playing' : 'paused') : 'none';
  if (typeof MediaMetadata === 'undefined') return;
  try {
    session.metadata = new MediaMetadata({
      title: state.title,
      artist: state.documentTitle,
      album: state.chapter || 'తెలుగు పఠనం',
      artwork: [
        { src: `${state.artworkBase}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${state.artworkBase}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    });
  } catch {
    // Metadata is optional.
  }
}
