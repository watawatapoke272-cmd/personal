import type { GameData, MoveData } from '../types'

export function TypeChip({ data, slug }: { data: GameData; slug: string }) {
  const name = data.types.types.find((t) => t.slug === slug)?.name ?? slug
  return <span className={`chip type t-${slug}`}>{name}</span>
}

const CLASS_LABEL: Record<MoveData['class'], string> = { physical: '物理', special: '特殊', status: '変化' }

export function MoveClass({ cls }: { cls: MoveData['class'] }) {
  return <span className={`chip cls c-${cls}`}>{CLASS_LABEL[cls]}</span>
}
