#!/usr/bin/env python3
"""ボス戦データ（博士AI・BBリーグ・スグリ等のトレーナー戦、7★イベントレイド）を Bulbapedia から取得して
public/data/sv/bosses.json を作る。ポケモン・技・特性・持ち物は public/data/sv の slug / ID に変換する。

使い方: python scripts/build-bosses.py   （先に npm run build-data で public/data を作っておく）
出典: Bulbapedia (CC BY-NC-SA 2.5)。個人利用の範囲で使う。
"""
import json, re, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "sv"
UA = "pokemon-memo-personal/1.0 (personal use)"

pokemon = json.loads((DATA / "pokemon.json").read_text(encoding="utf-8"))
moves = json.loads((DATA / "moves.json").read_text(encoding="utf-8"))
abilities = {a["slug"] for a in json.loads((DATA / "abilities.json").read_text(encoding="utf-8"))}
items = {i["slug"] for i in json.loads((DATA / "items.json").read_text(encoding="utf-8"))}
move_by_slug = {m["slug"]: m["id"] for m in moves}
poke_by_slug = {p["slug"]: p for p in pokemon}

NATURE_JA = {
    "Hardy": "がんばりや", "Lonely": "さみしがり", "Brave": "ゆうかん", "Adamant": "いじっぱり", "Naughty": "やんちゃ",
    "Bold": "ずぶとい", "Docile": "すなお", "Relaxed": "のんき", "Impish": "わんぱく", "Lax": "のうてんき",
    "Timid": "おくびょう", "Hasty": "せっかち", "Serious": "まじめ", "Jolly": "ようき", "Naive": "むじゃき",
    "Modest": "ひかえめ", "Mild": "おっとり", "Quiet": "れいせい", "Bashful": "てれや", "Rash": "うっかりや",
    "Calm": "おだやか", "Gentle": "やさしい", "Sassy": "なまいき", "Careful": "しんちょう", "Quirky": "きまぐれ",
}
LABEL_JA = {
    "First battle": "初戦", "League Club Room": "クラブルーム（再戦）",
}
# アプリのデータに無い特性・持ち物の日本語名（画面表示用）
EXTRA_NAMES = {"tera-shell": "テラスシェル", "kee-berry": "アッキのみ", "tera-shift": "テラスチェンジ"}
unresolved: list[str] = []

HEADING_JA = {
    "First battle": "初戦", "Second battle": "2戦目", "Subsequent battles": "再戦",
    "Fourth battle": "第4戦", "Fifth battle": "第5戦", "Sixth battle": "第6戦", "Seventh battle": "第7戦",
    "Third battle": "第3戦", "First Multi Battle partner": "マルチバトル（1回目の相棒）",
    "Second Multi Battle partner": "マルチバトル（2回目の相棒）", "Area Zero Multi Battle partner": "マルチバトル（相棒）",
    "League Club Room": "リーグ部の部室（再戦）", "Secret boss": "隠しボス", "Pokémon": "",
    "Before completing The Way Home": "「ホーム」クリア前", "After completing The Way Home": "「ホーム」クリア後",
}
CLASS_JA = {
    "of the BB League Elite Four": "BBリーグ四天王", "BB League Champion": "BBリーグ チャンピオン",
    "Blueberry Academy Director": "ブルーベリー学園 校長", "Pokémon Trainer": "",
}
LOCATION_JA_FILE = ROOT / "data-sources" / "bulbapedia-locations-ja.json"
LOCATION_JA = json.loads(LOCATION_JA_FILE.read_text(encoding="utf-8")) if LOCATION_JA_FILE.exists() else {}
LOCATION_JA.setdefault("Zero Lab", "ゼロラボ")
LOCATION_JA.setdefault("Blueberry Academy", "ブルーベリー学園")


def jname(page: str) -> str:
    m = re.search(r"\|\s*jname\s*=\s*([^\n|]*)", fetch(page))
    return m.group(1).strip() if m else ""


def fetch(page: str) -> str:
    u = "https://bulbapedia.bulbagarden.net/w/api.php?" + urllib.parse.urlencode(
        {"action": "parse", "page": page, "prop": "wikitext", "redirects": 1, "format": "json", "formatversion": 2})
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA})) as r:
        return json.load(r)["parse"]["wikitext"]


