/* Practice — weekly practice tracker.
   All data lives in localStorage and (optionally) syncs through a small
   Google Apps Script in your Drive, so phone and desktop share one record. */

(function () {
  'use strict';

  var STORE = 'practice-v1';
  var SYNC_STORE = 'practice-sync';
  var CODE_PREFIX = 'PR1.';

  var PALETTE = ['#3F6FD8', '#7B5BD6', '#3E9B67', '#1E9AA8', '#E0952B', '#D6455F', '#5E6E86', '#B0703A'];
  var DEFAULTS = [
    ['standing', 'Standing practice', 5, 0],
    ['meditation', 'Meditation', 7, 1],
    ['legs', 'Legs practice', 3, 2],
    ['spine', 'Spine practice', 3, 3],
    ['coord', 'Coordinations practice', 3, 4],
    ['pt', 'Portuguese', 5, 5],
    ['nasm', 'NASM study', 4, 6]
  ];
  var LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var THEME_COLORS = { light: '#F5F6F8', dark: '#0F1216' };

  var CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.4"/></svg>';
  var MET_SVG = '<svg class="metmark" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.4"/></svg>';
  var CHEV_L = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg>';

  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- state ---------------- */

  function freshState() {
    var habits = {};
    DEFAULTS.forEach(function (d) {
      habits[d[0]] = { name: d[1], target: d[2], color: PALETTE[d[3]], order: d[3], archived: false, t: 1 };
    });
    return { v: 1, habits: habits, checks: {}, settings: { theme: 'system', t: 0 } };
  }

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.habits && s.checks) {
        if (!s.settings) s.settings = { theme: s.theme || 'system', t: 0 };
        delete s.theme;
        return s;
      }
    } catch (e) {}
    return freshState();
  }

  var state = load();
  var sync = (function () {
    try { return JSON.parse(localStorage.getItem(SYNC_STORE)) || {}; } catch (e) { return {}; }
  })();

  function persist(skipSync) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
    if (!skipSync) scheduleSync(1500);
  }
  function saveSync() { try { localStorage.setItem(SYNC_STORE, JSON.stringify(sync)); } catch (e) {} }

  // Field-by-field merge: for every habit and every day×habit cell, the newer
  // edit wins. Nothing is ever lost by merging, so a blank device can't wipe
  // the record, and unchecking still travels (it's a newer edit with v = 0).
  function merge(a, b) {
    var out = { v: 1, habits: {}, checks: {}, settings: (a && a.settings) || { theme: 'system', t: 0 } };
    [a, b].forEach(function (src) {
      if (!src) return;
      if (src.settings && (src.settings.t || 0) > (out.settings.t || 0)) out.settings = src.settings;
      Object.keys(src.habits || {}).forEach(function (id) {
        var h = src.habits[id], cur = out.habits[id];
        if (!cur || (h.t || 0) > (cur.t || 0)) out.habits[id] = h;
      });
      Object.keys(src.checks || {}).forEach(function (day) {
        var row = src.checks[day], dst = out.checks[day] || (out.checks[day] = {});
        Object.keys(row).forEach(function (id) {
          var c = row[id], cur = dst[id];
          if (!cur || (c[1] || 0) > (cur[1] || 0)) dst[id] = c;
        });
      });
    });
    return out;
  }

  /* ---------------- dates ---------------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function weekStart(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function isDone(day, id) {
    var row = state.checks[day];
    return !!(row && row[id] && row[id][0] === 1);
  }
  function setDone(day, id, on) {
    var row = state.checks[day] || (state.checks[day] = {});
    row[id] = [on ? 1 : 0, Date.now()];
    persist();
  }
  function weekCount(id, ws) {
    var n = 0;
    for (var i = 0; i < 7; i++) if (isDone(keyOf(addDays(ws, i)), id)) n++;
    return n;
  }

  function activeHabits() {
    return Object.keys(state.habits)
      .map(function (id) { var h = state.habits[id]; return { id: id, name: h.name, target: h.target, color: h.color, order: h.order, archived: h.archived }; })
      .filter(function (h) { return !h.archived; })
      .sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name); });
  }
  function archivedHabits() {
    return Object.keys(state.habits).filter(function (id) { return state.habits[id].archived; })
      .map(function (id) { return Object.assign({ id: id }, state.habits[id]); });
  }
  function touchHabit(id, fields) {
    var h = state.habits[id];
    Object.keys(fields).forEach(function (k) { h[k] = fields[k]; });
    h.t = Date.now();
    persist();
  }
  function targetText(target) {
    return !target ? 'No target' : target === 7 ? 'Every day' : target + ' a week';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------------- views ---------------- */

  var app = document.getElementById('app');
  var view = null;
  var calMonth = null;      // Date at 1st of shown month
  var calFilter = 'all';

  function route() {
    var h = (location.hash || '').replace('#', '');
    var next = ['today', 'calendar', 'settings'].indexOf(h) >= 0 ? h : 'today';
    var changed = next !== view;
    view = next;
    document.querySelectorAll('[data-go]').forEach(function (b) {
      if (b.getAttribute('data-go') === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (!sheet.hidden) closeSheet(true);
    render();
    if (changed) window.scrollTo(0, 0);
  }

  function render() {
    if (view === 'calendar') renderCalendar();
    else if (view === 'settings') renderSettings();
    else renderToday();
    paintSync();
  }

  function renderToday() {
    var t = today(), tk = keyOf(t), ws = weekStart(t), todayIdx = (t.getDay() + 6) % 7;
    var habits = activeHabits();

    var rows = habits.map(function (h) {
      var count = weekCount(h.id, ws), open = !h.target;
      var met = !open && count >= h.target, on = isDone(tk, h.id);
      var segs = '';
      for (var i = 0; i < 7; i++) {
        var d = addDays(ws, i), dk = keyOf(d), done = isDone(dk, h.id);
        var cls = 'dseg' + (done ? ' on' : '') + (i === todayIdx ? ' today' : '') + (i > todayIdx ? ' future' : '');
        segs += i > todayIdx
          ? '<span class="' + cls + '" aria-hidden="true"><i></i></span>'
          : '<button class="' + cls + '" data-act="seg" data-id="' + h.id + '" data-day="' + dk + '" aria-pressed="' + done + '" aria-label="' + esc(h.name) + ', ' + WEEKDAYS[d.getDay()] + '"><i></i></button>';
      }
      // the whole row toggles today; the day segments handle their own taps
      return '<div class="habit tap' + (on ? ' is-on' : '') + '" style="--hc:' + h.color + '" data-act="check" data-id="' + h.id + '">' +
        '<button class="check" role="checkbox" aria-checked="' + on + '" data-act="check" data-id="' + h.id + '" aria-label="' + esc(h.name) + ' today"><span class="c">' + CHECK_SVG + '</span></button>' +
        '<div class="habit-body"><span class="habit-name">' + esc(h.name) + '</span><span class="bar">' + segs + '</span></div>' +
        '<div class="tally' + (met ? ' met' : '') + '" role="img" aria-label="' + count + (open ? ' this week' : ' of ' + h.target + ' this week') + '"><b>' + count + '</b><span class="of"> / ' + (open ? 'week' : h.target) + '</span>' + (met ? MET_SVG : '') + '</div>' +
        '</div>';
    }).join('');
    var letters = LETTERS.map(function (l, i) { return '<span' + (i === todayIdx ? ' class="is-today"' : '') + '>' + l + '</span>'; }).join('');

    app.innerHTML =
      '<header class="head"><div><h1>' + WEEKDAYS[t.getDay()] + '</h1><div class="sub">' + MONTHS[t.getMonth()] + ' ' + t.getDate() + '</div></div>' +
      '</header>' +
      (habits.length
        ? '<div class="group">' + rows + '</div><div class="barletters" aria-hidden="true"><span></span><span class="bl">' + letters + '</span><span></span></div>'
        : '<div class="group"><div class="row"><span class="label">No practices yet.</span><a class="linkbtn" href="#settings">Add one</a></div></div>');
    markTappable(app);
  }

  // A listener on each row itself tells the browser's touch targeting that the
  // whole row is tappable, so a tap on the name isn't nudged onto a nearby day.
  function noop() {}
  function markTappable(root) {
    root.querySelectorAll('.habit.tap').forEach(function (r) { r.addEventListener('click', noop); });
  }

  function renderCalendar() {
    var t = today();
    if (!calMonth) calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
    var habits = activeHabits();
    if (calFilter !== 'all' && !habits.some(function (h) { return h.id === calFilter; })) calFilter = 'all';

    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var isThisMonth = y === t.getFullYear() && m === t.getMonth();
    var solo = calFilter !== 'all' ? state.habits[calFilter] : null;
    var cells = '';
    for (var i2 = 0; i2 < lead; i2++) cells += '<span class="day out"></span>';
    for (var d2 = 1; d2 <= days; d2++) {
      var date = new Date(y, m, d2), dk2 = keyOf(date), fut = date > t, isToday = dk2 === keyOf(t);
      var label = WEEKDAYS[date.getDay()] + ', ' + MONTHS[m] + ' ' + d2;
      if (solo) {
        var hit = isDone(dk2, calFilter);
        cells += '<button class="day solo' + (hit ? ' hit' : '') + (isToday ? ' today' : '') + '" style="--hc:' + solo.color + '" data-act="day" data-day="' + dk2 + '"' + (fut ? ' disabled' : '') + ' aria-label="' + label + (hit ? ', done' : '') + '"><span class="n">' + d2 + '</span></button>';
      } else {
        var pips = '', n = 0;
        habits.forEach(function (h) { if (isDone(dk2, h.id)) { pips += '<i style="--hc:' + h.color + '"></i>'; n++; } });
        cells += '<button class="day' + (isToday ? ' today' : '') + '" data-act="day" data-day="' + dk2 + '"' + (fut ? ' disabled' : '') + ' aria-label="' + label + ', ' + n + ' done"><span class="n">' + d2 + '</span><span class="pips">' + pips + '</span></button>';
      }
    }
    var chips = '<button class="chip" data-act="filter" data-id="all" aria-pressed="' + (calFilter === 'all') + '">All</button>' +
      habits.map(function (h) {
        return '<button class="chip" style="--hc:' + h.color + '" data-act="filter" data-id="' + h.id + '" aria-pressed="' + (calFilter === h.id) + '"><i></i>' + esc(h.name) + '</button>';
      }).join('');
    var monthPrefix = y + '-' + pad(m + 1) + '-';
    var monthDays = Object.keys(state.checks).filter(function (k) { return k.indexOf(monthPrefix) === 0; });
    var totals = habits.map(function (h) {
      var total = 0;
      monthDays.forEach(function (k) { if (isDone(k, h.id)) total++; });
      return '<div class="stat" style="--hc:' + h.color + '"><i></i><span>' + esc(h.name) + '</span>' +
        '<span class="num"><b>' + total + '</b> ' + (total === 1 ? 'day' : 'days') + '</span></div>';
    }).join('');

    var chipScroll = app.querySelector('.chips');
    chipScroll = chipScroll && view === 'calendar' ? chipScroll.scrollLeft : 0;

    app.innerHTML =
      '<header class="head"><div><h1>Calendar</h1></div></header>' +
      '<section class="cal-sect"><div class="sectbar"><div><h2>' + MONTHS[m] + ' <span class="yr">' + y + '</span></h2></div><div class="navbtns">' +
      (isThisMonth ? '' : '<button class="linkbtn navtoday" data-act="month" data-dir="0">Today</button>') +
      '<button class="iconbtn" data-act="month" data-dir="-1" aria-label="Previous month">' + CHEV_L + '</button>' +
      '<button class="iconbtn" data-act="month" data-dir="1" aria-label="Next month"' + (isThisMonth ? ' disabled' : '') + '>' + CHEV_R + '</button></div></div>' +
      '<div class="chips" role="group" aria-label="Show">' + chips + '</div>' +
      '<div class="group cal"><div class="cal-head" aria-hidden="true">' + LETTERS.map(function (l) { return '<span>' + l + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + cells + '</div></div>' +
      '<div class="stats"><div class="secthead"><span>Days in ' + MONTHS[m] + '</span></div><div class="group">' + totals + '</div></div></section>';

    var chipsEl = app.querySelector('.chips');
    if (chipsEl && chipScroll) chipsEl.scrollLeft = chipScroll;
  }

  function renderSettings() {
    var habits = activeHabits();
    var rows = habits.map(function (h) {
      return '<button class="row hab rowlink" style="--hc:' + h.color + '" data-act="menu" data-id="' + h.id + '">' +
        '<span class="swatch"></span><span class="label">' + esc(h.name) + '</span>' +
        '<span class="value">' + targetText(h.target) + '</span>' + CHEV_R + '</button>';
    }).join('');

    var archived = archivedHabits();
    var archivedHtml = archived.length
      ? '<div class="set-section archived-list"><div class="secthead"><span>Archived</span></div><div class="group">' +
        archived.map(function (h) {
          return '<div class="row hab" style="--hc:' + h.color + '"><span class="swatch"></span><span class="label">' + esc(h.name) + '</span><button class="linkbtn" data-act="restore" data-id="' + h.id + '">Restore</button></div>';
        }).join('') + '</div></div>'
      : '';

    var th = state.settings.theme || 'system';
    var seg = ['system', 'light', 'dark'].map(function (v) {
      return '<button data-act="theme" data-v="' + v + '" aria-pressed="' + (th === v) + '">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
    }).join('');

    var draft = document.getElementById('codeIn');
    draft = draft ? draft.value : '';

    var syncHtml = sync.url
      ? '<div class="row"><span class="syncdot" id="syncDot"></span><span class="label" id="syncText"></span><button class="btn quiet" data-act="syncnow">Sync now</button></div>' +
        '<div class="row"><button class="rowbtn danger" data-act="disconnect">Disconnect this device</button></div>'
      : '<div class="row"><input class="codein" id="codeIn" placeholder="Paste your sync code" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" value="' + esc(draft) + '"><button class="btn" data-act="connect">Connect</button></div>';

    app.innerHTML =
      '<header class="head"><div><h1>Settings</h1></div></header>' +
      '<div class="set-section"><div class="secthead"><span>Practices</span></div><div class="group">' + rows +
      '<div class="row"><button class="rowbtn" data-act="add">Add practice</button></div></div></div>' +
      archivedHtml +
      '<div class="set-section"><div class="secthead"><span>Sync with Google Drive</span></div><div class="group">' + syncHtml + '</div>' +
      '<p class="note">' + (sync.url ? 'Changes sync a moment after you make them, and whenever the app opens.' : 'Paste the code from your Practice Sync script once on each device. Your phone and computer will then share one record.') + '</p></div>' +
      '<div class="set-section"><div class="secthead"><span>Appearance</span></div><div class="group"><div class="row"><span class="label">Theme</span><div class="seg">' + seg + '</div></div></div></div>' +
      '<div class="set-section"><div class="secthead"><span>Backup</span></div><div class="group">' +
      '<div class="row"><button class="rowbtn" data-act="export">Export backup</button></div>' +
      '<div class="row"><button class="rowbtn" data-act="import">Import backup</button><input type="file" id="importIn" accept="application/json,.json" hidden></div></div>' +
      '<p class="note">Importing adds a backup into what\'s here. It never erases days you\'ve logged.</p></div>';
  }

  /* ---------------- sheet ---------------- */

  var sheet = document.getElementById('sheet');
  var sheetDay = null;
  var returnFocus = null;   // selector for the control that opened the sheet
  var closingTimer = null;

  function selectorFor(el) {
    if (!el || !el.getAttribute || !el.getAttribute('data-act')) return null;
    var s = '[data-act="' + el.getAttribute('data-act') + '"]';
    ['data-id', 'data-day', 'data-dir', 'data-c', 'data-v'].forEach(function (a) {
      if (el.hasAttribute(a)) s += '[' + a + '="' + el.getAttribute(a) + '"]';
    });
    return s;
  }

  // keepPlace: swap the open sheet's content without replaying its entrance
  function openSheet(html, keepPlace) {
    clearTimeout(closingTimer);
    sheet.classList.remove('closing');
    var open = !sheet.hidden && sheet.firstChild;
    if (keepPlace && open) {
      var scroll = open.scrollTop;
      open.innerHTML = '<div class="grab"></div>' + html;
      open.scrollTop = scroll;
      labelSheet(open);
      return;
    }
    if (!open) returnFocus = selectorFor(document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-act]') : null);
    sheet.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab"></div>' + html + '</div>';
    labelSheet(sheet.firstChild);
    markTappable(sheet);
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    sheet.firstChild.focus({ preventScroll: true });
  }
  function labelSheet(el) {
    var h = el.querySelector('h2');
    if (h) { h.id = 'sheetTitle'; el.setAttribute('aria-labelledby', 'sheetTitle'); }
  }
  function closeSheet(instant) {
    if (sheet.hidden || sheet.classList.contains('closing')) return;
    var finish = function () {
      clearTimeout(closingTimer);
      sheet.classList.remove('closing');
      sheet.hidden = true; sheet.innerHTML = ''; sheetDay = null;
      document.body.classList.remove('sheet-open');
      render();
      var back = returnFocus && app.querySelector(returnFocus);
      if (back) back.focus({ preventScroll: true });
      returnFocus = null;
    };
    if (instant === true || reduceMotion) { finish(); return; }
    sheet.classList.add('closing');
    closingTimer = setTimeout(finish, 200);
  }

  function dayRowsHtml(dk) {
    return activeHabits().map(function (h) {
      var on = isDone(dk, h.id);
      return '<div class="habit tap' + (on ? ' is-on' : '') + '" style="--hc:' + h.color + '" data-act="sheetcheck" data-id="' + h.id + '">' +
        '<button class="check" role="checkbox" aria-checked="' + on + '" data-act="sheetcheck" data-id="' + h.id + '" aria-label="' + esc(h.name) + '"><span class="c">' + CHECK_SVG + '</span></button>' +
        '<div class="habit-body"><span class="habit-name">' + esc(h.name) + '</span></div><span></span></div>';
    }).join('');
  }
  function openDay(dk) {
    sheetDay = dk;
    var d = fromKey(dk);
    openSheet('<div class="sheet-top"><h2>' + WEEKDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + '</h2><button class="linkbtn" data-act="close">Done</button></div>' +
      '<div class="group">' + dayRowsHtml(dk) + '</div>');
  }

  function menuHtml(id) {
    var h = state.habits[id];
    var list = activeHabits(), idx = list.findIndex(function (x) { return x.id === id; });
    var pal = PALETTE.map(function (c) {
      return '<button style="--hc:' + c + '" data-act="color" data-id="' + id + '" data-c="' + c + '" aria-pressed="' + (h.color === c) + '" aria-label="Color ' + c + '"></button>';
    }).join('');
    return '<div class="sheet-top"><h2>Practice</h2><button class="linkbtn" data-act="close">Done</button></div>' +
      '<div class="set-section"><div class="group">' +
      '<div class="row" style="--hc:' + h.color + '"><span class="swatch"></span><input class="namein" value="' + esc(h.name) + '" data-act="rename" data-id="' + id + '" aria-label="Practice name" enterkeyhint="done" autocomplete="off"></div>' +
      '<div class="row"><span class="label">Weekly target</span><div class="stepper" role="group" aria-label="Weekly target">' +
      '<button data-act="target" data-id="' + id + '" data-dir="-1" aria-label="Fewer days"' + (!h.target ? ' disabled' : '') + '>−</button>' +
      '<span aria-live="polite">' + (h.target ? h.target : 'None') + '</span>' +
      '<button data-act="target" data-id="' + id + '" data-dir="1" aria-label="More days"' + (h.target >= 7 ? ' disabled' : '') + '>+</button></div></div>' +
      '</div></div>' +
      '<div class="set-section"><div class="secthead"><span>Color</span></div><div class="group"><div class="palette">' + pal + '</div></div></div>' +
      '<div class="group">' +
      (idx > 0 ? '<div class="row"><button class="rowbtn" data-act="move" data-id="' + id + '" data-dir="-1">Move up</button></div>' : '') +
      (idx < list.length - 1 ? '<div class="row"><button class="rowbtn" data-act="move" data-id="' + id + '" data-dir="1">Move down</button></div>' : '') +
      '<div class="row"><button class="rowbtn danger" data-act="archive" data-id="' + id + '">Archive</button></div></div>' +
      '<p class="note">Archiving hides a practice and keeps its history. You can restore it here in Settings.</p>';
  }
  function openMenu(id) { openSheet(menuHtml(id)); }
  function refreshMenu(id) {
    // re-render the open sheet in place, keeping focus on the same control
    var sel = selectorFor(document.activeElement);
    openSheet(menuHtml(id), true);
    var el = sel && sheet.querySelector(sel);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  // swipe a sheet down to dismiss it, like iOS
  (function () {
    var startY = 0, dy = 0, dragging = false, el = null, t0 = 0;
    sheet.addEventListener('touchstart', function (e) {
      el = e.target.closest('.sheet');
      if (!el || e.touches.length !== 1 || e.target.closest('input') || el.scrollTop > 0) { el = null; return; }
      startY = e.touches[0].clientY; dy = 0; dragging = false; t0 = Date.now();
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (!el) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging && dy > 8) { dragging = true; el.style.transition = 'none'; }
      if (dragging) {
        e.preventDefault();
        el.style.transform = 'translateY(' + Math.max(0, dy - 8) + 'px)';
      } else if (dy < -4) el = null;   // scrolling up inside the sheet
    }, { passive: false });
    sheet.addEventListener('touchend', function () {
      if (!el) return;
      var s = el; el = null;
      if (!dragging) return;
      var fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      s.style.transition = '';
      if (dy > 110 || (fast && dy > 30)) {
        s.style.transform = 'translateY(100%)';
        closeSheet(true);
      } else s.style.transform = '';
    });
  })();

  /* ---------------- actions ---------------- */

  function pop(el) {
    if (!el) return;
    el.classList.remove('pop', 'flash'); void el.offsetWidth;
    el.classList.add(el.classList.contains('dseg') ? 'flash' : 'pop');
  }

  function handle(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');

    if (act === 'check') {
      if (el.classList.contains('habit') && e.target.closest('.bar')) return;   // a near-miss between day segments
      var dk = keyOf(today()), on = !isDone(dk, id);
      setDone(dk, id, on);
      render();
      var sel = '.check[data-id="' + id + '"]';
      if (on) {
        pop(app.querySelector(sel));
        pop(app.querySelector('[data-act="seg"][data-id="' + id + '"][data-day="' + dk + '"]'));
      }
      var fresh = app.querySelector(sel); if (fresh) fresh.focus({ preventScroll: true });
      return;
    }
    if (act === 'sheetcheck') {
      if (!sheetDay) return;
      var on2 = !isDone(sheetDay, id);
      setDone(sheetDay, id, on2);
      var row = el.closest('.habit'), box = row.querySelector('.check');
      box.setAttribute('aria-checked', on2);
      row.classList.toggle('is-on', on2);
      if (on2) pop(box);
      return;
    }
    if (act === 'day') { openDay(el.getAttribute('data-day')); return; }
    if (act === 'seg') {
      var gd = el.getAttribute('data-day'), on5 = !isDone(gd, id);
      setDone(gd, id, on5); render();
      var g2 = app.querySelector('[data-act="seg"][data-id="' + id + '"][data-day="' + gd + '"]');
      if (g2) { g2.focus({ preventScroll: true }); if (on5) pop(g2); }
      if (on5 && gd === keyOf(today())) pop(app.querySelector('.check[data-id="' + id + '"]'));
      return;
    }
    if (act === 'close') { closeSheet(); return; }
    if (act === 'filter') {
      calFilter = id; render();
      var chip = app.querySelector('[data-act="filter"][data-id="' + id + '"]');
      if (chip) { chip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); chip.focus({ preventScroll: true }); }
      return;
    }
    if (act === 'month') {
      var dir = +el.getAttribute('data-dir'), t = today();
      calMonth = dir === 0 ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(calMonth.getFullYear(), calMonth.getMonth() + dir, 1);
      render();
      var back = app.querySelector(dir === 0 ? '[data-act="month"][data-dir="-1"]' : '[data-act="month"][data-dir="' + dir + '"]');
      if (back && !back.disabled) back.focus({ preventScroll: true });
      return;
    }
    if (act === 'target') {
      var h = state.habits[id];
      touchHabit(id, { target: Math.max(0, Math.min(7, (h.target || 0) + +el.getAttribute('data-dir'))) });
      refreshMenu(id); return;
    }
    if (act === 'menu') { openMenu(id); return; }
    if (act === 'color') { touchHabit(id, { color: el.getAttribute('data-c') }); refreshMenu(id); return; }
    if (act === 'move') {
      var list = activeHabits(), i = list.findIndex(function (x) { return x.id === id; }), j = i + +el.getAttribute('data-dir');
      if (j < 0 || j >= list.length) return;
      list.splice(j, 0, list.splice(i, 1)[0]);
      var now = Date.now();
      list.forEach(function (x, k) { if (state.habits[x.id].order !== k) { state.habits[x.id].order = k; state.habits[x.id].t = now; } });
      persist(); refreshMenu(id);
      // if the button vanished (moved to the top or bottom), keep focus in the sheet
      if (!sheet.contains(document.activeElement) || document.activeElement === document.body) {
        var alt = sheet.querySelector('[data-act="move"]'); if (alt) alt.focus({ preventScroll: true });
      }
      return;
    }
    if (act === 'archive') {
      touchHabit(id, { archived: true }); closeSheet();
      toast('Archived', 'Undo', function () { touchHabit(id, { archived: false }); render(); });
      return;
    }
    if (act === 'restore') { touchHabit(id, { archived: false, order: activeHabits().length }); render(); toast('Restored'); return; }
    if (act === 'add') {
      var nid = 'h' + Date.now().toString(36);
      var used = activeHabits().map(function (x) { return x.color; });
      var color = PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || PALETTE[activeHabits().length % PALETTE.length];
      state.habits[nid] = { name: 'New practice', target: 3, color: color, order: activeHabits().length, archived: false, t: Date.now() };
      persist(); render(); openMenu(nid);
      var inp = sheet.querySelector('[data-act="rename"]');
      if (inp) { inp.focus(); inp.select(); }
      return;
    }
    if (act === 'theme') {
      state.settings = { theme: el.getAttribute('data-v'), t: Date.now() };
      applyTheme(); persist(); render();
      var tb = app.querySelector('[data-act="theme"][data-v="' + state.settings.theme + '"]'); if (tb) tb.focus({ preventScroll: true });
      return;
    }
    if (act === 'connect') { connect(document.getElementById('codeIn').value); return; }
    if (act === 'syncnow') { runSync(true); return; }
    if (act === 'disconnect') {
      openSheet('<div class="sheet-top"><h2>Stop syncing?</h2><button class="linkbtn" data-act="close">Cancel</button></div>' +
        '<p class="note" style="margin:0 4px 16px">This device stops sharing with Drive. Your log stays here and in Drive, and you can reconnect with the same code.</p>' +
        '<div class="group"><div class="row"><button class="rowbtn danger" data-act="disconnect-yes">Disconnect this device</button></div></div>');
      return;
    }
    if (act === 'disconnect-yes') { sync = {}; saveSync(); closeSheet(); toast('Disconnected'); return; }
    if (act === 'export') { exportBackup(); return; }
    if (act === 'import') { document.getElementById('importIn').click(); return; }
  }

  function onRename(e) {
    var el = e.target;
    if (el.getAttribute('data-act') !== 'rename') return;
    var name = el.value.trim();
    var id = el.getAttribute('data-id');
    if (!name) { el.value = state.habits[id].name; return; }
    if (name !== state.habits[id].name) touchHabit(id, { name: name });
  }

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    // keep the browser / status-bar tint in step with a chosen theme
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      var own = /dark/.test(m.getAttribute('media') || '') ? 'dark' : 'light';
      m.setAttribute('content', THEME_COLORS[t === 'light' || t === 'dark' ? t : own]);
    });
  }

  var toastTimer, toastAction = null;
  var toastEl = document.getElementById('toast');
  function toast(msg, actionLabel, fn) {
    toastEl.innerHTML = '';
    toastEl.appendChild(document.createTextNode(msg));
    toastAction = fn || null;
    if (actionLabel && fn) {
      var b = document.createElement('button');
      b.className = 'toast-act'; b.textContent = actionLabel;
      toastEl.appendChild(b);
    }
    toastEl.classList.toggle('has-act', !!toastAction);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); toastAction = null; }, toastAction ? 4000 : 1800);
  }
  toastEl.addEventListener('click', function (e) {
    if (!e.target.closest('.toast-act') || !toastAction) return;
    var fn = toastAction; toastAction = null;
    toastEl.classList.remove('show'); clearTimeout(toastTimer);
    fn();
  });

  function exportBackup() {
    var json = JSON.stringify({ app: 'practice', exportedAt: new Date().toISOString(), habits: state.habits, checks: state.checks, settings: state.settings }, null, 1);
    var name = 'practice-' + keyOf(today()) + '.json';
    // On iPhone a plain download is awkward (worse in the home-screen app), so use the share sheet: Save to Files, AirDrop, etc.
    try {
      var file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && matchMedia('(pointer: coarse)').matches && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch(function () {});
        return;
      }
    } catch (e) {}
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function importBackup(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var b = JSON.parse(r.result);
        if (!b || !b.habits || !b.checks) throw new Error('shape');
        state = merge(state, b); applyTheme(); persist(); render(); toast('Backup imported');
      } catch (e) { toast('That file isn\'t a Practice backup'); }
    };
    r.readAsText(file);
  }

  /* ---------------- sync ---------------- */

  var syncing = false, again = false, againLoud = false, syncTimer = null;

  function connect(code) {
    var cfg = null;
    try { cfg = JSON.parse(atob(String(code || '').replace(/\s+/g, '').replace(CODE_PREFIX, ''))); } catch (e) {}
    if (!cfg || !cfg.u || !cfg.k) { toast('That code doesn\'t look right'); return; }
    sync = { url: cfg.u, key: cfg.k, last: 0, err: '' };
    if (document.activeElement) document.activeElement.blur();
    saveSync(); render(); runSync(true);
  }

  function scheduleSync(ms) {
    if (!sync.url) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncTimer = null; runSync(false); }, ms || 0);
  }

  function runSync(loud, leaving) {
    if (!sync.url) return;
    if (syncing) { again = true; againLoud = againLoud || !!loud; return; }
    syncing = true; paintSync('Syncing…');
    var body = JSON.stringify({ key: sync.key, habits: state.habits, checks: state.checks, settings: state.settings });
    fetch(sync.url, {
      method: 'POST', cache: 'no-store', redirect: 'follow',
      keepalive: !!leaving && body.length < 60000,          // lets the upload finish as the app goes to the background
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // keeps it a simple request; Apps Script can't answer a preflight
      body: body
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error(j && j.error === 'bad-key' ? 'Sync code was rejected' : 'Sync script error');
        var before = JSON.stringify(state);
        state = merge(state, j.state);
        var changed = JSON.stringify(state) !== before;
        if (changed) { applyTheme(); persist(true); }
        sync.last = Date.now(); sync.err = '';
        if (loud) toast('Synced');
        return changed;
      })
      .catch(function (err) {
        sync.err = navigator.onLine === false ? 'Offline. Will sync when you\'re back online.' : (err && err.message && err.message.indexOf('Sync') === 0 ? err.message : 'Couldn\'t reach Drive. Will retry.');
        if (loud) toast('Sync failed');
        return false;
      })
      .then(function (changed) {
        syncing = false; saveSync();
        // only redraw when Drive brought something new, so a sync never interrupts what you're doing
        var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
        if (changed && sheet.hidden && !typing) render(); else paintSync();
        if (again) { var l = againLoud; again = againLoud = false; clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncTimer = null; runSync(l); }, 300); }
      });
  }

  function ago(t) {
    if (!t) return 'not yet';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    var d = new Date(t); return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
  }
  function paintSync(busy) {
    var text = !sync.url ? 'Not syncing' : busy || sync.err || ('Synced ' + ago(sync.last));
    var side = document.getElementById('sideSync'); if (side) side.textContent = text;
    var dot = document.getElementById('syncDot'), st = document.getElementById('syncText');
    if (st) st.textContent = text;
    if (dot) dot.className = 'syncdot' + (busy ? ' busy' : sync.err ? ' bad' : sync.last ? ' ok' : '');
  }

  /* ---------------- boot ---------------- */

  applyTheme();
  app.addEventListener('click', handle);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); else handle(e); });
  sheet.addEventListener('change', onRename);
  sheet.addEventListener('input', function (e) {   // keep the name live so Done never loses it
    if (e.target.getAttribute('data-act') === 'rename' && e.target.value.trim()) {
      var id = e.target.getAttribute('data-id'); state.habits[id].name = e.target.value.trim(); state.habits[id].t = Date.now(); persist();
    }
  });
  sheet.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.getAttribute('data-act') === 'rename') e.target.blur();
    if (e.key === 'Tab') {   // keep keyboard focus inside the open sheet
      var f = sheet.querySelectorAll('button:not([disabled]), input');
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || document.activeElement === sheet.firstChild)) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'importIn' && e.target.files[0]) importBackup(e.target.files[0]);
    else onRename(e);
  });
  app.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'codeIn') connect(e.target.value);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var go = b.getAttribute('data-go');
      if (go === view) {   // tapping the tab you're on scrolls back to the top
        if (go === 'calendar' && calMonth) { var t = today(); calMonth = new Date(t.getFullYear(), t.getMonth(), 1); render(); }
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else location.hash = go;
    });
  });
  window.addEventListener('hashchange', route);
  // lets :active press states show on iPhone
  document.addEventListener('touchstart', function () {}, { passive: true });

  var shownDay = keyOf(today());
  function checkDay() {
    if (keyOf(today()) !== shownDay) {
      shownDay = keyOf(today());
      if (sheet.hidden) render();
      return true;
    }
    return false;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      checkDay();
      scheduleSync(0);
    } else if (syncTimer) {   // a change is still waiting to upload — send it before iOS freezes the app
      clearTimeout(syncTimer); syncTimer = null;
      runSync(false, true);
    }
  });
  window.addEventListener('online', function () { scheduleSync(0); });
  setInterval(function () { if (!checkDay()) paintSync(); }, 60000);

  route();
  scheduleSync(0);

  // exposed for tests
  window.__practice = { merge: merge, state: function () { return state; } };
})();
