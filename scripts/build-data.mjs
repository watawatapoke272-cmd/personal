// PokeAPI から SV / 剣盾 のデータを取得し、アプリ用の静的 JSON に整形する。
// 使い方: npm run build-data   （初回は数分。取得結果は .cache/ にキャッシュされ、再実行は高速）
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache')
const OUT = join(ROOT, 'public', 'data')
const API = 'https://pokeapi.co/api/v2'

const GAMES = {
  sv: {
    label: 'スカーレット・バイオレット',
    vg: 'scarlet-violet',
    dexes: ['paldea', 'kitakami', 'blueberry'],
    padTm: 3,
  },
  swsh: {
    label: 'ソード・シールド',
    vg: 'sword-shield',
    dexes: ['galar', 'isle-of-armor', 'crown-tundra'],
    padTm: 2,
  },
}

// ---------- 取得（キャッシュ付き・並列） ----------
async function get(url) {
  const key = createHash('md5').update(url).digest('hex')
  const file = join(CACHE, `${key}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {}
  let lastErr
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'pokemon-app-personal' } })
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      const data = await res.json()
      await writeFile(file, JSON.stringify(data))
      return data
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastErr
}

async function getAll(urls, label, concurrency = 16) {
  const out = new Array(urls.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < urls.length) {
      const i = next++
      out[i] = await get(urls[i])
      if (++done % 200 === 0) console.log(`  ${label}: ${done}/${urls.length}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return out
}

const list = async (path) => (await get(`${API}/${path}?limit=5000`)).results.map((r) => r.url)

// 日本語名（ゲーム内表記のかな/カタカナを優先）
function jaName(names, fallback) {
  const pick = (lang) => names?.find((n) => n.language.name.toLowerCase() === lang.toLowerCase())?.name
  return pick('ja-Hrkt') ?? pick('ja') ?? fallback
}
function jaFlavor(entries, vg) {
  const ja = (entries ?? []).filter((e) => ['ja-hrkt', 'ja'].includes(e.language.name.toLowerCase()))
  const text =
    ja.find((e) => e.version_group?.name === vg) ??
    ja.findLast?.((e) => e.language.name.toLowerCase() === 'ja-hrkt') ??
    ja.at(-1)
  return text ? (text.flavor_text ?? text.text)?.replace(/\s+/g, '') : undefined
}

// 見た目だけ・バトル中だけ変わるフォルムは、別個体として手持ちに登録するものではないので除く（既定のフォルムは残る）
const HIDDEN_FORMS = [
  /^minior-/, /^(koraidon|miraidon)-/, /^terapagos-(terastal|stellar)$/, /^tatsugiri-/,
  /^squawkabilly-/, /^mimikyu-busted$/, /^morpeko-hangry$/, /^eiscue-noice$/,
  /^dudunsparce-three-segment$/, /^maushold-family-of-three$/, /^palafin-hero$/,
  /^wishiwashi-school$/, /^greninja-(ash|battle-bond)$/, /^gimmighoul-roaming$/,
  /^aegislash-blade$/, /^darmanitan-zen$/, /^meloetta-pirouette$/, /^zygarde-.*(construct|complete)$/,
  /^cramorant-/, /^pumpkaboo-/, /^gourgeist-/, /^toxtricity-low-key-gmax$/, /^eternatus-eternamax$/,
]

const METHOD = { 'level-up': 'L', machine: 'M', egg: 'E', tutor: 'T', 'form-change': 'F' }

const FORM_JA = {
  alola: 'アローラのすがた',
  galar: 'ガラルのすがた',
  hisui: 'ヒスイのすがた',
  paldea: 'パルデアのすがた',
  'paldea-combat-breed': 'パルデアのすがた・コンバット種',
  'paldea-blaze-breed': 'パルデアのすがた・ブレイズ種',
  'paldea-aqua-breed': 'パルデアのすがた・ウォーター種',
  'own-tempo': 'マイペースのすがた',
  'single-strike': 'いちげきのかた',
  'rapid-strike': 'れんげきのかた',
  ice: 'はくばじょうのすがた',
  shadow: 'こくばじょうのすがた',
  'wellspring-mask': 'いどのめん',
  'hearthflame-mask': 'かまどのめん',
  'cornerstone-mask': 'いしずえのめん',
  'teal-mask': 'みどりのめん',
}

// ---------- メイン ----------
await mkdir(CACHE, { recursive: true })
console.log('バージョングループ順を取得…')
const vgList = (await get(`${API}/version-group?limit=100`)).results.map((r) => r.name)
const vgOrder = (name) => vgList.indexOf(name)

console.log('ポケモン・種・特性などの一覧を取得…')
const pokemonAll = await getAll(await list('pokemon'), 'pokemon')
const speciesUrls = [...new Set(pokemonAll.map((p) => p.species.url))]
const speciesAll = await getAll(speciesUrls, 'species')
const speciesByName = new Map(speciesAll.map((s) => [s.name, s]))

console.log('図鑑を取得…')
const dexData = {}
for (const g of Object.values(GAMES))
  for (const d of g.dexes) dexData[d] = await get(`${API}/pokedex/${d}`)

console.log('技マシンを取得…')
const machinesAll = await getAll(await list('machine'), 'machine')

// ---------- タイプ相性（共通） ----------
console.log('タイプ相性を整形…')
const typeUrls = (await get(`${API}/type?limit=100`)).results
  .filter((t) => !['unknown', 'shadow', 'stellar'].includes(t.name))
  .map((t) => t.url)
const typeData = await getAll(typeUrls, 'type')
const types = typeData.map((t) => ({ slug: t.name, name: jaName(t.names, t.name) }))
const chart = {}
for (const t of typeData) {
  chart[t.name] = {}
  for (const o of typeData) chart[t.name][o.name] = 1
  const r = t.damage_relations
  for (const x of r.double_damage_to) chart[t.name][x.name] = 2
  for (const x of r.half_damage_to) chart[t.name][x.name] = 0.5
  for (const x of r.no_damage_to) chart[t.name][x.name] = 0
}
await mkdir(join(OUT, 'common'), { recursive: true })
await writeFile(
  join(OUT, 'common', 'types.json'),
  JSON.stringify({ types: [...types, { slug: 'stellar', name: 'ステラ' }], chart }),
)

// ---------- ゲーム別 ----------
const moveByName = new Map()
const abilityByName = new Map()
{
  const moves = await getAll(await list('move'), 'move')
  for (const m of moves) moveByName.set(m.name, m)
  const abs = await getAll(await list('ability'), 'ability')
  for (const a of abs) abilityByName.set(a.name, a)
}
const moveById = new Map([...moveByName.values()].map((m) => [m.id, m]))

// ---------- 持ち物 ----------
// 持たせて使うものに絞る（カテゴリ）。そのソフトの世代に存在するもの（game_indices）だけ。
const ITEM_CATS = new Set([
  'held-items', 'choice', 'bad-held-items', 'type-enhancement', 'plates', 'species-specific', 'in-a-pinch',
  'type-protection', 'effort-training', 'jewels', 'memories', 'mega-stones', 'picky-healing',
])
const BERRY_CATS = new Set(['medicine', 'status-cures', 'stat-boosts', 'in-a-pinch', 'picky-healing', 'type-protection'])
console.log('持ち物を取得…')
const itemsAll = await getAll(await list('item'), 'item')
const itemGen = { sv: 'generation-ix', swsh: 'generation-viii' }

const report = {}
for (const [gid, g] of Object.entries(GAMES)) {
  console.log(`[${gid}] 整形中…`)
  const target = vgOrder(g.vg)
  const rep = (report[gid] = { unmappedForms: [], noDex: [], noJaMove: [] })

  // 図鑑番号: 種名 → { 図鑑名: 番号 }
  const dexNo = {}
  for (const d of g.dexes)
    for (const e of dexData[d].pokemon_entries)
      (dexNo[e.pokemon_species.name] ??= {})[d] = e.entry_number

  const mons = []
  const usedMoves = new Set()
  const usedAbilities = new Set()
  for (const p of pokemonAll) {
    const moves = []
    for (const m of p.moves) {
      for (const d of m.version_group_details) {
        if (d.version_group.name !== g.vg) continue
        const id = Number(m.move.url.split('/').at(-2))
        const method = METHOD[d.move_learn_method.name] ?? d.move_learn_method.name
        moves.push(method === 'L' ? [id, method, d.level_learned_at] : [id, method])
        usedMoves.add(id)
      }
    }
    if (!moves.length) continue // このソフトに登場しない個体
    if (/-cap$/.test(p.name)) continue // ピカチュウのキャップ違いは見た目だけの別個体なので除く
    if (!p.is_default && HIDDEN_FORMS.some((re) => re.test(p.name))) continue

    const sp = speciesByName.get(p.species.name)
    const spJa = jaName(sp.names, sp.name)
    let formSlug = p.name.startsWith(sp.name + '-') ? p.name.slice(sp.name.length + 1) : ''
    let displayName = spJa
    if (!p.is_default && formSlug) {
      let f = FORM_JA[formSlug]
      if (!f && p.forms?.[0]) {
        // 表の無いフォルムは PokeAPI のフォーム名（日本語）で補う
        const form = await get(p.forms[0].url)
        const names = form.form_names ?? []
        f = (names.find((n) => n.language.name === 'ja-Hrkt') ?? names.find((n) => n.language.name === 'ja'))?.name
      }
      if (!f) rep.unmappedForms.push(p.name)
      displayName = `${spJa}（${f ?? formSlug}）`
    }
    const dex = dexNo[p.species.name] ?? {}
    if (!Object.keys(dex).length) rep.noDex.push(p.name)

    const stat = (n) => p.stats.find((s) => s.stat.name === n).base_stat
    for (const a of p.abilities) usedAbilities.add(a.ability.name)
    mons.push({
      id: p.id,
      slug: p.name,
      species: p.species.name,
      name: displayName,
      isDefault: p.is_default,
      types: p.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      abilities: p.abilities
        .sort((a, b) => a.slot - b.slot)
        .map((a) => ({ slug: a.ability.name, hidden: a.is_hidden })),
      stats: {
        hp: stat('hp'), atk: stat('attack'), def: stat('defense'),
        spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed'),
      },
      dex,
      moves,
    })
  }
  mons.sort((a, b) => a.id - b.id)

  // 技（このソフト時点の値に補正）
  const moveOut = []
  for (const id of [...usedMoves].sort((a, b) => a - b)) {
    const m = moveById.get(id)
    const v = {
      power: m.power, accuracy: m.accuracy, pp: m.pp, type: m.type.name,
    }
    const done = new Set()
    const past = [...m.past_values]
      .filter((x) => vgOrder(x.version_group.name) >= target)
      .sort((a, b) => vgOrder(a.version_group.name) - vgOrder(b.version_group.name))
    for (const pv of past)
      for (const k of ['power', 'accuracy', 'pp', 'type']) {
        if (done.has(k)) continue
        const val = k === 'type' ? pv.type?.name : pv[k]
        if (val != null) { v[k] = val; done.add(k) }
      }
    const name = jaName(m.names, '')
    if (!name) rep.noJaMove.push(m.name)
    moveOut.push({
      id, slug: m.name, name: name || m.name, type: v.type,
      class: m.damage_class.name, power: v.power, accuracy: v.accuracy, pp: v.pp,
      priority: m.priority, text: jaFlavor(m.flavor_text_entries, g.vg),
      minHits: m.meta?.min_hits ?? undefined, maxHits: m.meta?.max_hits ?? undefined,
    })
  }

  const abilityOut = [...usedAbilities].sort().map((slug) => {
    const a = abilityByName.get(slug)
    return { slug, name: jaName(a.names, slug), text: jaFlavor(a.flavor_text_entries, g.vg) }
  })

  const machineOut = machinesAll
    .filter((x) => x.version_group.name === g.vg)
    .map((x) => {
      const m = /^(tm|tr)(\d+)$/.exec(x.item.name)
      const kind = m[1]
      const no = String(Number(m[2])).padStart(kind === 'tm' ? g.padTm : 2, '0')
      return {
        label: `${kind.toUpperCase()}${no}`, kind,
        moveId: Number(x.move.url.split('/').at(-2)),
        // 入手場所・必要素材は PokeAPI に無いため、別途 data/*/machine-sources.json で補う
      }
    })
    .sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind < b.kind ? 1 : -1))

  const itemOut = itemsAll
    .filter((it) => it.game_indices.some((x) => x.generation.name === itemGen[gid]))
    .filter((it) => ITEM_CATS.has(it.category.name) || (it.name.endsWith('-berry') && BERRY_CATS.has(it.category.name)))
    .map((it) => ({ slug: it.name, name: jaName(it.names, ''), cat: it.category.name, text: jaFlavor(it.flavor_text_entries, g.vg) }))
    .filter((it) => it.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  const dir = join(OUT, gid)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'items.json'), JSON.stringify(itemOut))
  await writeFile(join(dir, 'pokemon.json'), JSON.stringify(mons))
  await writeFile(join(dir, 'moves.json'), JSON.stringify(moveOut))
  await writeFile(join(dir, 'abilities.json'), JSON.stringify(abilityOut))
  await writeFile(join(dir, 'machines.json'), JSON.stringify(machineOut))
  rep.counts = { items: itemOut.length, pokemon: mons.length, moves: moveOut.length, abilities: abilityOut.length, machines: machineOut.length }
  console.log(`[${gid}]`, rep.counts)
}

await writeFile(
  join(OUT, 'meta.json'),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'PokeAPI',
    games: Object.fromEntries(Object.entries(GAMES).map(([k, v]) => [k, v.label])),
  }),
)
await writeFile(join(ROOT, '.cache', 'report.json'), JSON.stringify(report, null, 2))
console.log('\nレポート:')
for (const [gid, r] of Object.entries(report))
  console.log(gid, {
    counts: r.counts,
    unmappedForms: r.unmappedForms.length,
    noDex: r.noDex.length,
    noJaMove: r.noJaMove,
  })
console.log('詳細は .cache/report.json')