def slugify(name: str) -> str:
    s = name.strip().lower().replace("’", "").replace("'", "").replace(".", "").replace(":", "")
    return re.sub(r"[\s_]+", "-", s)


def field(blk: str, key: str) -> str:
    m = re.search(r"\n\|[ \t]*" + key + r"[ \t]*=[ \t]*([^\n]*)", blk)
    if not m:
        return ""
    # 「| move1 = X | move1type = Y」のように同じ行に続く項目を切り落とす
    return re.split(r"\s*\|\s*\w+\s*=", m.group(1))[0].replace("&nbsp;", " ").strip()


def clean_level(v: str) -> str:
    # {{tt|78|First battle}}/{{tt|83|League Club Room}} -> 78（初戦）/ 83（クラブルーム（再戦））
    def tt(m):
        lab = LABEL_JA.get(m.group(2).strip(), m.group(2).strip())
        return f"{m.group(1)}（{lab}）"
    v = re.sub(r"\{\{tt\|([^|}]*)\|([^}]*)\}\}", tt, v)
    return re.sub(r"\s*/\s*", " / ", v)


def resolve_pokemon(name: str, ndex: str, form: str, ctx: str) -> str | None:
    if form:
        key = slugify(name) + "-" + slugify(form.replace("form", "").replace("Form", ""))
        for s in (key, slugify(name) + "-" + slugify(form)):
            if s in poke_by_slug:
                return s
        cand = [p["slug"] for p in pokemon if slugify(name) in p["slug"] and slugify(form.split()[0]) in p["slug"]]
        if len(cand) == 1:
            return cand[0]
    n = int(ndex) if ndex.isdigit() else 0
    base = [p for p in pokemon if p["id"] == n]
    if base:
        return base[0]["slug"]
    s = slugify(name)
    if s in poke_by_slug:
        return s
    unresolved.append(f"pokemon {name} (ndex {ndex}, form {form}) in {ctx}")
    return None


def parse_member(blk: str, ctx: str) -> dict | None:
    name = field(blk, "pokemon")
    slug = resolve_pokemon(name, field(blk, "ndex"), field(blk, "form"), ctx)
    if not slug:
        return None
    ab = slugify(field(blk, "ability"))
    if ab and ab not in abilities and ab not in EXTRA_NAMES:
        unresolved.append(f"ability {ab} ({name}) in {ctx}")
        ab = ""
    held = slugify(field(blk, "held"))
    if held and held not in items and held not in EXTRA_NAMES:
        unresolved.append(f"item {held} ({name}) in {ctx}")
    mv = []
    for i in range(1, 5):
        mname = field(blk, f"move{i}")
        if not mname:
            continue
        mid = move_by_slug.get(slugify(mname))
        if mid is None:
            unresolved.append(f"move {mname} ({name}) in {ctx}")
        else:
            mv.append(mid)
    cap = field(blk, "caption")
    nat = re.search(r"Nature:\s*(\w+)", cap)
    tera = slugify(field(blk, "tera") or field(blk, "teratype"))
    return {
        "slug": slug, "level": clean_level(field(blk, "level")),
        "ability": ab or None, "item": held if (held in items or held in EXTRA_NAMES) else None,
        "nature": NATURE_JA.get(nat.group(1)) if nat else None,
        "tera": tera or None, "moves": mv,
    }


