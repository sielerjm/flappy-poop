// A small PNG reader for the asset tests (plan 17, 1c.9: the fairy lights' seam): 8-bit RGBA, not interlaced, the
// five scanline filters. Returns { width, height, rgba } (a Uint8Array, 4 bytes a pixel, rows top to bottom).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(file) {
  const buf = readFileSync(file);
  let p = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${file}: not 8-bit RGBA, non-interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      line[x] = (line[x] + add) & 255;
    }
    rgba.set(line, y * stride);
    prev = line;
  }
  return { width, height, rgba };
}

/** The first run of alpha above `cutoff` down column x: [top, bottom], or null. */
export function alphaRun(png, x, cutoff = 128) {
  let top = -1;
  for (let y = 0; y < png.height; y += 1) {
    const on = png.rgba[(y * png.width + x) * 4 + 3] > cutoff;
    if (on && top < 0) top = y;
    if (!on && top >= 0) return [top, y - 1];
  }
  return top >= 0 ? [top, png.height - 1] : null;
}
