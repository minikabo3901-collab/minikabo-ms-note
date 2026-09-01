/**
 * PWA アイコンをローカル生成する（外部素材・外部通信なし）。
 * 純粋な Node の zlib だけで RGBA PNG を書き出す。
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const TEAL_DARK = [12, 90, 110];
const TEAL = [14, 116, 144];
const TEAL_LIGHT = [45, 155, 175];
const WHITE = [247, 251, 252];

function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 1x1 単位の正規化座標で図形を描く簡易キャンバス（4x スーパーサンプリング） */
function draw(size, ops) {
  const SS = 4;
  const S = size * SS;
  const buf = new Float64Array(S * S * 4);
  const inRoundRect = (px, py, x, y, w, h, r) => {
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const cx = Math.min(Math.max(px, x + r), x + w - r);
    const cy = Math.min(Math.max(py, y + r), y + h - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  };
  const inCircle = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const v = (y + 0.5) / S;
      let col = null;
      for (const op of ops) {
        const hit =
          op.type === 'rrect'
            ? inRoundRect(u, v, op.x, op.y, op.w, op.h, op.r)
            : op.type === 'circle'
              ? inCircle(u, v, op.cx, op.cy, op.r)
              : op.type === 'ring'
                ? inCircle(u, v, op.cx, op.cy, op.r) && !inCircle(u, v, op.cx, op.cy, op.r - op.t)
                : false;
        if (hit) col = op.color;
      }
      const i = (y * S + x) * 4;
      if (col) { buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255; }
    }
  }
  // ボックスフィルタで縮小（アンチエイリアス）
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const al = buf[i + 3] / 255;
          r += buf[i] * al; g += buf[i + 1] * al; b += buf[i + 2] * al; a += al;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

/** アイコン意匠：青緑の背景 + 白いノート + 折れ線（記録の推移）+ アクセントの点 */
function iconOps({ bleed }) {
  // bleed=true: マスカブル用に全面塗り（角丸なし）
  const bg = bleed
    ? { type: 'rrect', x: 0, y: 0, w: 1, h: 1, r: 0.0001, color: TEAL }
    : { type: 'rrect', x: 0, y: 0, w: 1, h: 1, r: 0.2, color: TEAL };
  const inset = bleed ? 0.12 : 0.0; // マスカブルはセーフゾーン(中央80%)に収める
  const s = 1 - inset * 2;
  const nx = 0.22 * s + inset, ny = 0.16 * s + inset, nw = 0.56 * s, nh = 0.68 * s;
  const lineX = nx + 0.09 * s;
  const lineW = nw - 0.18 * s;
  const lh = 0.052 * s;
  return [
    bg,
    { type: 'rrect', x: nx, y: ny, w: nw, h: nh, r: 0.075 * s, color: WHITE },
    // 左端の綴じ帯
    { type: 'rrect', x: nx, y: ny, w: 0.055 * s, h: nh, r: 0.028 * s, color: TEAL_DARK },
    // 記録行
    { type: 'rrect', x: lineX, y: ny + 0.13 * s, w: lineW, h: lh, r: lh / 2, color: TEAL_LIGHT },
    { type: 'rrect', x: lineX, y: ny + 0.26 * s, w: lineW * 0.72, h: lh, r: lh / 2, color: TEAL_LIGHT },
    { type: 'rrect', x: lineX, y: ny + 0.39 * s, w: lineW * 0.88, h: lh, r: lh / 2, color: TEAL_LIGHT },
    // 経過を表す点
    { type: 'circle', cx: lineX + lineW * 0.18, cy: ny + 0.56 * s, r: 0.036 * s, color: TEAL },
    { type: 'circle', cx: lineX + lineW * 0.5, cy: ny + 0.5 * s, r: 0.036 * s, color: TEAL },
    { type: 'circle', cx: lineX + lineW * 0.82, cy: ny + 0.545 * s, r: 0.036 * s, color: TEAL },
  ];
}

const targets = [
  { file: 'icon-192.png', size: 192, bleed: false },
  { file: 'icon-512.png', size: 512, bleed: false },
  { file: 'maskable-512.png', size: 512, bleed: true },
  { file: 'apple-touch-icon.png', size: 180, bleed: true },
  { file: 'favicon-32.png', size: 32, bleed: false },
];

for (const t of targets) {
  const rgba = draw(t.size, iconOps({ bleed: t.bleed }));
  writeFileSync(join(OUT, t.file), encodePNG(t.size, t.size, rgba));
  console.log('generated', t.file, t.size + 'px');
}
