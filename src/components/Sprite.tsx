import { useState } from 'react'

// PokeAPI/sprites（GitHub）の画像を使う。通信できない・画像が無いときは空欄にする。
const SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

export function Sprite({ id, size = 48 }: { id: number; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className="sprite" style={{ width: size, height: size }} aria-hidden="true" />
  return (
    <img
      className="sprite" src={`${SPRITE_URL}/${id}.png`} width={size} height={size}
      alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}
    />
  )
}
