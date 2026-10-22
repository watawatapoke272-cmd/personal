// バトル支援の保存済み設定のうち、モード（通常／テラレイド）だけを外から切り替えるための小さな補助
export const OPT_KEY = 'pokemon-app:battle-options'

export function setRaidMode(raid: boolean) {
  try {
    const cur = JSON.parse(localStorage.getItem(OPT_KEY) ?? 'null') as Record<string, unknown> | null
    localStorage.setItem(OPT_KEY, JSON.stringify({ ...cur, raid }))
  } catch {}
}
