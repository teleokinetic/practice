/* Practice Sync — keeps the Practice app's record in your Google Drive so
   your phone and computer share it.

   Each device sends its whole record here. The script merges it with what's
   in Drive (for every practice and every day, the newest edit wins), saves
   the result, and sends it back. Merging never drops a logged day, so a new
   or wiped device can't erase the record.

   Drive layout:
     Practice Sync/latest.json              ← the shared record
     Practice Sync/history/YYYY-MM-DD.json  ← one copy per day, for safety
     Practice Sync/Sync code.txt            ← the code you paste into the app

   Setup (once): see sync/README.md. */

const WEB_APP_URL = '';   // ← paste the Web app URL (ends in /exec) here, then run setup() again

const FOLDER_NAME = 'Practice Sync';
const TZ = 'America/Denver';

/* ------------------------------ endpoints ------------------------------ */

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad-json' }); }
  if (!keyOk(body && body.key)) return json({ ok: false, error: 'bad-key' });
  if (!body.habits || typeof body.habits !== 'object' || !body.checks || typeof body.checks !== 'object') {
    return json({ ok: false, error: 'bad-state' });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json({ ok: false, error: 'busy' });
  try {
    const folder = rootFolder();
    const stored = readJson(folder, 'latest.json') || { habits: {}, checks: {} };
    const merged = merge(stored, { habits: body.habits, checks: body.checks, settings: body.settings });
    const text = JSON.stringify({ app: 'practice', savedAt: new Date().toISOString(), habits: merged.habits, checks: merged.checks, settings: merged.settings });
    writeText(folder, 'latest.json', text);
    writeText(subFolder(folder, 'history'), Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.json', text);
    return json({ ok: true, state: merged });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the URL in a browser just confirms the deployment works. No data is shown.
function doGet() {
  return ContentService.createTextOutput('Practice Sync is running.');
}

/* -------------------------------- merge -------------------------------- */

// Same rule as the app: newest edit wins, per practice, per day×practice, and for settings.
function merge(a, b) {
  const out = { habits: {}, checks: {}, settings: { theme: 'system', t: 0 } };
  [a, b].forEach(function (src) {
    if (src.settings && typeof src.settings === 'object' && (src.settings.t || 0) > (out.settings.t || 0)) out.settings = src.settings;
    Object.keys(src.habits || {}).forEach(function (id) {
      const h = src.habits[id], cur = out.habits[id];
      if (h && typeof h === 'object' && (!cur || (h.t || 0) > (cur.t || 0))) out.habits[id] = h;
    });
    Object.keys(src.checks || {}).forEach(function (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const row = src.checks[day] || {}, dst = out.checks[day] || (out.checks[day] = {});
      Object.keys(row).forEach(function (id) {
        const c = row[id], cur = dst[id];
        if (Array.isArray(c) && (!cur || (c[1] || 0) > (cur[1] || 0))) dst[id] = [c[0] ? 1 : 0, c[1] || 0];
      });
    });
  });
  return out;
}

/* -------------------------------- setup -------------------------------- */

// Run once before deploying, and once more after pasting WEB_APP_URL above.
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('key')) props.setProperty('key', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  const folder = rootFolder();
  if (!WEB_APP_URL) {
    console.log('Folder and key are ready. Now Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). Paste its /exec URL into WEB_APP_URL at the top, then run setup() again.');
    return;
  }
  const code = 'PR1.' + Utilities.base64Encode(JSON.stringify({ u: WEB_APP_URL, k: props.getProperty('key') }));
  writeText(folder, 'Sync code.txt', code);
  console.log('Your sync code (also saved to Practice Sync/Sync code.txt). Paste it into Practice → Settings on each device:\n\n' + code);
}

// Run only if your sync code ever leaks. Old codes stop working; run setup() for a new one.
function resetKey() {
  PropertiesService.getScriptProperties().deleteProperty('key');
  setup();
}

/* ------------------------------- helpers ------------------------------- */

function keyOk(key) {
  const want = PropertiesService.getScriptProperties().getProperty('key');
  return !!want && typeof key === 'string' && key === want;
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function rootFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function subFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function readJson(folder, name) {
  const it = folder.getFilesByName(name);
  if (!it.hasNext()) return null;
  try { return JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { return null; }
}
function writeText(folder, name, text) {
  const it = folder.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(name, text, 'application/json');
}
