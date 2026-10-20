// 端末間の手持ちデータの統合（同期用）。
// 同じ規則が gas/Code.gs にもある。片方を直したらもう片方も直すこと（テストで一致を確認している）。
import type { GameSave, OwnedPokemon } from './types.ts'

const PARTY_MAX = 6

/**
 * 2つの保存データを統合する。
 * - 個体ごとに「更新時刻が新しい方」を採用する
 * - 削除は記録（削除時刻）を持ち、削除時刻が個体の更新時刻以降なら削除を優先する
 * - パーティは、最後に変更した方を採用する
 * 順序を入れ替えても、何度かけても同じ結果になる。
 */
export function mergeSaves(a: GameSave, b: GameSave): GameSave {
  const ids = new Set([
    ...Object.keys(a.mons), ...Object.keys(b.mons), ...Object.keys(a.deleted), ...Object.keys(b.deleted),
  ])
  const mons: Record<string, OwnedPokemon> = {}
  const deleted: Record<string, number> = {}
  for (const id of ids) {
    const ma = a.mons[id]
    const mb = b.mons[id]
    // 更新時刻が同じでも内容が違うときは、並びの文字列で決める（どちらから呼んでも同じ結果にするため）
    const mon =
      ma && mb
        ? ma.updatedAt !== mb.updatedAt
          ? mb.updatedAt > ma.updatedAt ? mb : ma
          : JSON.stringify(ma) >= JSON.stringify(mb) ? ma : mb
        : (ma ?? mb)
    const del = Math.max(a.deleted[id] ?? -1, b.deleted[id] ?? -1)
    if (del >= 0 && del >= (mon?.updatedAt ?? -1)) deleted[id] = del
    else if (mon) mons[id] = mon
  }
  // 同時刻のときは、どちらから呼んでも同じ結果になるよう並びの文字列で決める
  const winner =
    a.partyUpdatedAt !== b.partyUpdatedAt
      ? b.partyUpdatedAt > a.partyUpdatedAt ? b : a
      : a.party.join() >= b.party.join() ? a : b
  // パーティは、存在しない個体の除外をここでは行わない（途中で除外すると、あとで個体が戻ったときに結果が変わるため）。
  // 使う側で normalizeParty を通す。
  return {
    version: 1,
    mons,
    party: [...winner.party],
    deleted,
    partyUpdatedAt: Math.max(a.partyUpdatedAt, b.partyUpdatedAt),
  }
}

/** パーティから、存在しない個体を除き、上限6匹に収める */
export function normalizeParty(s: GameSave): GameSave {
  const party = s.party.filter((id, i, arr) => id in s.mons && arr.indexOf(id) === i).slice(0, PARTY_MAX)
  return party.length === s.party.length ? s : { ...s, party }
}
