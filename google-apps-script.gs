/**
 * Forge Athlete Pro v10.0 — Google Apps Script sync backend
 *
 * Local-first, stable-ID merge, incremental record sync, manifest checks,
 * chunked full-backup push/pull, and A/B backup slots so an interrupted write does
 * not replace the last known-good cloud backup.
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone with the link
 */

const SECRET_TOKEN = 'CHANGE_ME_TO_A_RANDOM_SECRET_PHRASE';
const BACKEND_VERSION = 'v10.0';
const SCHEMA_VERSION = 10;
const CHUNK_SIZE = 45000;
const BACKUP_SHEETS = ['LatestBackup_A', 'LatestBackup_B'];
const LEGACY_BACKUP_SHEET = 'LatestBackup';
const ACTIVE_BACKUP_PROP = 'FORGE_ACTIVE_BACKUP_SHEET';
const COLLECTIONS = ['exercises', 'templates', 'sessions', 'cardio', 'body', 'goals'];
const MAX_DELTA_CHARS = 650000;
const INCOMING_CHUNKS_SHEET = 'IncomingChunks';
const MAX_UPLOAD_CHUNKS = 500;
const MAX_UPLOAD_CHUNK_CHARS = 60000;

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') {
      return output_({
        ok: true,
        message: 'Forge Athlete sync backend is reachable.',
        version: BACKEND_VERSION,
        schemaVersion: SCHEMA_VERSION,
        at: new Date().toISOString()
      }, p.callback);
    }

    if (p.token !== SECRET_TOKEN) {
      if (p.action === 'pullFrame') return frameOutput_(p.pullId || '', { ok: false, error: 'Bad or missing token.' });
      return output_({ ok: false, error: 'Bad or missing token.' }, p.callback);
    }

    if (p.action === 'manifest') {
      return output_(manifestResponse_(), p.callback);
    }

    if (p.action === 'uploadStatus') {
      return output_(incomingUploadStatus_(p.uploadId || ''), p.callback);
    }

    if (p.action === 'pullFrame') {
      const latest = readLatestBackup_();
      return frameOutput_(p.pullId || '', { ok: true, savedAt: latest.savedAt || '', checksum: latest.checksum || '', db: latest.db || null });
    }

    if (p.action === 'pullMeta') {
      const latest = readLatestChunks_();
      return output_({
        ok: true,
        savedAt: latest.savedAt || '',
        chunks: latest.chunks.length,
        chars: latest.chars || 0,
        checksum: latest.checksum || '',
        schemaVersion: latest.schemaVersion || 0,
        appVersion: latest.appVersion || '',
        backendVersion: BACKEND_VERSION,
        slot: latest.slot || ''
      }, p.callback);
    }

    if (p.action === 'pullChunk') {
      const latest = readLatestChunks_();
      const idx = Math.max(1, parseInt(p.index || '1', 10));
      return output_({
        ok: true,
        savedAt: latest.savedAt || '',
        checksum: latest.checksum || '',
        index: idx,
        chunks: latest.chunks.length,
        chunk: latest.chunks[idx - 1] || ''
      }, p.callback);
    }

    if (p.action === 'pullLatest') {
      const latest = readLatestBackup_();
      return output_({ ok: true, savedAt: latest.savedAt || '', checksum: latest.checksum || '', db: latest.db || null }, p.callback);
    }

    if (p.action === 'pullDelta') {
      return output_(buildDeltaResponse_(p.since || ''), p.callback);
    }

    return output_({ ok: true, message: 'Forge Athlete Sheets Sync v10.0 is running.', version: BACKEND_VERSION }, p.callback);
  } catch (err) {
    if (p.action === 'pullFrame') return frameOutput_(p.pullId || '', { ok: false, error: errorText_(err) });
    return output_({ ok: false, error: errorText_(err) }, p.callback);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(raw);
    if (!payload || payload.token !== SECRET_TOKEN) return output_({ ok: false, error: 'Bad or missing token.' });

    if (payload.action === 'syncFullChunk') {
      return output_(storeIncomingChunk_(payload));
    }

    if (payload.action === 'syncFullCommit') {
      return output_(commitIncomingUpload_(payload));
    }

    if (payload.action === 'syncAll') {
      const latest = readLatestBackup_();
      // A manual full push is still merge-safe: a stale device cannot erase
      // newer cloud-only records simply because they are absent locally.
      const db = mergeDatabases_(latest.db || emptyDb_(), payload.db || {});
      const savedAt = new Date().toISOString();
      writeLatestBackupAtomic_(db, savedAt, payload, 'full-merge');
      writeForgeDatabase_(db, payload, savedAt, 'full-merge');
      return output_({ ok: true, syncedAt: savedAt, mode: 'full-merge' });
    }

    if (payload.action === 'syncDelta') {
      const latest = readLatestBackup_();
      const base = normalizeDbEnvelope_(latest.db || emptyDb_());
      const delta = payload.delta || {};
      const merged = applyDelta_(base, delta);
      const savedAt = new Date().toISOString();
      writeLatestBackupAtomic_(merged, savedAt, payload, 'incremental');
      writeForgeDatabase_(merged, payload, savedAt, 'incremental');
      return output_({ ok: true, syncedAt: savedAt, mode: 'incremental', changed: countChanges_(delta.changes || {}) });
    }

    return output_({ ok: false, error: 'Unknown action: ' + String(payload.action || '') });
  } catch (err) {
    return output_({ ok: false, error: errorText_(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function incomingChunksSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(INCOMING_CHUNKS_SHEET) || ss.insertSheet(INCOMING_CHUNKS_SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(['uploadId','index','total','chunk','requestId','sentAt','reason','receivedAt']);
  try { sh.hideSheet(); } catch (ignore) {}
  return sh;
}

function validateUploadId_(id) {
  id = String(id || '');
  if (!/^[A-Za-z0-9._-]{8,160}$/.test(id)) throw new Error('Invalid upload ID.');
  return id;
}

function storeIncomingChunk_(payload) {
  const uploadId = validateUploadId_(payload.uploadId);
  const index = parseInt(payload.index, 10), total = parseInt(payload.total, 10);
  const chunk = String(payload.chunk || '');
  if (!(index >= 1 && total >= 1 && index <= total && total <= MAX_UPLOAD_CHUNKS)) throw new Error('Invalid chunk index/total.');
  if (chunk.length > MAX_UPLOAD_CHUNK_CHARS) throw new Error('Upload chunk is too large.');
  const sh = incomingChunksSheet_(), values = sh.getDataRange().getValues();
  let row = 0;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '') === uploadId && Number(values[i][1]) === index) { row = i + 1; break; }
  }
  const record = [uploadId,index,total,chunk,String(payload.requestId||''),String(payload.sentAt||''),String(payload.reason||''),new Date().toISOString()];
  if (row) sh.getRange(row,1,1,record.length).setValues([record]); else sh.appendRow(record);
  cleanupIncomingChunks_(sh);
  return { ok:true, uploadId:uploadId, index:index, total:total, receivedAt:record[7] };
}

function incomingUploadStatus_(uploadId) {
  uploadId = validateUploadId_(uploadId);
  const ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(INCOMING_CHUNKS_SHEET);
  if (!sh) return { ok:true, uploadId:uploadId, total:0, received:[], missing:[] };
  const values=sh.getDataRange().getValues(), received=[], totals=[];
  for(let i=1;i<values.length;i++) if(String(values[i][0]||'')===uploadId){received.push(Number(values[i][1])||0);totals.push(Number(values[i][2])||0);}
  received.sort(function(a,b){return a-b;});
  const total=totals.length?Math.max.apply(null,totals):0,missing=[];
  for(let i=1;i<=total;i++) if(received.indexOf(i)<0)missing.push(i);
  return {ok:true,uploadId:uploadId,total:total,received:received,missing:missing,complete:total>0&&missing.length===0};
}

function readIncomingUpload_(uploadId) {
  uploadId = validateUploadId_(uploadId);
  const sh = incomingChunksSheet_(), values=sh.getDataRange().getValues(), rows=[];
  for(let i=1;i<values.length;i++) if(String(values[i][0]||'')===uploadId) rows.push({row:i+1,index:Number(values[i][1])||0,total:Number(values[i][2])||0,chunk:String(values[i][3]||''),requestId:String(values[i][4]||''),sentAt:String(values[i][5]||''),reason:String(values[i][6]||'')});
  rows.sort(function(a,b){return a.index-b.index;});
  if(!rows.length)throw new Error('No chunks found for this upload.');
  const total=Math.max.apply(null,rows.map(function(x){return x.total;}));
  if(rows.length!==total)throw new Error('Upload is incomplete: '+rows.length+'/'+total+' chunks.');
  for(let i=0;i<rows.length;i++)if(rows[i].index!==i+1)throw new Error('Upload is missing chunk '+(i+1)+'.');
  return {sheet:sh,rows:rows,text:rows.map(function(x){return x.chunk;}).join(''),requestId:rows[0].requestId,sentAt:rows[0].sentAt,reason:rows[0].reason};
}

function commitIncomingUpload_(payload) {
  const upload=readIncomingUpload_(payload.uploadId), parsed=JSON.parse(upload.text);
  const requestId=String(payload.requestId||parsed.requestId||upload.requestId||'');
  if(requestId && upload.requestId && requestId!==upload.requestId)throw new Error('Upload request ID mismatch.');
  const latest=readLatestBackup_(),db=mergeDatabases_(latest.db||emptyDb_(),parsed.db||parsed||{}),savedAt=new Date().toISOString();
  const meta={action:'syncFullCommit',requestId:requestId,sentAt:payload.sentAt||parsed.sentAt||upload.sentAt||'',reason:payload.reason||parsed.reason||upload.reason||'',app:payload.app||parsed.app||'Forge Athlete',db:db};
  writeLatestBackupAtomic_(db,savedAt,meta,'full-chunked-merge');
  writeForgeDatabase_(db,meta,savedAt,'full-chunked-merge');
  const rowNumbers=upload.rows.map(function(x){return x.row;}).sort(function(a,b){return b-a;});
  rowNumbers.forEach(function(row){upload.sheet.deleteRow(row);});
  return {ok:true,syncedAt:savedAt,mode:'full-chunked-merge',chunks:upload.rows.length};
}

function cleanupIncomingChunks_(sh) {
  const values=sh.getDataRange().getValues(),cutoff=Date.now()-24*60*60*1000,rows=[];
  for(let i=1;i<values.length;i++){const t=new Date(values[i][7]||'').getTime();if(isFinite(t)&&t<cutoff)rows.push(i+1);}
  rows.sort(function(a,b){return b-a;}).forEach(function(row){sh.deleteRow(row);});
}

function emptyDb_() {
  return {
    version: SCHEMA_VERSION,
    settings: {}, exercises: [], templates: [], sessions: [], cardio: [], body: [], goals: [], activeSession: null,
    _meta: { schemaVersion: SCHEMA_VERSION, appVersion: '' }
  };
}

function normalizeDbEnvelope_(db) {
  const out = Object.assign(emptyDb_(), db || {});
  out.version = Math.max(Number(out.version) || 0, SCHEMA_VERSION);
  out.settings = out.settings || {};
  out.settings.cloudSync = { enabled: false, auto: true, autoPull: true, incremental: true };
  out.activeSession = null;
  out._meta = Object.assign({ schemaVersion: SCHEMA_VERSION }, out._meta || {});
  COLLECTIONS.forEach(function(k) { out[k] = dedupeLatestById_(out[k] || []); });
  return out;
}

function applyDelta_(base, delta) {
  const out = normalizeDbEnvelope_(base || emptyDb_());
  const changes = (delta && delta.changes) || {};
  COLLECTIONS.forEach(function(k) {
    out[k] = mergeCollection_(out[k] || [], changes[k] || []);
  });
  if (delta && delta.settings) {
    const incoming = clone_(delta.settings);
    delete incoming.cloudSync;
    out.settings = Object.assign({}, out.settings || {}, incoming || {});
    out.settings.cloudSync = { enabled: false, auto: true, autoPull: true, incremental: true };
  }
  out.version = SCHEMA_VERSION;
  out._meta = Object.assign({}, out._meta || {}, {
    schemaVersion: SCHEMA_VERSION,
    appVersion: delta && delta.appVersion || out._meta && out._meta.appVersion || '',
    lastCloudMergeAt: new Date().toISOString(),
    lastDeviceId: delta && delta.deviceId || ''
  });
  return out;
}

function mergeCollection_(base, changes) {
  const map = {};
  (base || []).forEach(function(x) { if (x && x.id) map[x.id] = clone_(x); });
  (changes || []).forEach(function(x) {
    if (!x || !x.id) return;
    map[x.id] = chooseNewest_(map[x.id], x);
  });
  return Object.keys(map).map(function(id) { return map[id]; });
}

function chooseNewest_(a, b) {
  if (!a) return clone_(b);
  if (!b) return clone_(a);
  const ta = recordTime_(a), tb = recordTime_(b);
  const preferred = tb > ta ? b : ta > tb ? a : (JSON.stringify(b).length >= JSON.stringify(a).length ? b : a);
  const other = preferred === a ? b : a;
  const out = clone_(preferred);

  // Sessions and templates contain nested records. Merge those by their own
  // stable IDs so a newer session shell does not silently drop a set added on
  // another device. Preferred ordering is retained and missing rows append.
  if (Array.isArray(a.exercises) || Array.isArray(b.exercises)) {
    out.exercises = mergeNestedOrdered_(a.exercises || [], b.exercises || [], preferred.exercises || [], 'exercise');
  }
  if (Array.isArray(a.sets) || Array.isArray(b.sets)) {
    out.sets = mergeNestedOrdered_(a.sets || [], b.sets || [], preferred.sets || [], 'set');
  }
  return out;
}

function mergeNestedOrdered_(a, b, preferredOrder, prefix) {
  const map = {}, order = [];
  function key_(x, i, source) {
    return x && x.id ? String(x.id) : prefix + '-legacy-' + source + '-' + i + '-' + String(x && x.exerciseId || '');
  }
  function add_(x, i, source) {
    if (!x || typeof x !== 'object') return;
    const key = key_(x, i, source);
    const copy = clone_(x);
    if (!copy.id) copy.id = key;
    map[key] = map[key] ? chooseNewest_(map[key], copy) : copy;
    if (order.indexOf(key) < 0) order.push(key);
  }
  (preferredOrder || []).forEach(function(x, i) { add_(x, i, 'preferred'); });
  (a || []).forEach(function(x, i) { add_(x, i, 'a'); });
  (b || []).forEach(function(x, i) { add_(x, i, 'b'); });
  return order.map(function(key) { return map[key]; });
}

function mergeDatabases_(cloudDb, incomingDb) {
  const cloud = normalizeDbEnvelope_(cloudDb || emptyDb_());
  const incoming = normalizeDbEnvelope_(incomingDb || emptyDb_());
  const out = emptyDb_();
  out.version = SCHEMA_VERSION;
  out.settings = chooseNewest_(cloud.settings || {}, incoming.settings || {});
  out.settings.cloudSync = { enabled: false, auto: true, autoPull: true, incremental: true };
  COLLECTIONS.forEach(function(k) { out[k] = mergeCollection_(cloud[k] || [], incoming[k] || []); });
  out.activeSession = null;
  out._meta = Object.assign({}, cloud._meta || {}, incoming._meta || {}, {
    schemaVersion: SCHEMA_VERSION,
    lastCloudMergeAt: new Date().toISOString()
  });
  return out;
}

function dedupeLatestById_(arr) {
  const map = {};
  (arr || []).forEach(function(x, i) {
    if (!x || typeof x !== 'object') return;
    const id = x.id || ('legacy-' + i);
    x.id = id;
    map[id] = chooseNewest_(map[id], x);
  });
  return Object.keys(map).map(function(id) { return map[id]; });
}

function recordIso_(x) {
  return x && (x.deletedAt || x.updatedAt || x.createdAt || x.end || x.start || (x.date ? x.date + 'T12:00:00.000Z' : '')) || '';
}

function recordTime_(x) {
  const t = new Date(recordIso_(x)).getTime();
  return isFinite(t) ? t : 0;
}

function buildDeltaResponse_(since) {
  const latest = readLatestBackup_();
  if (!latest.db) return { ok: true, savedAt: '', checksum: '', changes: emptyChanges_(), settings: {}, fullRequired: false };
  const db = normalizeDbEnvelope_(latest.db);
  const sinceMs = new Date(since || '').getTime();
  if (!isFinite(sinceMs) || sinceMs <= 0) {
    return { ok: true, savedAt: latest.savedAt || '', checksum: latest.checksum || '', fullRequired: true, reason: 'No valid delta cursor.' };
  }
  const changes = {};
  let hasReliableTimestamps = true;
  COLLECTIONS.forEach(function(k) {
    changes[k] = (db[k] || []).filter(function(x) {
      const t = recordTime_(x);
      if (!t) hasReliableTimestamps = false;
      return t > sinceMs;
    });
  });
  if (!hasReliableTimestamps) {
    return { ok: true, savedAt: latest.savedAt || '', checksum: latest.checksum || '', fullRequired: true, reason: 'Cloud backup predates timestamped schema.' };
  }
  const response = {
    ok: true,
    savedAt: latest.savedAt || '',
    checksum: latest.checksum || '',
    fullRequired: false,
    settings: sanitizedSettingsForDelta_(db.settings || {}),
    changes: changes,
    counts: countDb_(db),
    backendVersion: BACKEND_VERSION
  };
  if (JSON.stringify(response).length > MAX_DELTA_CHARS) {
    return { ok: true, savedAt: latest.savedAt || '', checksum: latest.checksum || '', fullRequired: true, reason: 'Delta is large; use chunked full pull.' };
  }
  return response;
}

function sanitizedSettingsForDelta_(settings) {
  const out = clone_(settings || {});
  delete out.cloudSync;
  return out;
}

function emptyChanges_() {
  const x = {};
  COLLECTIONS.forEach(function(k) { x[k] = []; });
  return x;
}

function countChanges_(changes) {
  return COLLECTIONS.reduce(function(n, k) { return n + ((changes && changes[k]) || []).length; }, 0);
}

function manifestResponse_() {
  const chunks = readLatestChunks_();
  const hasStoredCounts = chunks.counts && Object.keys(chunks.counts).length > 0;
  let counts = hasStoredCounts ? chunks.counts : null;
  if (!counts && chunks.chunks.length) {
    const latest = readLatestBackup_();
    counts = latest.db ? countDb_(latest.db) : countDb_(emptyDb_());
  }
  return {
    ok: true,
    backendVersion: BACKEND_VERSION,
    schemaVersion: chunks.schemaVersion || 0,
    appVersion: chunks.appVersion || '',
    savedAt: chunks.savedAt || '',
    chars: chunks.chars || 0,
    checksum: chunks.checksum || '',
    chunks: chunks.chunks.length,
    counts: counts || countDb_(emptyDb_()),
    slot: chunks.slot || '',
    requestId: chunks.requestId || ''
  };
}

function countDb_(db) {
  const sessions = active_(db.sessions || []);
  let sets = 0;
  sessions.forEach(function(s) {
    (s.exercises || []).forEach(function(ex) {
      (ex.sets || []).forEach(function(set) {
        if (!set.deletedAt && set.done !== false && (num_(set.weight) || num_(set.reps))) sets++;
      });
    });
  });
  return {
    sessions: sessions.length,
    sets: sets,
    templates: active_(db.templates || []).length,
    exercises: active_(db.exercises || []).length,
    cardio: active_(db.cardio || []).length,
    body: active_(db.body || []).length,
    tombstones: COLLECTIONS.reduce(function(n, k) { return n + (db[k] || []).filter(function(x) { return !!x.deletedAt; }).length; }, 0)
  };
}

function active_(arr) {
  return (arr || []).filter(function(x) { return x && !x.deletedAt; });
}

function writeLatestBackupAtomic_(db, savedAt, payload, mode) {
  const props = PropertiesService.getDocumentProperties();
  const current = props.getProperty(ACTIVE_BACKUP_PROP) || chooseNewestBackupSheet_() || BACKUP_SHEETS[0];
  const target = current === BACKUP_SHEETS[0] ? BACKUP_SHEETS[1] : BACKUP_SHEETS[0];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(target) || ss.insertSheet(target);
  const envelope = {
    savedAt: savedAt || new Date().toISOString(),
    app: 'Forge Athlete',
    appVersion: payload && payload.delta && payload.delta.appVersion || payload && payload.db && payload.db._meta && payload.db._meta.appVersion || '',
    backendVersion: BACKEND_VERSION,
    schemaVersion: SCHEMA_VERSION,
    mode: mode || '',
    sentAtFromForge: payload && payload.sentAt || '',
    reason: payload && payload.reason || '',
    requestId: payload && payload.requestId || '',
    db: db || emptyDb_()
  };
  const text = JSON.stringify(envelope);
  const checksum = sha256_(text);
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) chunks.push(text.slice(i, i + CHUNK_SIZE));
  const counts = countDb_(db || emptyDb_());
  const rows = [
    ['type', 'index', 'value'],
    ['meta', 'savedAt', envelope.savedAt],
    ['meta', 'schemaVersion', SCHEMA_VERSION],
    ['meta', 'appVersion', envelope.appVersion],
    ['meta', 'backendVersion', BACKEND_VERSION],
    ['meta', 'mode', envelope.mode],
    ['meta', 'requestId', envelope.requestId],
    ['meta', 'chunkSize', CHUNK_SIZE],
    ['meta', 'chunks', chunks.length],
    ['meta', 'chars', text.length],
    ['meta', 'checksum', checksum],
    ['meta', 'sessions', counts.sessions],
    ['meta', 'sets', counts.sets],
    ['meta', 'templates', counts.templates],
    ['meta', 'exercises', counts.exercises],
    ['meta', 'cardio', counts.cardio],
    ['meta', 'body', counts.body],
    ['meta', 'tombstones', counts.tombstones]
  ];
  chunks.forEach(function(chunk, idx) { rows.push(['chunk', idx + 1, chunk]); });

  sh.clearContents();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.setFrozenRows(1);
  try { sh.hideSheet(); } catch (ignore) {}

  // Pointer is changed only after the inactive slot is completely written.
  props.setProperty(ACTIVE_BACKUP_PROP, target);
}

function chooseNewestBackupSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let best = '', bestTime = 0;
  BACKUP_SHEETS.concat([LEGACY_BACKUP_SHEET]).forEach(function(name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const meta = readSheetChunks_(sh, name);
    const t = new Date(meta.savedAt || '').getTime();
    if (isFinite(t) && t > bestTime && meta.chunks.length) { best = name; bestTime = t; }
  });
  return best;
}

function activeBackupSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getDocumentProperties();
  let name = props.getProperty(ACTIVE_BACKUP_PROP) || '';
  let sh = name ? ss.getSheetByName(name) : null;
  if (!sh) {
    name = chooseNewestBackupSheet_();
    sh = name ? ss.getSheetByName(name) : null;
    if (name) props.setProperty(ACTIVE_BACKUP_PROP, name);
  }
  return { sheet: sh, name: name };
}

function readLatestChunks_() {
  const slot = activeBackupSheet_();
  if (!slot.sheet) return { savedAt: '', chunks: [], chars: 0, checksum: '', schemaVersion: 0, appVersion: '', requestId: '', counts: {}, slot: '' };
  return readSheetChunks_(slot.sheet, slot.name);
}

function readSheetChunks_(sh, slotName) {
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { savedAt: '', chunks: [], chars: 0, checksum: '', schemaVersion: 0, appVersion: '', requestId: '', counts: {}, slot: slotName || '' };
  const meta = { savedAt: '', chunks: [], chars: 0, checksum: '', schemaVersion: 0, appVersion: '', backendVersion: '', requestId: '', counts: {}, slot: slotName || '' };
  const parts = [];
  values.slice(1).forEach(function(row) {
    const type = String(row[0] || ''), index = row[1], value = row[2];
    if (type === 'meta') {
      if (index === 'savedAt') meta.savedAt = String(value || '');
      if (index === 'chars') meta.chars = Number(value) || 0;
      if (index === 'checksum') meta.checksum = String(value || '');
      if (index === 'schemaVersion' || index === 'schema') meta.schemaVersion = Number(value) || 0;
      if (index === 'appVersion') meta.appVersion = String(value || '');
      if (index === 'backendVersion') meta.backendVersion = String(value || '');
      if (index === 'requestId') meta.requestId = String(value || '');
      if (['sessions','sets','templates','exercises','cardio','body','tombstones'].indexOf(String(index)) >= 0) meta.counts[String(index)] = Number(value) || 0;
    }
    if (type === 'chunk') parts.push({ index: Number(index) || 0, value: String(value || '') });
  });
  parts.sort(function(a, b) { return a.index - b.index; });
  meta.chunks = parts.map(function(x) { return x.value; });
  return meta;
}

