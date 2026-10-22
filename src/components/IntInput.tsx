import { useState } from 'react'

interface Props {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}

/**
 * 整数入力。入力中は文字のまま保持し（空にしても1に戻さない）、範囲内の数になったら反映、
 * 欄を離れたときに範囲へ丸める。スマホで「72」と打つ途中で値が書き換わらないようにするため。
 */
export function IntInput({ value, min, max, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <input
      type="number" inputMode="numeric" min={min} max={max}
      value={draft ?? value}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value
        setDraft(t)
        const n = Math.trunc(Number(t))
        if (t !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
      }}
      onBlur={() => {
        if (draft !== null) {
          const n = Math.trunc(Number(draft))
          onChange(draft === '' || !Number.isFinite(n) ? value : clamp(n))
          setDraft(null)
        }
      }}
    />
  )
}
