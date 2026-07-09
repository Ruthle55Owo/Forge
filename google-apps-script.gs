/**
 * Forge Athlete v9.4 -> Google Sheets two-way sync
 *
 * Fix for: Push works, Pull fails on phone. Adds iframe pull fallback + visible app/backend diagnostics.
 *
 * The important change: the latest full Forge JSON is stored inside the same
 * spreadsheet in a chunked LatestBackup tab. Pull reads from that tab, so it
 * no longer depends on a separate Drive JSON file being created/read correctly.
 *
 * Setup:
 * 1) Open your Forge Training Log Google Sheet.
 * 2) Extensions -> Apps Script.
 * 3) Replace Code.gs with this whole file.
 * 4) Change SECRET_TOKEN.
 * 5) Deploy -> Manage deployments -> Edit -> Version: New version -> Deploy
 *    or Deploy -> New deployment -> Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6) Copy the /exec URL into Forge Settings with the same token.
 */

const SECRET_TOKEN = 'CHANGE_ME_TO_A_RANDOM_SECRET_PHRASE';
const LATEST_BACKUP_SHEET = 'LatestBackup';
const CHUNK_SIZE = 45000;

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') {
      return output_({ ok: true, message: 'Forge sync backend is reachable.', version: 'v9.4', at: new Date().toISOString() }, p.callback);
    }

    if (p.action === 'pullFrame') {
      if (p.token !== SECRET_TOKEN) return frameOutput_(p.pullId || '', { ok: false, error: 'Bad or missing token.' });
      const latest = readLatestBackupFromSheet_();
      return frameOutput_(p.pullId || '', { ok: true, savedAt: latest.savedAt || '', db: latest.db || null });
    }

    if (p.action === 'pullLatest') {
      if (p.token !== SECRET_TOKEN) return output_({ ok: false, error: 'Bad or missing token.' }, p.callback);
      const latest = readLatestBackupFromSheet_();
      return output_({ ok: true, savedAt: latest.savedAt || '', db: latest.db || null }, p.callback);
    }

    return output_({ ok: true, message: 'Forge Sheets Sync is running. Use action=pullLatest to pull.', at: new Date().toISOString() }, p.callback);
  } catch (err) {
    if (p.action === 'pullFrame') return frameOutput_(p.pullId || '', { ok: false, error: errorText_(err) });
    return output_({ ok: false, error: errorText_(err) }, p.callback);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);

    if (!payload || payload.token !== SECRET_TOKEN) {
      return output_({ ok: false, error: 'Bad or missing token.' });
    }
    if (payload.action !== 'syncAll') {
      return output_({ ok: false, error: 'Unknown action: ' + String(payload.action || '') });
    }

    const db = payload.db || {};
    const savedAt = new Date().toISOString();

    // Write full backup first so a visible-sheet failure cannot destroy pull.
    writeLatestBackupToSheet_(db, savedAt, payload);
    writeForgeDatabase_(db, payload, savedAt);

    return output_({ ok: true, syncedAt: savedAt });
  } catch (err) {
    return output_({ ok: false, error: errorText_(err) });
  }
}

function writeLatestBackupToSheet_(db, savedAt, payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(LATEST_BACKUP_SHEET) || ss.insertSheet(LATEST_BACKUP_SHEET);
  const envelope = {
    savedAt: savedAt || new Date().toISOString(),
    app: 'Forge Athlete',
    schema: 'sheet-chunks-v1',
    sentAtFromForge: payload && payload.sentAt || '',
    reason: payload && payload.reason || '',
    db: db || {}
  };

  const text = JSON.stringify(envelope);
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));

  const rows = [
    ['type', 'index', 'value'],
    ['meta', 'savedAt', envelope.savedAt],
    ['meta', 'schema', envelope.schema],
    ['meta', 'chunkSize', CHUNK_SIZE],
    ['meta', 'chunks', chunks.length],
    ['meta', 'chars', text.length],
    ['meta', 'sessions', (db.sessions || []).length],
    ['meta', 'exercises', (db.exercises || []).length]
  ];
  chunks.forEach((chunk, idx) => rows.push(['chunk', idx + 1, chunk]));

  sh.clearContents();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.setFrozenRows(1);
  try { sh.hideSheet(); } catch (e) {}
}

function readLatestBackupFromSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(LATEST_BACKUP_SHEET);
  if (!sh) return { savedAt: '', db: null };

  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { savedAt: '', db: null };

  let savedAt = '';
  const chunks = [];
  values.slice(1).forEach(row => {
    const type = String(row[0] || '');
    const index = row[1];
    const value = row[2];
    if (type === 'meta' && index === 'savedAt') savedAt = String(value || '');
    if (type === 'chunk') chunks.push({ index: Number(index) || 0, value: String(value || '') });
  });

  if (!chunks.length) return { savedAt: savedAt, db: null };
  chunks.sort((a, b) => a.index - b.index);
  const text = chunks.map(x => x.value).join('');
  const parsed = JSON.parse(text);
  return { savedAt: parsed.savedAt || savedAt || '', db: parsed.db || null };
}