def parse_parties(page: str, want, ja_page: str | None = None) -> list[dict]:
    w = fetch(page)
    name_ja = jname(ja_page or page)
    out = []
    for m in re.finditer(r"\{\{Party\s*\n(.*?)\n\}\}", w, re.S):
        hdr = m.group(1)
        end = w.find("{{Party/end}}", m.end())
        body = w[m.end():end]
        name = re.sub(r"\{\{color2\|\w+\|([^}]*)\}\}", r"\1", field(hdr, "name"))
        info = {
            "name": name, "class": (field(hdr, "class") or field(hdr, "class2")).strip(),
            "location": field(hdr, "location"), "game": field(hdr, "game"),
        }
        heads = re.findall(r"\n(={3,6})\s*([^=\n]+?)\s*\1", w[:m.start()])
        def plain(t):
            return re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]|\{\{DL\|[^|]*\|([^}]*)\}\}", lambda x: x.group(1) or x.group(2), t)
        last = heads[-1] if heads else ("", "")
        # 見出しが5段目なら、親（4段目以上）の見出しも付ける（例: 第3戦 / ストーリー完了前）
        parent = next((h for h in reversed(heads[:-1]) if len(h[0]) < len(last[0])), None)
        info["heading"] = " / ".join(plain(h[1]) for h in ([parent] if parent and len(last[0]) >= 5 else []) + [last])
        blocks = re.findall(r"\{\{Pokémon\s*\n(.*?)\n\}\}", body, re.S)
        info["n"] = len(blocks)
        ai = name.startswith("AI ")
        info["nameJa"] = (name_ja + "のAI") if ai else ("楽園防衛プログラム" if name == "Paradise Protection Protocol" else name_ja)
        info["classJa"] = CLASS_JA.get(info["class"], info["class"])
        info["locationJa"] = LOCATION_JA.get(info["location"], info["location"])
        info["headingJa"] = " / ".join(x for x in (HEADING_JA.get(h.strip(), h.strip()) for h in info["heading"].split("/")) if x)
        if not want(info):
            continue
        team = [x for x in (parse_member(b, f"{page}:{name}") for b in blocks) if x]
        info["party"] = team
        out.append(info)
    return out


# ---- トレーナー戦 ----
TRAINER_PAGES = [
    ("Professor_Turo", lambda i: True),
    ("Professor_Sada", lambda i: True),
    ("Crispin", lambda i: "Elite Four" in i["class"]),
    ("Amarys", lambda i: "Elite Four" in i["class"]),
    ("Lacey", lambda i: "Elite Four" in i["class"]),
    ("Drayton", lambda i: "Elite Four" in i["class"]),
    ("Kieran", lambda i: i["n"] >= 5 or "Underdepths" in i["location"]),
    ("Carmine", lambda i: i["n"] >= 5 or "Underdepths" in i["location"]),
    ("Blueberry_Academy", lambda i: "Director" in i["class"], "Cyrano"),
]
battles = []
for page, want, *ja in TRAINER_PAGES:
    for b in parse_parties(page, want, ja[0] if ja else None):
        b["page"] = page
        battles.append(b)

# ---- 7★イベントレイド ----
raid_text = fetch("Tera_Raid_Battle")
sec = raid_text[raid_text.find("=====7★ Raids====="):]
sec = sec[:sec.find("====Kitakami====")]
raids = []
for row in sec.split("\n|-")[1:]:
    cells = [c.strip() for c in re.split(r"\n\|\s", row) if c.strip()]
    if len(cells) < 6:
        continue
    title = cells[0].lstrip("| ").strip()
    pm = re.search(r"\{\{p\|([^}|]+)\}\}", cells[1])
    form = re.sub(r"\[\[[^|\]]*\|?([^\]]*)\]\]", r"\1", cells[2]).strip()
    tm = re.search(r"\{\{t\|(\w+)\}\}", cells[5])
    dates = [re.search(r"data-sort-value=\"([\d-]+)\"", c) for c in (cells[3], cells[4])]
    if not (pm and tm):
        continue
    nm = pm.group(1)
    suffix = {"Hisuian": "hisui", "Paldean": "paldea", "Alolan": "alola", "Galarian": "galar"}.get(form.split()[0] if form and form != "—" else "", "")
    cand = slugify(nm) + ("-" + suffix if suffix else "")
    slug = cand if cand in poke_by_slug else None
    if slug is None:
        found = [p["slug"] for p in pokemon if p["slug"].startswith(slugify(nm)) and (not suffix or suffix in p["slug"])]
        slug = found[0] if len(found) == 1 else None
    if slug is None:
        unresolved.append(f"raid pokemon {nm} / {form}")
        continue
    raids.append({
        "title": title, "slug": slug, "tera": tm.group(1).lower(),
        "start": dates[0].group(1) if dates[0] else None, "end": dates[1].group(1) if dates[1] else None,
    })

