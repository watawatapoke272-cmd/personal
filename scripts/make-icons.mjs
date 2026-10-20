// アプリのアイコン（モンスターボール風の簡単な図）をPNGで作る。使い方: node scripts/make-icons.mjs
import { writeFile } from 'node:fs/promises'
import { crc32, deflateSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const BG = [31, 41, 55], RED = [220, 38, 38], WHITE = [243, 244, 246], DARK = [17, 24, 39]

// 1ピクセルの色（座標は 0〜1）。丸い中央の図は、端末が角を切り抜いても欠けないよう半径を小さめにする
function colorAt(x, y) {
  const dx = x - 0.5, dy = y - 0.5
  const r = Math.hypot(dx, dy)
  const R = 0.32
  if (r > R) return BG
  if (r > R - 0.035) return DARK            // 外枠
  if (Math.abs(dy) < 0.03) return DARK      // 中央の帯
  if (r < 0.085) return Math.hypot(dx, dy) < 0.055 ? WHITE : DARK // 中央のボタン
  return dy < 0 ? RED : WHITE
}

function png(size) {
  const S = 3 // 3x3 の平均で、縁をなめらかにする
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size)
          r += c[0]; g += c[1]; b += c[2]
        }
      const o = py * (size * 4 + 1) + 1 + px * 4
      raw[o] = Math.round(r / (S * S)); raw[o + 1] = Math.round(g / (S * S)); raw[o + 2] = Math.round(b / (S * S)); raw[o + 3] = 255
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]])
  await writeFile(join(OUT, name), png(size))
console.log('icons written to', OUT)
