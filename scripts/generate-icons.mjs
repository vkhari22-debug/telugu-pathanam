// Generates the PWA PNG icons without external dependencies.
// Usage: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [122, 62, 18];
const FG = [255, 244, 224];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const [pr, pg, pb, pa] = pixel((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Open book with sound waves, in a unit square; `scale` shrinks it for maskable safe zone. */
function glyph(u, v, scale) {
  const x = (u - 0.5) / scale + 0.5;
  const y = (v - 0.5) / scale + 0.5;
  // Book pages: two slanted quads meeting at the spine.
  const inPage = (side) => {
    const dx = side * (x - 0.5);
    if (dx < 0.02 || dx > 0.3) return false;
    const top = 0.5 - dx * 0.35;
    return y > top && y < top + 0.24;
  };
  if (inPage(-1) || inPage(1)) {
    // page lines
    const dx = Math.abs(x - 0.5);
    const top = 0.5 - dx * 0.35;
    const t = (y - top) / 0.24;
    if (dx > 0.06 && dx < 0.26 && [0.3, 0.5, 0.7].some((l) => Math.abs(t - l) < 0.035)) return 'bg';
    return 'fg';
  }
  // Sound waves above the book.
  const cx = 0.5, cy = 0.45;
  const d = Math.hypot(x - cx, y - cy);
  const ang = Math.atan2(y - cy, x - cx);
  if (ang < -Math.PI * 0.32 && ang > -Math.PI * 0.68) {
    for (const r of [0.12, 0.2, 0.28]) if (Math.abs(d - r) < 0.022) return 'fg';
  }
  return null;
}

function icon(size, { maskable = false, rounded = true } = {}) {
  return png(size, (u, v) => {
    if (!maskable && rounded) {
      const r = 0.2;
      const qx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
      const qy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];
    }
    const g = glyph(u, v, maskable ? 0.72 : 0.95);
    return g === 'fg' ? [...FG, 1] : [...BG, 1];
  });
}

writeFileSync(new URL('icon-192.png', OUT), icon(192));
writeFileSync(new URL('icon-512.png', OUT), icon(512));
writeFileSync(new URL('icon-maskable-512.png', OUT), icon(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', OUT), icon(180, { rounded: false }));
console.log('Icons written to public/icons');
