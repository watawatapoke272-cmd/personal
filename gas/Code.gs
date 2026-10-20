/**
 * @OnlyCurrentDoc
 * （このスクリプトがひも付いたスプレッドシートだけにアクセスを限定する。Googleの許可画面の権限も小さくなる）
 *
 * ポケモン攻略メモ 同期用 GAS（スプレッドシートにひも付けて使う）
 *
 * - アプリが POST で「手持ち（ソフト別）」を送ると、シートの内容と統合して保存し、統合結果を返す
 * - 統合規則は src/merge.ts と同じ（個体ごとに更新時刻が新しい方／削除記録／パーティは最後に変えた方）
 * - 合言葉は スクリプトプロパティ SYNC_KEY に保存（コードには書かない）
 *
 * シート構成（自動で作られる）
 *   sv / swsh : id | updatedAt | deleted(1=削除記録) | json
 *   party     : game | updatedAt | json(個体idの配列)
 */

var GAMES = ['sv', 'swsh'];

function doGet() {
  // 接続確認用（データは返さない）
  return out_({ ok: true, message: 'pokemon-sync alive' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var key = PropertiesService.getScriptProperties().getProperty('SYNC_KEY');
    if (!key || body.key !== key) return out_({ ok: false, error: 'unauthorized' });
    if (GAMES.indexOf(body.game) < 0) return out_({ ok: false, error: 'unknown game' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var merged = mergeSaves_(readSave_(ss, body.game), normalize_(body.save));
    writeSave_(ss, body.game, merged);
    return out_({ ok: true, save: merged, serverTime: Date.now() });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normalize_(s) {
  s = s || {};
  return {
    version: 1,
    mons: s.mons || {},
    party: Array.isArray(s.party) ? s.party : [],
    partyUpdatedAt: Number(s.partyUpdatedAt) || 0,
    deleted: s.deleted || {},
  };
}

// ---- 統合（src/merge.ts と同じ規則） ----
function mergeSaves_(a, b) {
  var ids = {};
  [a.mons, b.mons, a.deleted, b.deleted].forEach(function (o) {
    Object.keys(o).forEach(function (id) { ids[id] = true; });
  });
  var mons = {};
  var deleted = {};
  Object.keys(ids).forEach(function (id) {
    var ma = a.mons[id], mb = b.mons[id];
    var mon;
    if (ma && mb) {
      if (ma.updatedAt !== mb.updatedAt) mon = mb.updatedAt > ma.updatedAt ? mb : ma;
      else mon = JSON.stringify(ma) >= JSON.stringify(mb) ? ma : mb;
    } else mon = ma || mb;
    var da = a.deleted[id] === undefined ? -1 : a.deleted[id];
    var db = b.deleted[id] === undefined ? -1 : b.deleted[id];
    var del = Math.max(da, db);
    var monAt = mon ? mon.updatedAt : -1;
    if (del >= 0 && del >= monAt) deleted[id] = del;
    else if (mon) mons[id] = mon;
  });
  var winner;
  if (a.partyUpdatedAt !== b.partyUpdatedAt) winner = b.partyUpdatedAt > a.partyUpdatedAt ? b : a;
  else winner = a.party.join() >= b.party.join() ? a : b;
  // パーティは存在しない個体の除外をここでは行わない（src/merge.ts と同じ理由）。アプリ側で整える
  return {
    version: 1,
    mons: mons,
    party: winner.party.slice(),
    deleted: deleted,
    partyUpdatedAt: Math.max(a.partyUpdatedAt, b.partyUpdatedAt),
  };
}

// ---- シートの読み書き ----
function sheet_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSave_(ss, game) {
  var save = { version: 1, mons: {}, party: [], partyUpdatedAt: 0, deleted: {} };
  var sh = sheet_(ss, game, ['id', 'updatedAt', 'deleted', 'json']);
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    sh.getRange(2, 1, n, 4).getValues().forEach(function (r) {
      var id = String(r[0]);
      if (!id) return;
      if (Number(r[2]) === 1) save.deleted[id] = Number(r[1]);
      else save.mons[id] = JSON.parse(r[3]);
    });
  }
  var ps = sheet_(ss, 'party', ['game', 'updatedAt', 'json']);
  var pn = ps.getLastRow() - 1;
  if (pn > 0) {
    ps.getRange(2, 1, pn, 3).getValues().forEach(function (r) {
      if (r[0] === game) {
        save.partyUpdatedAt = Number(r[1]) || 0;
        save.party = JSON.parse(r[2] || '[]');
      }
    });
  }
  return save;
}

function writeSave_(ss, game, save) {
  var sh = sheet_(ss, game, ['id', 'updatedAt', 'deleted', 'json']);
  var rows = [];
  Object.keys(save.mons).forEach(function (id) {
    rows.push([id, save.mons[id].updatedAt, 0, JSON.stringify(save.mons[id])]);
  });
  Object.keys(save.deleted).forEach(function (id) {
    rows.push([id, save.deleted[id], 1, '']);
  });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 4).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);

  var ps = sheet_(ss, 'party', ['game', 'updatedAt', 'json']);
  var pn = ps.getLastRow() - 1;
  var others = [];
  if (pn > 0) {
    ps.getRange(2, 1, pn, 3).getValues().forEach(function (r) {
      if (r[0] && r[0] !== game) others.push(r);
    });
    ps.getRange(2, 1, pn, 3).clearContent();
  }
  others.push([game, save.partyUpdatedAt, JSON.stringify(save.party)]);
  ps.getRange(2, 1, others.length, 3).setValues(others);
}
