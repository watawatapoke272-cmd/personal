# data-sources

技マシンの入手場所・必要素材を作るための元データ（2026-10-20 に取得）。
`npm run build-machine-sources` がこれらを読んで `public/data/{sv,swsh}/machine-sources.json` を生成する。

| ファイル | 取得元 | 使う内容 |
|---|---|---|
| `g8-sv-tm.html` | ゲームエイト「ポケモンSV わざマシンの場所一覧」 | SV: 入手方法（作成解禁条件）・LP・必要素材（日本語） |
| `g8-swsh-tm.html` | ゲームエイト「ポケモン剣盾 技マシン一覧と入手場所」 | 剣盾TM: 入手場所・価格（日本語） |
| `g8-swsh-tr.html` | ゲームエイト「ポケモン剣盾 技レコード一覧と入手方法」 | 剣盾TR: マックスレイドの巣（日本語） |
| `bulbapedia-sv-tm.json` | Bulbapedia「List of TMs in Pokémon Scarlet and Violet」 | SV: 拾える場所（英語地名） |
| `bulbapedia-swsh-tm.json` | Bulbapedia「List of TMs and TRs in Pokémon Sword and Shield」 | 剣盾TR: ワット価格・固定入手場所（英語地名） |
| `bulbapedia-locations-ja.json` | Bulbapedia 各地名ページの日本語名 | 英語地名 → 日本語地名の変換表 |

個人利用目的で、公開しない前提のデータ。
