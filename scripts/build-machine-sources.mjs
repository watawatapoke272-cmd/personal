// data-sources/ の元データから、技マシン/技レコードの入手情報を作る（ネットワーク不要）。
// 使い方: npm run build-machine-sources   ※先に npm run build-data が必要（技名の突き合わせに使う）
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = (f) => readFile(join(ROOT, 'data-sources', f), 'utf8')
const DATA = (f) => readFile(join(ROOT, 'public', 'data', f), 'utf8').then(JSON.parse)

const decode = (s) =>
  s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const tableRows = (html) =>
  [...html.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
    [...r[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) => text(c[0])),
  )

// {{...}} / [[...]] の中の | では区切らない分割
function splitTop(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2)
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue }
    if (s[i] === '|' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += s[i]
  }
  out.push(cur)
  return out
}

const locJa = JSON.parse(await SRC('bulbapedia-locations-ja.json'))
const PEOPLE = new Set([
  'Amarys', 'Atticus', 'Crispin', 'Drayton', 'Eri', 'Giacomo', 'Lacey', 'Mela', 'Ortega',
  'Allister', 'Bea', 'Gordie', 'Kabu', 'Melony', 'Milo', 'Nessa', 'Opal', 'Piers', 'Raihan',
  'Team Star', 'Gym', 'TM223',
])
const unknownLocs = new Set()
function places(field) {
  // 「Defeat …(recipe)」のようなボス撃破の行は除き、地名リンクだけを日本語にする
  const segs = field.split(/<br\s*\/?>/).filter((s) => !/Defeat|recipe|Prize|Reward/i.test(s))
  const out = []
  for (const seg of segs)
    for (const m of seg.matchAll(/\[\[([^\]|]+)/g)) {
      const k = m[1]
      if (PEOPLE.has(k)) continue
      const ja = locJa[k]
      if (!ja) { unknownLocs.add(k); continue }
      if (!out.includes(ja)) out.push(ja)
    }
  return out
}

const report = { mismatch: [], lpDiff: [] }

// ---------- SV ----------
{
  const [html, wiki, machines, moves] = await Promise.all([
    SRC('g8-sv-tm.html'),
    SRC('bulbapedia-sv-tm.json').then((s) => JSON.parse(s).parse.wikitext['*']),
    DATA('sv/machines.json'),
    DATA('sv/moves.json'),
  ])
  const moveName = new Map(moves.map((m) => [m.id, m.name]))

  const g8 = new Map()
  for (const c of tableRows(html)) {
    if (c.length !== 3 || !/^\d+$/.test(c[0])) continue
    const parts = c[2].split(/\s*・\s*/).map((s) => s.trim()).filter(Boolean)
    const unlock = parts.shift().replace(/[。\s]+$/, '')
    let lp
    const materials = []
    for (const p of parts) {
      const lpm = /^LP\s*[×x]\s*([\d,]+)/.exec(p)
      if (lpm) { lp = Number(lpm[1].replace(/,/g, '')); continue }
      const mm = /^(.+?)\s*[×x]\s*(\d+)$/.exec(p)
      if (mm) materials.push({ name: mm[1].trim(), count: Number(mm[2]) })
      else materials.push({ name: p, count: 1 })
    }
    g8.set(Number(c[0]), { name: c[1], unlock, lp, materials })
  }

  const bulb = new Map()
  for (const line of wiki.split('\n')) {
    if (!line.startsWith('{{Tmlist/loc9|')) continue
    const f = splitTop(line.slice('{{Tmlist/loc9|'.length, line.lastIndexOf('}}')))
    const lp = Number(String(f[8]).replace(/[^\d]/g, '')) || undefined
    const bm = String(f[9] ?? '')
      .split(/<br\s*\/?>/)
      .map((x) => /^\s*(.+?)\s*×\s*(\d+)\s*$/.exec(x))
      .filter(Boolean)
      .map((m) => ({ name: m[1], count: Number(m[2]) }))
    bulb.set(Number(f[0]), { places: places(f[7] ?? ''), lp, mats: bm })
  }

  // 素材名の英→日 対応表（両サイトで素材の並びが同じ行から作る）
  const matJa = new Map()
  for (const [no, g] of g8) {
    const b = bulb.get(no)
    if (!b || !g.materials.length || g.materials.length !== b.mats.length) continue
    g.materials.forEach((m, i) => {
      if (m.count === b.mats[i].count) matJa.set(b.mats[i].name, m.name)
    })
  }
  const filled = []
  const out = machines.map((m) => {
    const no = Number(m.label.slice(2))
    const g = g8.get(no)
    const b = bulb.get(no)
    if (!g) throw new Error(`SV TM${no} が game8 に無い`)
    // game8 が「確認中」や空欄の項目は Bulbapedia で補う
    if (!g.lp && b?.lp) { g.lp = b.lp; filled.push(`${m.label}:LP`) }
    if (!g.materials.length && b?.mats.length) {
      g.materials = b.mats.map((x) => ({ name: matJa.get(x.name) ?? `${x.name}(英語)`, count: x.count }))
      filled.push(`${m.label}:素材`)
    }
    g.materials = g.materials.filter((x) => !/^LP/.test(x.name))
    if (g.name !== moveName.get(m.moveId)) report.mismatch.push(`SV ${m.label}: ${g.name} / ${moveName.get(m.moveId)}`)
    if (b?.lp && g.lp && b.lp !== g.lp) report.lpDiff.push(`SV ${m.label}: game8=${g.lp} bulbapedia=${b.lp}`)
    return {
      label: m.label,
      unlock: g.unlock,
      lp: g.lp,
      materials: g.materials,
      places: b?.places ?? [],
    }
  })
  await writeFile(join(ROOT, 'public', 'data', 'sv', 'machine-sources.json'), JSON.stringify(out))
  console.log('SV', out.length, '件 / Bulbapediaで補完:', filled.join(', '))
}

// ---------- 剣盾 ----------
{
  const [tmHtml, trHtml, wiki, machines, moves] = await Promise.all([
    SRC('g8-swsh-tm.html'),
    SRC('g8-swsh-tr.html'),
    SRC('bulbapedia-swsh-tm.json').then((s) => JSON.parse(s).parse.wikitext['*']),
    DATA('swsh/machines.json'),
    DATA('swsh/moves.json'),
  ])
  const moveName = new Map(moves.map((m) => [m.id, m.name]))

  const tm = new Map()
  for (const c of tableRows(tmHtml)) {
    if (c.length !== 3 || !/^\d+$/.test(c[0])) continue
    const am = /^【\s*(.+?)\s*】\s*(.*)$/.exec(c[2])
    const area = am?.[1]
    let how = (am?.[2] ?? c[2]).trim()
    let price
    const pm = /[（(]([\d,]+)[）)]\s*$/.exec(how)
    if (pm) { price = Number(pm[1].replace(/,/g, '')); how = how.slice(0, pm.index).trim() }
    tm.set(Number(c[0]), { name: c[1], area, how, price })
  }

  const tr = new Map()
  for (const c of tableRows(trHtml)) {
    if (c.length !== 3 || !/^\d+$/.test(c[0])) continue
    const drops = { both: [], sword: [], shield: [] }
    for (const m of c[2].matchAll(/【([^】]*)】([^【]*)/g)) {
      const key = m[1].includes('どちらも') ? 'both' : m[1].includes('剣のみ') ? 'sword' : 'shield'
      // 巣名に「・」を含む（キバ湖・西 など）ため、前後に空白のある「 ・ 」だけで区切る
      drops[key] = m[2].trim().replace(/^・\s*/, '').split(/\s+・\s+/).map((s) => s.trim()).filter(Boolean)
    }
    tr.set(Number(c[0]), { name: c[1], drops })
  }

  // Bulbapedia: TRのワット価格と、固定で拾える場所
  const trExtra = new Map()
  for (const line of wiki.split('\n')) {
    if (!line.startsWith('{{trlist/loc8|')) continue
    const f = splitTop(line.slice('{{trlist/loc8|'.length))
    const watt = /([\d,]+)\s*\{\{W\}\}/.exec(line)
    trExtra.set(Number(f[0]), {
      watt: watt ? Number(watt[1].replace(/,/g, '')) : undefined,
      places: places(f[7] ?? ''),
    })
  }

  const out = machines.map((m) => {
    const no = Number(m.label.slice(2))
    const name = moveName.get(m.moveId)
    if (m.kind === 'tm') {
      const g = tm.get(no)
      if (!g) throw new Error(`剣盾 ${m.label} が game8 に無い`)
      if (g.name !== name) report.mismatch.push(`剣盾 ${m.label}: ${g.name} / ${name}`)
      return { label: m.label, area: g.area, how: g.how, price: g.price }
    }
    const g = tr.get(no)
    if (!g) throw new Error(`剣盾 ${m.label} が game8 に無い`)
    if (g.name !== name) report.mismatch.push(`剣盾 ${m.label}: ${g.name} / ${name}`)
    const x = trExtra.get(no)
    return { label: m.label, watt: x?.watt, places: x?.places ?? [], raidDrops: g.drops }
  })
  await writeFile(join(ROOT, 'public', 'data', 'swsh', 'machine-sources.json'), JSON.stringify(out))
  console.log('剣盾', out.length, '件')
}

console.log('技名の不一致:', report.mismatch.length, report.mismatch)
console.log('LPの不一致(game8とBulbapedia):', report.lpDiff.length, report.lpDiff.slice(0, 20))
console.log('日本語名が無い地名:', [...unknownLocs])