function writeForgeDatabase_(db, payload, savedAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  writeTable_(ss, 'Sessions', [
    ['sessionId','date','name','start','end','exerciseCount','setCount','volumeKg','notes','syncedAt']
  ].concat((db.sessions || []).map(s => [
    s.id || '', s.date || '', s.name || '', s.start || '', s.end || '',
    (s.exercises || []).length, countSets_(s), round_(sessionVolume_(s), 2), s.notes || '', savedAt
  ])));

  const setRows = [['sessionId','date','sessionName','exerciseId','exerciseName','exerciseIndex','supersetGroup','setIndex','setId','setType','weightKg','reps','rpe','volumeKg','e1RM','done','notes']];
  (db.sessions || []).forEach(s => {
    (s.exercises || []).forEach((ex, exIndex) => {
      (ex.sets || []).forEach((set, setIndex) => {
        if (set.done === false && !num_(set.weight) && !num_(set.reps)) return;
        const weight = num_(set.weight), reps = num_(set.reps);
        setRows.push([
          s.id || '', s.date || '', s.name || '', ex.exerciseId || '', ex.name || '', exIndex + 1,
          ex.superset || ex.supersetGroup || '', setIndex + 1, set.id || '', set.type || 'working', weight, reps, set.rpe || '',
          round_(weight * reps, 2), round_(e1rm_(weight, reps), 2), set.done !== false, ex.notes || ''
        ]);
      });
    });
  });
  writeTable_(ss, 'Sets', setRows);

  writeTable_(ss, 'Exercises', [
    ['exerciseId','name','muscle','primaryMuscles','secondaryMuscles','equipment','goalMin','goalMax','increment','notes','sticky']
  ].concat((db.exercises || []).map(e => [
    e.id || '', e.name || '', e.muscle || '', list_(e.primaryMuscles), list_(e.secondaryMuscles), e.equipment || '',
    e.goalMin || '', e.goalMax || '', e.increment || '', e.notes || '', e.sticky || ''
  ])));

  writeTable_(ss, 'Templates', [
    ['templateId','templateName','exerciseIndex','exerciseId','target','rest','supersetGroup','notes']
  ].concat(flatMap_((db.templates || []), t => (t.exercises || []).map((ex, i) => [
    t.id || '', t.name || '', i + 1, ex.exerciseId || '', ex.target || '', ex.rest || '', ex.superset || ex.supersetGroup || '', t.notes || ''
  ]))));

  writeTable_(ss, 'Cardio', [
    ['id','date','type','distanceKm','minutes','paceMinPerKm','avgHR','intensity','notes']
  ].concat((db.cardio || []).map(c => [
    c.id || '', c.date || '', c.type || '', num_(c.distance), num_(c.minutes), pace_(c.distance, c.minutes), c.hr || '', c.intensity || '', c.notes || ''
  ])));

  writeTable_(ss, 'Body', [
    ['id','date','weightKg','sleepHours','energy','soreness','stress','protein','calories','steps','notes']
  ].concat((db.body || []).map(b => [
    b.id || '', b.date || '', b.weight || '', b.sleep || '', b.energy || '', b.soreness || '', b.stress || '', b.protein || '', b.calories || '', b.steps || '', b.notes || ''
  ])));

  writeTable_(ss, 'Goals', [
    ['id','text','done']
  ].concat((db.goals || []).map(g => [g.id || '', g.text || '', !!g.done])));

  writeTable_(ss, 'SyncLog', [
    ['key','value'],
    ['lastSyncedAt', savedAt],
    ['sentAtFromForge', payload.sentAt || ''],
    ['reason', payload.reason || ''],
    ['app', payload.app || 'Forge Athlete'],
    ['sessions', (db.sessions || []).length],
    ['sets', Math.max(0, setRows.length - 1)],
    ['cardio', (db.cardio || []).length],
    ['body', (db.body || []).length],
    ['latestBackupLocation', LATEST_BACKUP_SHEET + ' sheet chunks']
  ]);
}

function writeTable_(ss, name, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, rows[0].length); } catch (e) {}
}

function countSets_(session) {
  let n = 0;
  (session.exercises || []).forEach(ex => (ex.sets || []).forEach(set => {
    if (set.done !== false && (num_(set.weight) || num_(set.reps))) n++;
  }));
  return n;
}

function sessionVolume_(session) {
  let total = 0;
  (session.exercises || []).forEach(ex => (ex.sets || []).forEach(set => {
    if (set.done !== false) total += num_(set.weight) * num_(set.reps);
  }));
  return total;
}

function e1rm_(weight, reps) {
  return weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0;
}

function pace_(distance, minutes) {
  const d = num_(distance), m = num_(minutes);
  return d > 0 && m > 0 ? round_(m / d, 3) : '';
}

function num_(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

function round_(v, d) {
  const p = Math.pow(10, d || 0);
  return Math.round((v || 0) * p) / p;
}

function list_(v) {
  if (Array.isArray(v)) return v.join(', ');
  return v || '';
}

function flatMap_(arr, fn) {
  return Array.prototype.concat.apply([], arr.map(fn));
}

function errorText_(err) {
  return String(err && err.stack ? err.stack : err);
}


function frameOutput_(pullId, payload) {
  const html = '<!doctype html><html><body><script>' +
    'try{parent.postMessage({source:"forge-pull",pullId:' + JSON.stringify(String(pullId || '')) + ',payload:' + JSON.stringify(payload || {}) + '},"*");}catch(e){}' +
    '</' + 'script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('Forge Pull')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    const safe = String(callback).replace(/[^A-Za-z0-9_$\.]/g, '');
    return ContentService
      .createTextOutput(safe + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
