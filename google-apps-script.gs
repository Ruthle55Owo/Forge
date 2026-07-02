/**
 * Forge Athlete -> Google Sheets two-way sync
 *
 * Setup:
 * 1) Create a Google Sheet named "Forge Training Log".
 * 2) Extensions -> Apps Script.
 * 3) Paste this whole file into Code.gs.
 * 4) Change SECRET_TOKEN to a long random phrase.
 * 5) Deploy -> New deployment -> Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 6) Copy the /exec URL into Forge Settings, plus the same SECRET_TOKEN.
 *
 * How sync works:
 * - Forge pushes the full database after saved logs.
 * - This script rewrites readable tabs and saves the latest full JSON in Drive.
 * - Forge can pull that latest JSON on app open / manual pull.
 */

const SECRET_TOKEN = 'CHANGE_ME_TO_A_RANDOM_SECRET_PHRASE';
const SAVE_LATEST_JSON_TO_DRIVE = true;
const DRIVE_FOLDER_NAME = 'Forge Backups';
const LATEST_BACKUP_FILE_NAME = 'forge-latest-backup.json';

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'pullLatest') {
      if (p.token !== SECRET_TOKEN) return output_({ ok: false, error: 'Bad or missing token.' }, p.callback);
      const latest = readLatestBackupFromDrive_();
      return output_({ ok: true, savedAt: latest.savedAt || '', db: latest.db || null }, p.callback);
    }
    return output_({ ok: true, message: 'Forge Sheets Two-Way Sync is running.' }, p.callback);
  } catch (err) {
    return output_({ ok: false, error: String(err && err.stack ? err.stack : err) }, e && e.parameter && e.parameter.callback);
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
      return output_({ ok: false, error: 'Unknown action.' });
    }
    const db = payload.db || {};
    const savedAt = new Date().toISOString();
    writeForgeDatabase_(db, payload, savedAt);
    if (SAVE_LATEST_JSON_TO_DRIVE) saveLatestBackupToDrive_(db, savedAt);
    return output_({ ok: true, syncedAt: savedAt });
  } catch (err) {
    return output_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function writeForgeDatabase_(db, payload, savedAt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeTable_(ss, 'Sessions', [
    ['sessionId','date','name','start','end','exerciseCount','setCount','volumeKg','notes','syncedAt']
  ].concat((db.sessions || []).map(s => [
    s.id || '', s.date || '', s.name || '', s.start || '', s.end || '',
    (s.exercises || []).length, countSets_(s), round_(sessionVolume_(s), 2), s.notes || '', savedAt || new Date().toISOString()
  ])));

  const setRows = [['sessionId','date','sessionName','exerciseId','exerciseName','exerciseIndex','setIndex','setId','setType','weightKg','reps','rpe','volumeKg','e1RM','done','notes']];
  (db.sessions || []).forEach(s => {
    (s.exercises || []).forEach((ex, exIndex) => {
      (ex.sets || []).forEach((set, setIndex) => {
        if (set.done === false && !num_(set.weight) && !num_(set.reps)) return;
        const weight = num_(set.weight), reps = num_(set.reps);
        setRows.push([
          s.id || '', s.date || '', s.name || '', ex.exerciseId || '', ex.name || '', exIndex + 1,
          setIndex + 1, set.id || '', set.type || 'working', weight, reps, set.rpe || '',
          round_(weight * reps, 2), round_(e1rm_(weight, reps), 2), set.done !== false, ex.notes || ''
        ]);
      });
    });
  });
  writeTable_(ss, 'Sets', setRows);

  writeTable_(ss, 'Exercises', [
    ['exerciseId','name','muscle','equipment','goalMin','goalMax','increment','notes','sticky']
  ].concat((db.exercises || []).map(e => [
    e.id || '', e.name || '', e.muscle || '', e.equipment || '', e.goalMin || '', e.goalMax || '', e.increment || '', e.notes || '', e.sticky || ''
  ])));

  writeTable_(ss, 'Cardio', [
    ['id','date','type','distanceKm','minutes','paceMinPerKm','avgHR','notes']
  ].concat((db.cardio || []).map(c => [
    c.id || '', c.date || '', c.type || '', num_(c.distance), num_(c.minutes), pace_(c.distance, c.minutes), c.hr || '', c.notes || ''
  ])));

  writeTable_(ss, 'Body', [
    ['id','date','weightKg','sleepHours','steps','notes']
  ].concat((db.body || []).map(b => [
    b.id || '', b.date || '', b.weight || '', b.sleep || '', b.steps || '', b.notes || ''
  ])));

  writeTable_(ss, 'Goals', [
    ['id','text','done']
  ].concat((db.goals || []).map(g => [g.id || '', g.text || '', !!g.done])));

  writeTable_(ss, 'SyncLog', [
    ['key','value'],
    ['lastSyncedAt', savedAt || new Date().toISOString()],
    ['sentAtFromForge', payload.sentAt || ''],
    ['reason', payload.reason || ''],
    ['app', payload.app || 'Forge Athlete'],
    ['sessions', (db.sessions || []).length],
    ['sets', Math.max(0, setRows.length - 1)],
    ['cardio', (db.cardio || []).length],
    ['body', (db.body || []).length],
    ['latestJsonFile', LATEST_BACKUP_FILE_NAME]
  ]);
}

function writeTable_(ss, name, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, rows[0].length);
}

function saveLatestBackupToDrive_(db, savedAt) {
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const files = folder.getFilesByName(LATEST_BACKUP_FILE_NAME);
  const envelope = { savedAt: savedAt || new Date().toISOString(), app: 'Forge Athlete', version: 6, db: db };
  const content = JSON.stringify(envelope, null, 2);
  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(LATEST_BACKUP_FILE_NAME, content, MimeType.PLAIN_TEXT);
  }
}

function readLatestBackupFromDrive_() {
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const files = folder.getFilesByName(LATEST_BACKUP_FILE_NAME);
  if (!files.hasNext()) return { savedAt: '', db: null };
  const file = files.next();
  const text = file.getBlob().getDataAsString();
  if (!text) return { savedAt: '', db: null };
  const parsed = JSON.parse(text);
  if (parsed && parsed.db) return { savedAt: parsed.savedAt || file.getLastUpdated().toISOString(), db: parsed.db };
  return { savedAt: file.getLastUpdated().toISOString(), db: parsed };
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
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

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(String(callback).replace(/[^A-Za-z0-9_$\.]/g, '') + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
