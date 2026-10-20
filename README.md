# ポケモン攻略メモ

個人用の、手持ちポケモン管理とバトル支援ツール（スカーレット・バイオレット／ソード・シールド）。
非公式のファンツールで、任天堂・ゲームフリーク・ポケモン社とは関係ありません。

- 手持ち管理（パーティ6匹／ボックス、特性・持ち物・テラスタイプ・性格・努力値・個体値・技）
- 図鑑・技・技マシン参照（SVは作成素材、剣盾は入手場所つき）
- バトル提案（敵を選ぶと、選出・攻撃・受け・素早さ・注意点を提示）
- 端末間の同期（Googleスプレッドシート + GAS。`gas/README.md`）

## 開発

```
npm install
npm run dev            # 開発サーバー (http://localhost:5173)
npm run build          # 公開用ファイルを dist/ に生成
npm run preview        # build 後の確認
npm run build-data     # PokeAPI からデータを取り直す（public/data を更新。初回は数分）
npm run build-machine-sources   # 技マシンの入手情報を data-sources/ から作り直す
```

`main` ブランチに push すると、GitHub Actions が GitHub Pages に公開する（`.github/workflows/deploy.yml`）。
リポジトリの Settings → Pages → Source を「GitHub Actions」にしておく。

## データの出典

- ポケモン・技・特性・技マシン番号・覚える技: [PokeAPI](https://pokeapi.co/)
- 技マシンの拾える場所（SV）・ワット価格（剣盾）・地名の日本語名: [Bulbapedia](https://bulbapedia.bulbagarden.net/)（CC BY-NC-SA 2.5）
- 技マシンの作成素材・入手方法の日本語表記: ゲームエイト（個人利用の範囲で参照）

商用利用はしない。手持ちデータは各自のブラウザ（localStorage）と、自分のGASにだけ保存される。
