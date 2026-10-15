interface WavParts {
  format: Uint8Array;
  audio: Uint8Array;
}

function readWav(buffer: ArrayBuffer): WavParts {
  const view = new DataView(buffer);
  const text = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(buffer, offset, length));
  if (buffer.byteLength < 12 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') {
    throw new Error('Gemini WAV ఆడియో ఫార్మాట్ సరైనది కాదు.');
  }
  let format: Uint8Array | null = null;
  let audio: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.byteLength) throw new Error('Gemini WAV భాగం అసంపూర్ణంగా ఉంది.');
    if (id === 'fmt ') format = new Uint8Array(buffer.slice(start, end));
    if (id === 'data') audio = new Uint8Array(buffer.slice(start, end));
    offset = end + (size % 2);
  }
  if (!format || !audio || format.length < 16) throw new Error('Gemini WAVలో fmt/data భాగాలు లేవు.');
  return { format, audio };
}

/** Joins same-format Gemini WAV segments into one playable WAV without re-encoding. */
export function concatenateWav(buffers: ArrayBuffer[]): Blob {
  if (buffers.length === 0) throw new Error('డౌన్‌లోడ్ చేయడానికి ఆడియో లేదు.');
  const parts = buffers.map(readWav);
  const format = parts[0].format;
  for (const part of parts.slice(1)) {
    if (part.format.length !== format.length || part.format.some((byte, i) => byte !== format[i])) {
      throw new Error('Gemini ఆడియో సెగ్మెంట్ల WAV ఫార్మాట్‌లు ఒకేలా లేవు.');
    }
  }
  const audioLength = parts.reduce((sum, part) => sum + part.audio.length, 0);
  const formatPadding = format.length % 2;
  const pad = audioLength % 2;
  const output = new ArrayBuffer(12 + 8 + format.length + formatPadding + 8 + audioLength + pad);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  write(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, format.length, true);
  bytes.set(format, 20);
  const dataHeader = 20 + format.length + formatPadding;
  write(dataHeader, 'data');
  view.setUint32(dataHeader + 4, audioLength, true);
  let cursor = dataHeader + 8;
  for (const part of parts) {
    bytes.set(part.audio, cursor);
    cursor += part.audio.length;
  }
  return new Blob([output], { type: 'audio/wav' });
}