function readLatestBackup_() {
  const latest = readLatestChunks_();
  if (!latest.chunks.length) return { savedAt: latest.savedAt || '', checksum: latest.checksum || '', db: null };
  const text = latest.chunks.join('');
  if (latest.chars && text.length !== latest.chars) throw new Error('Stored backup chunk length mismatch. Last good slot was not replaced.');
  if (latest.checksum && sha256_(text) !== latest.checksum) throw new Error('Stored backup checksum mismatch. Last good slot was not replaced.');
  const parsed = JSON.parse(text);
  return { savedAt: parsed.savedAt || latest.savedAt || '', checksum: latest.checksum || '', db: parsed.db || null };
}

function writeForgeDatabase_(db, payload, savedAt, mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessions = active_(db.sessions || []);

  writeTable_(ss, 'Sessions', [
    ['sessionId','date','name','start','end','durationMin','exerciseCount','setCount','volumeKg','notes','createdAt','updatedAt','deletedAt','deviceId','syncedAt']
  ].concat((db.sessions || []).map(function(s) { return [
    s.id || '', s.date || '', s.name || '', s.start || '', s.end || '', durationMin_(s),
    (s.exercises || []).length, countSets_(s), round_(sessionVolume_(s), 2), s.notes || '',
    s.createdAt || '', s.updatedAt || '', s.deletedAt || '', s.deviceId || '', savedAt
  ]; })));

  const setRows = [['sessionId','date','sessionName','exerciseId','exerciseName','exerciseIndex','supersetGroup','setIndex','setId','setType','weightKg','reps','rpe','rir','volumeKg','e1RM','done','setNotes','exerciseNotes','painNote','createdAt','updatedAt','deletedAt']];
  (db.sessions || []).forEach(function(s) {
    (s.exercises || []).forEach(function(ex, exIndex) {
      (ex.sets || []).forEach(function(set, setIndex) {
        if (set.done === false && !num_(set.weight) && !num_(set.reps) && !set.deletedAt) return;
        const weight = num_(set.weight), reps = num_(set.reps);
        setRows.push([
          s.id || '', s.date || '', s.name || '', ex.exerciseId || '', ex.name || '', exIndex + 1,
          ex.groupId || ex.superset || ex.supersetGroup || '', setIndex + 1, set.id || '', set.type || 'working',
          weight, reps, set.rpe || '', set.rir || '', round_(weight * reps, 2), round_(e1rm_(weight, reps), 2), set.done !== false,
          set.notes || '', ex.notes || '', ex.painNote || '', set.createdAt || '', set.updatedAt || '', set.deletedAt || ''
        ]);
      });
    });
  });
  writeTable_(ss, 'Sets', setRows);

  writeTable_(ss, 'Exercises', [
    ['exerciseId','name','aliases','muscleLegacy','primaryMuscles','secondaryMuscles','equipment','loadMode','unilateral','countBothSides','favorite','archived','doNotRecommend','goalMin','goalMax','increment','notes','sticky','builtIn','createdAt','updatedAt','deletedAt','deviceId']
  ].concat((db.exercises || []).map(function(e) { return [
    e.id || '', e.name || '', list_(e.aliases), e.muscle || '', list_(e.primaryMuscles), list_(e.secondaryMuscles), e.equipment || '', e.loadMode || '', !!e.unilateral, !!e.countBothSides,
    !!e.favorite, !!e.archived, !!e.doNotRecommend, e.goalMin || '', e.goalMax || '', e.increment || '', e.notes || '', e.sticky || '', !!e.builtIn,
    e.createdAt || '', e.updatedAt || '', e.deletedAt || '', e.deviceId || ''
  ]; })));

  const templateRows = [['templateId','templateName','category','timeCap','pinned','exerciseIndex','rowId','exerciseId','target','rest','supersetGroup','targetRPE','targetRIR','exerciseNotes','templateNotes','createdAt','updatedAt','deletedAt']];
  (db.templates || []).forEach(function(t) {
    (t.exercises || []).forEach(function(ex, i) {
      templateRows.push([t.id || '', t.name || '', t.category || '', t.timeCap || '', !!t.pinned, i + 1, ex.id || '', ex.exerciseId || '', ex.target || '', ex.rest || '', ex.groupId || '', ex.targetRpe || '', ex.targetRir || '', ex.notes || '', t.notes || '', t.createdAt || '', t.updatedAt || '', t.deletedAt || '']);
    });
    if (!(t.exercises || []).length) templateRows.push([t.id || '', t.name || '', t.category || '', t.timeCap || '', !!t.pinned, '', '', '', '', '', '', '', '', '', t.notes || '', t.createdAt || '', t.updatedAt || '', t.deletedAt || '']);
  });
  writeTable_(ss, 'Templates', templateRows);

  writeTable_(ss, 'Cardio', [
    ['id','date','type','distanceKm','minutes','paceMinPerKm','avgHR','intensity','notes','createdAt','updatedAt','deletedAt','deviceId']
  ].concat((db.cardio || []).map(function(c) { return [c.id || '', c.date || '', c.type || '', num_(c.distance), num_(c.minutes), pace_(c.distance, c.minutes), c.hr || '', c.intensity || '', c.notes || '', c.createdAt || '', c.updatedAt || '', c.deletedAt || '', c.deviceId || '']; })));

  writeTable_(ss, 'Body', [
    ['id','date','weightKg','sleepHours','energy','soreness','stress','protein','calories','steps','notes','createdAt','updatedAt','deletedAt','deviceId']
  ].concat((db.body || []).map(function(b) { return [b.id || '', b.date || '', b.weight || '', b.sleep || '', b.energy || '', b.soreness || '', b.stress || '', b.protein || '', b.calories || '', b.steps || '', b.notes || '', b.createdAt || '', b.updatedAt || '', b.deletedAt || '', b.deviceId || '']; })));

  writeTable_(ss, 'Goals', [
    ['id','text','done','createdAt','updatedAt','deletedAt','deviceId']
  ].concat((db.goals || []).map(function(g) { return [g.id || '', g.text || '', !!g.done, g.createdAt || '', g.updatedAt || '', g.deletedAt || '', g.deviceId || '']; })));

  const counts = countDb_(db);
  writeTable_(ss, 'SyncLog', [
    ['key','value'],
    ['lastSyncedAt', savedAt],
    ['mode', mode || ''],
    ['backendVersion', BACKEND_VERSION],
    ['schemaVersion', SCHEMA_VERSION],
    ['sentAtFromForge', payload && payload.sentAt || ''],
    ['reason', payload && payload.reason || ''],
    ['app', payload && payload.app || 'Forge Athlete'],
    ['sessions', counts.sessions],
    ['sets', counts.sets],
    ['templates', counts.templates],
    ['exercises', counts.exercises],
    ['cardio', counts.cardio],
    ['body', counts.body],
    ['tombstones', counts.tombstones],
    ['activeBackupSlot', PropertiesService.getDocumentProperties().getProperty(ACTIVE_BACKUP_PROP) || '']
  ]);

  appendSyncHistory_(ss, savedAt, mode, payload, counts);
}

