import type { WishApi } from '../wishlist'

/** 「ほしいポケモン」に入れるボタン（入っていれば、その旨を表示） */
export function WishButton({ wish, slug, memo }: { wish: WishApi; slug: string; memo?: string }) {
  return wish.has(slug) ? (
    <span className="muted wish-in">★ ほしいリストにあります</span>
  ) : (
    <button className="ghost small" onClick={() => wish.add(slug, memo)}>☆ ほしいリストに入れる</button>
  )
}
