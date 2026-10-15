import { describe, expect, it } from 'vitest';
import { concatenateWav } from '../src/tts/wav';

function makeWav(data: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + data.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  write(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, data.length, true);
  bytes.set(data, 44);
  return buffer;
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Gemini WAV downloads', () => {
  it('joins segment data into one valid playable WAV without dropping bytes', async () => {
    const output = await blobToArrayBuffer(concatenateWav([makeWav([1, 2, 3, 4]), makeWav([5, 6, 7, 8])]));
    const view = new DataView(output);
    const bytes = new Uint8Array(output);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint32(4, true)).toBe(output.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(8);
    expect([...bytes.slice(44)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('rejects invalid or incompatible WAVs instead of producing corrupt downloads', () => {
    expect(() => concatenateWav([new ArrayBuffer(10)])).toThrow(/WAV ఆడియో ఫార్మాట్/);
    const a = makeWav([1, 2]);
    const b = makeWav([3, 4]);
    new DataView(b).setUint32(24, 22050, true);
    expect(() => concatenateWav([a, b])).toThrow(/ఫార్మాట్‌లు ఒకేలా లేవు/);
  });
});