function appendSyncHistory_(ss, savedAt, mode, payload, counts) {
  const sh = ss.getSheetByName('SyncHistory') || ss.insertSheet('SyncHistory');
  if (sh.getLastRow() === 0) sh.appendRow(['syncedAt','mode','reason','deviceId','appVersion','sessions','sets','templates','exercises','tombstones']);
  const deviceId = payload && payload.delta && payload.delta.deviceId || payload && payload.db && payload.db.settings && payload.db.settings.deviceId || '';
  const appVersion = payload && payload.delta && payload.delta.appVersion || payload && payload.db && payload.db._meta && payload.db._meta.appVersion || '';
  sh.appendRow([savedAt, mode || '', payload && payload.reason || '', deviceId, appVersion, counts.sessions, counts.sets, counts.templates, counts.exercises, counts.tombstones]);
  const maxRows = 300;
  if (sh.getLastRow() > maxRows + 1) sh.deleteRows(2, sh.getLastRow() - maxRows - 1);
}

function writeTable_(ss, name, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  if (!rows.length) return;
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, rows[0].length); } catch (ignore) {}
}

function countSets_(session) {
  let n = 0;
  (session.exercises || []).forEach(function(ex) {
    (ex.sets || []).forEach(function(set) {
      if (!set.deletedAt && set.done !== false && (num_(set.weight) || num_(set.reps))) n++;
    });
  });
  return n;
}