# ---- 準伝説・伝説（野生の固定戦） ----
LEGEND_NAMES = {
    "Wo-Chien", "Chien-Pao", "Ting-Lu", "Chi-Yu", "Okidogi", "Munkidori", "Fezandipiti", "Ogerpon", "Pecharunt",
    "Terapagos", "Gouging Fire", "Raging Bolt", "Iron Boulder", "Iron Crown", "Koraidon", "Miraidon",
}
# (ページ, 表示する場所の日本語名)。場所名は Bulbapedia の日本語名（japanese_name）で補う
WILD_PAGES = [
    ("Grasswither_Shrine", None), ("Icerend_Shrine", None), ("Groundblight_Shrine", None), ("Firescourge_Shrine", None),
    ("Paradise_Barrens", "Paradise Barrens"), ("Wistful_Fields", "Wistful Fields"), ("Dreaded_Den", "Dreaded Den"),
    ("Oni_Mountain", "Oni Mountain"), ("Loyalty_Plaza", "Loyalty Plaza"), ("Area_Zero_Underdepths", "Area Zero Underdepths"),
    ("Area_Zero", "Area Zero"),
]
OGERPON_BY_TERA = {"fire": "ogerpon-hearthflame-mask", "water": "ogerpon-wellspring-mask", "rock": "ogerpon-cornerstone-mask", "grass": "ogerpon"}


def kv(blk: str) -> dict:
    return {k: v.strip() for k, v in re.findall(r"\|\s*(\w+)\s*=\s*([^|\n}]*)", blk)}


wild = []
seen = set()
for page, loc in WILD_PAGES:
    w = fetch(page)
    loc_ja = LOCATION_JA.get(loc, "") if loc else ""
    if loc is None:
        m = re.search(r"japanese_name=\{\{tt\|([^|}]*)\|", w)
        loc_ja = m.group(1) if m else page.replace("_", " ")
    for m in re.finditer(r"\{\{Pokémon\s*\n?\|(.*?)\}\}", w, re.S):
        d = kv(m.group(0))
        name = d.get("pokemon", "")
        if name not in LEGEND_NAMES or not d.get("move1"):
            continue
        ctx = w[max(0, m.start() - 400):m.start()]
        # 「ホーム」クリア前後で相手が変わる戦い（ドレッデンの洞窟のオーガポン等）
        note = ""
        notes = re.findall(r";\s*(Before|After) completing", ctx)
        if notes:
            note = "「ホーム」クリア前" if notes[-1] == "Before" else "「ホーム」クリア後"
        teras = [slugify(d[k]) for k in ("tera", "tera2") if d.get(k)]
        slug = OGERPON_BY_TERA.get(teras[0]) if name == "Ogerpon" and teras else None
        slug = slug or resolve_pokemon(name, d.get("ndex", ""), "", f"wild:{page}")
        if not slug:
            continue
        ab = slugify(d.get("ability", ""))
        mv = []
        for i in range(1, 5):
            mname = d.get(f"move{i}")
            if not mname:
                continue
            mid = move_by_slug.get(slugify(mname))
            if mid is None:
                unresolved.append(f"move {mname} ({name}) in wild:{page}")
            else:
                mv.append(mid)
        key = (slug, d.get("level"), tuple(teras), tuple(mv), note)
        if key in seen:
            continue
        seen.add(key)
        # テラパゴスはスグリの戦闘ブロックと重なるので、技が4つ揃っている方を使う
        if name == "Terapagos" and len(mv) < 4:
            continue
        wild.append({
            "slug": slug, "level": d.get("level", ""), "tera": teras, "ability": ab if (ab in abilities or ab in EXTRA_NAMES) else None,
            "moves": mv, "location": loc or page, "locationJa": loc_ja, "note": note,
        })
        if ab and ab not in abilities and ab not in EXTRA_NAMES:
            unresolved.append(f"ability {ab} ({name}) in wild:{page}")

out = {"generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(timespec="seconds"),
       "source": "Bulbapedia", "extraNames": EXTRA_NAMES, "battles": battles, "raids": raids, "wild": wild}
(DATA / "bosses.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"battles: {len(battles)}, raids: {len(raids)}, wild: {len(wild)}")
for b in battles:
    print(f"  {b['page']}: {b['name']} | {b['class']} | {b['location']} | {b['game']} | {b['heading']} | n={b['n']} resolved={len(b['party'])}")
if unresolved:
    print("UNRESOLVED:")
    for u in sorted(set(unresolved)):
        print("  ", u)