function sessionVolume_(session) {
  let total = 0;
  (session.exercises || []).forEach(function(ex) {
    (ex.sets || []).forEach(function(set) {
      if (!set.deletedAt && set.done !== false) total += num_(set.weight) * num_(set.reps);
    });
  });
  return total;
}

function durationMin_(s) {
  const a = new Date(s && s.start || '').getTime(), b = new Date(s && s.end || '').getTime();
  return isFinite(a) && isFinite(b) && b >= a ? Math.round((b - a) / 60000) : '';
}

function e1rm_(weight, reps) { return weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0; }
function pace_(distance, minutes) { const d = num_(distance), m = num_(minutes); return d > 0 && m > 0 ? round_(m / d, 3) : ''; }
function num_(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function round_(v, d) { const p = Math.pow(10, d || 0); return Math.round((v || 0) * p) / p; }
function list_(v) { return Array.isArray(v) ? v.join(', ') : (v || ''); }
function clone_(x) { return JSON.parse(JSON.stringify(x)); }
function errorText_(err) { return String(err && err.stack ? err.stack : err); }

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { const v = b < 0 ? b + 256 : b; return ('0' + v.toString(16)).slice(-2); }).join('');
}

function frameOutput_(pullId, payload) {
  const html = '<!doctype html><html><body><script>' +
    'try{parent.postMessage({source:"forge-pull",pullId:' + JSON.stringify(String(pullId || '')) + ',payload:' + JSON.stringify(payload || {}) + '},"*");}catch(e){}' +
    '</' + 'script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Forge Pull').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    const safe = String(callback).replace(/[^A-Za-z0-9_$\.]/g, '');
    return ContentService.createTextOutput(safe + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
