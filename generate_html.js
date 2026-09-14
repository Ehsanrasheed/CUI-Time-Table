/**
 * generate_html.js
 * Reads both scraped JSON files and produces a fully self-contained index.html.
 * No server needed – just open index.html in any browser.
 *
 * Usage:  node generate_html.js
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const facultyData = JSON.parse(fs.readFileSync(path.join(__dirname, "cui_timetables.json"),       "utf8"));
const classData   = JSON.parse(fs.readFileSync(path.join(__dirname, "cui_class_timetables.json"), "utf8"));

const SLOT_TIMES = [
  "08:30","09:00","09:30","10:00","10:30","11:00",
  "11:30","12:00","12:30","13:00","13:30","14:00",
  "14:30","15:00","15:30","16:00","16:30","17:00",
  "17:30","18:00","18:30","19:00","19:30","20:00",
];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CUI Lahore – Timetable Viewer</title>
<style>
/* ── Reset ────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: Arial, Helvetica, sans-serif;
  background: #f1f5f9; color: #0f172a;
  display: flex; flex-direction: column;
  height: 100dvh; overflow: hidden;
}

/* ── Masthead ─────────────────────────────────────────────── */
.masthead {
  background: linear-gradient(100deg,#064e3b 0%,#065f46 45%,#047857 100%);
  color: #fff; padding: 10px 16px; flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
}
.mh-mark {
  width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
  background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.28);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: .78rem;
}
.mh-name { line-height: 1.2; margin-right: auto; min-width: 0; }
.mh-uni  { font-weight: 700; font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mh-campus { font-size: .68rem; color: #a7f3d0; letter-spacing: .4px; text-transform: uppercase; }
.badge {
  background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25);
  border-radius: 999px; padding: 3px 10px; font-size: .72rem; font-weight: 600;
  white-space: nowrap; flex-shrink: 0;
}

/* ── Toggle bar ───────────────────────────────────────────── */
.toggle-bar {
  background: #fff; border-bottom: 1px solid #e2e8f0;
  padding: 8px 14px; display: flex; align-items: center;
  gap: 12px; flex-shrink: 0; flex-wrap: wrap;
}
.seg { display: inline-flex; background: #f1f5f9; border-radius: 8px; padding: 3px; }
.seg button {
  padding: 6px 18px; border-radius: 6px; font-size: .82rem; font-weight: 600;
  color: #475569; background: transparent; border: none; cursor: pointer; transition: all .15s;
}
.seg button.on { background: #047857; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.seg button:not(.on):hover { color: #0f172a; }
#modeLabel { font-size: .74rem; color: #64748b; flex: 1; min-width: 0; }

/* ── Mobile sidebar toggle button ────────────────────────── */
.sidebar-toggle {
  display: none; background: #f1f5f9; border: 1px solid #e2e8f0;
  border-radius: 7px; padding: 6px 10px; cursor: pointer;
  font-size: .8rem; font-weight: 600; color: #475569;
  flex-shrink: 0; white-space: nowrap;
}

/* ── Layout ───────────────────────────────────────────────── */
.layout { display: flex; flex: 1; overflow: hidden; min-height: 0; }

/* ── Sidebar ──────────────────────────────────────────────── */
.sidebar {
  width: 270px; flex-shrink: 0; background: #fff;
  border-right: 1px solid #e2e8f0;
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform .25s ease;
}
.sidebar-controls { padding: 10px; border-bottom: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 7px; }
.sidebar-controls label { font-size: .66rem; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #64748b; margin-bottom: 1px; display: block; }
.sidebar-controls select,
.sidebar-controls input {
  width: 100%; border: 1px solid #cbd5e1; border-radius: 7px;
  padding: 7px 9px; font-size: .82rem; color: #0f172a; background: #fff; outline: none;
}
.sidebar-controls select:focus,
.sidebar-controls input:focus { border-color: #047857; box-shadow: 0 0 0 3px rgba(4,120,87,.12); }
.list-count { padding: 5px 12px; font-size: .7rem; color: #94a3b8; border-bottom: 1px solid #f1f5f9; background: #fafafa; }
.list-wrap { flex: 1; overflow-y: auto; }
.list-item {
  padding: 8px 12px; font-size: .81rem; cursor: pointer;
  border-bottom: 1px solid #f8fafc; transition: background .1s;
  display: flex; flex-direction: column; gap: 2px;
}
.list-item:hover { background: #f0fdf4; }
.list-item.active { background: #ecfdf5; color: #065f46; font-weight: 600; }
.li-sub { font-size: .7rem; color: #94a3b8; font-weight: 400; }
.list-item.active .li-sub { color: #047857; }

/* ── Main panel ───────────────────────────────────────────── */
.main { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 0; min-width: 0; }

/* ── Sticky search bar ────────────────────────────────────── */
.main-search-bar {
  position: sticky; top: -16px; z-index: 10;
  background: #f1f5f9;
  margin: -16px -16px 14px -16px;
  padding: 10px 16px; border-bottom: 1px solid #e2e8f0;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.main-search-bar input {
  flex: 1; min-width: 160px;
  border: 1px solid #cbd5e1; border-radius: 8px;
  padding: 8px 13px; font-size: .84rem; color: #0f172a;
  background: #fff; outline: none;
}
.main-search-bar input:focus { border-color: #047857; box-shadow: 0 0 0 3px rgba(4,120,87,.12); }
.ms-count { font-size: .76rem; color: #64748b; white-space: nowrap; }

/* ── Timetable block ──────────────────────────────────────── */
.tt-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 4px; }
.tt-divider { border: none; border-top: 2px dashed #e2e8f0; margin: 14px 0; }
.tt-header { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.tt-header h2 { font-size: .95rem; font-weight: 700; color: #064e3b; }
.tt-header p  { font-size: .74rem; color: #64748b; margin-top: 2px; }

.focus-btn {
  background: #f0fdf4; color: #065f46; border: 1px solid #bbf7d0;
  border-radius: 6px; padding: 4px 11px; font-size: .76rem; font-weight: 600;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.focus-btn:hover { background: #dcfce7; }
.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 6px 14px; font-size: .81rem; font-weight: 600;
  cursor: pointer; margin-bottom: 14px;
}
.back-btn:hover { background: #e2e8f0; }

/* ── Grid ─────────────────────────────────────────────────── */
.grid-scroller { overflow-x: auto; border-radius: 7px; border: 1px solid #e2e8f0; -webkit-overflow-scrolling: touch; }
.grid-table { border-collapse: collapse; min-width: 820px; width: 100%; table-layout: fixed; background: #fff; }
.grid-table th, .grid-table td { border: 1px solid #e2e8f0; }
.col-day { width: 38px; font-size: .75rem; font-weight: 700; text-align: center; background: #f8fafc; color: #334155; border-right: 2px solid #cbd5e1 !important; }
.col-slot { font-size: .62rem; text-align: center; font-weight: 600; color: #64748b; background: #f8fafc; padding: 3px 1px; min-width: 34px; }
.col-time { font-size: .54rem; text-align: center; color: #94a3b8; background: #f8fafc; padding: 2px 1px; }
.grid-table tbody tr { height: 62px; }
td.occupied { padding: 0; position: relative; vertical-align: top; }
.blk {
  position: absolute; inset: 2px; border-radius: 4px; border-left: 4px solid;
  padding: 3px 5px; overflow: hidden;
  display: flex; flex-direction: column; gap: 1px; font-size: .66rem; line-height: 1.2;
}
.b-code { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .68rem; }
.b-mid  { color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .62rem; }
.b-room { color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .58rem; }
td.empty { background: #fff; }

/* ── Stats strip ──────────────────────────────────────────── */
.stats-strip { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 7px 12px; font-size: .73rem; color: #475569; }
.stat-box strong { display: block; font-size: 1.05rem; color: #047857; font-weight: 700; }

/* ── Scrollbar ────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* ── Placeholder ──────────────────────────────────────────── */
.placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; gap: 10px; color: #94a3b8; font-size: .86rem; text-align: center; }

/* ── Mobile overlay backdrop ─────────────────────────────── */
.sidebar-backdrop {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40;
}

/* ═══════════════════════════════════════════════════════════
   MOBILE  ( ≤ 640 px )
═══════════════════════════════════════════════════════════ */
@media (max-width: 640px) {
  body { height: 100dvh; overflow: hidden; }

  /* Show hamburger button */
  .sidebar-toggle { display: flex; align-items: center; gap: 5px; }

  /* Slide sidebar in/out as a drawer */
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
    width: 280px; transform: translateX(-100%);
    box-shadow: 4px 0 20px rgba(0,0,0,.18);
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-backdrop.open { display: block; }

  /* Main fills full width */
  .main { padding: 10px; }
  .main-search-bar { margin: -10px -10px 10px -10px; padding: 8px 10px; top: -10px; flex-wrap: nowrap; }
  .main-search-bar input { min-width: 0; font-size: .78rem; }
  .ms-count { display: none; }

  /* Slightly smaller timetable text on mobile */
  .tt-block { padding: 10px 10px; }
  .tt-header h2 { font-size: .86rem; }
  .grid-table tbody tr { height: 52px; }
  .b-code { font-size: .62rem; }
  .b-mid  { font-size: .56rem; }
  .b-room { font-size: .52rem; }

  /* Stats wrap tightly */
  .stat-box { padding: 5px 9px; font-size: .68rem; }
  .stat-box strong { font-size: .9rem; }

  /* Toggle bar compact */
  .toggle-bar { padding: 7px 10px; gap: 8px; }
  .seg button { padding: 5px 12px; font-size: .78rem; }
  #modeLabel { display: none; }
}

/* ── Print ────────────────────────────────────────────────── */
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body { height: auto !important; overflow: visible !important; background: #fff !important; }
  .masthead, .toggle-bar, .sidebar, .sidebar-backdrop,
  .main-search-bar, .focus-btn, .back-btn, .stats-strip { display: none !important; }
  .layout { display: block !important; overflow: visible !important; }
  .main   { overflow: visible !important; padding: 0 !important; }
  .tt-block { border: 1px solid #999 !important; border-radius: 0 !important; padding: 8px !important; margin: 0 !important; page-break-after: always; break-after: page; box-shadow: none !important; }
  .tt-block:last-child { page-break-after: auto; break-after: auto; }
  .tt-divider { display: none !important; }
  .grid-scroller { overflow: visible !important; border: none !important; }
  .grid-table { min-width: unset !important; width: 100% !important; font-size: 6pt !important; }
  .grid-table tbody tr { height: 42px !important; }
}
</style>
</head>
<body>

<!-- Masthead -->
<header class="masthead">
  <div class="mh-mark">CUI</div>
  <div class="mh-name">
    <div class="mh-uni">COMSATS University Islamabad</div>
    <div class="mh-campus">Lahore Campus</div>
  </div>
  <span class="badge">Fall 2026</span>
</header>

<!-- Toggle bar -->
<div class="toggle-bar">
  <!-- Mobile sidebar open button -->
  <button class="sidebar-toggle" onclick="openSidebar()" aria-label="Open filters">☰ Filters</button>
  <div class="seg">
    <button class="on" id="btnClass"   onclick="switchMode('class')">🏫 Classes</button>
    <button           id="btnFaculty" onclick="switchMode('faculty')">👨‍🏫 Faculty</button>
  </div>
  <span id="modeLabel">Showing all class timetables</span>
</div>

<!-- Mobile backdrop -->
<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>

<!-- Layout -->
<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-controls">
      <div>
        <label for="deptSel">Department</label>
        <select id="deptSel" onchange="onDeptChange()">
          <option value="">All Departments</option>
        </select>
      </div>
      <div>
        <label for="sideSearch">Search</label>
        <input type="text" id="sideSearch" placeholder="Name, course, room…" oninput="onSideSearch()"/>
      </div>
    </div>
    <div class="list-count" id="listCount"></div>
    <div class="list-wrap" id="listWrap"></div>
  </aside>

  <!-- Main -->
  <main class="main" id="mainPanel"></main>
</div>

<script>
/* ── Embedded data ─────────────────────────────────────────── */
const FACULTY_DATA = ${JSON.stringify(facultyData)};
const CLASS_DATA   = ${JSON.stringify(classData)};
const SLOT_TIMES   = ${JSON.stringify(SLOT_TIMES)};

/* ── Colour palettes ───────────────────────────────────────── */
const PALETTES = [
  { bg:'#dbeafe', border:'#2563eb', text:'#1e40af' },
  { bg:'#dcfce7', border:'#16a34a', text:'#166534' },
  { bg:'#fef9c3', border:'#ca8a04', text:'#713f12' },
  { bg:'#fce7f3', border:'#db2777', text:'#831843' },
  { bg:'#ede9fe', border:'#7c3aed', text:'#4c1d95' },
  { bg:'#ffedd5', border:'#ea580c', text:'#7c2d12' },
  { bg:'#cffafe', border:'#0891b2', text:'#164e63' },
  { bg:'#f0fdf4', border:'#15803d', text:'#14532d' },
  { bg:'#fef2f2', border:'#dc2626', text:'#7f1d1d' },
  { bg:'#f5f3ff', border:'#8b5cf6', text:'#4c1d95' },
];
function palette(code) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) & 0xfffffff;
  return PALETTES[h % PALETTES.length];
}

/* ── State ─────────────────────────────────────────────────── */
let mode       = 'class';
let filterDept = '';
let focusIdx   = null;

/* ── Helpers ───────────────────────────────────────────────── */
const DAYS  = ['Mo','Tu','We','Th','Fr','Sa'];
const TOTAL = 24;
function getData() { return mode === 'class' ? CLASS_DATA : FACULTY_DATA; }
function getName(e){ return mode === 'class' ? e.className : e.facultyName; }

/* ── Deep search: matches ANY text field in entry + schedule ── */
function filtered() {
  // Both search boxes are kept in sync; read either one
  const q = (document.getElementById('sideSearch').value ||
             document.getElementById('mainSearch') && document.getElementById('mainSearch').value || '')
             .trim().toLowerCase();

  return getData()
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      // Department hard filter
      if (filterDept && e.department !== filterDept) return false;
      // No query → show everything
      if (!q) return true;
      // Top-level fields
      if (getName(e).toLowerCase().includes(q))     return true;
      if (e.department.toLowerCase().includes(q))   return true;
      // Deep-search every schedule slot
      return e.schedule.some(s =>
        (s.courseCode || '').toLowerCase().includes(q) ||
        (s.section    || '').toLowerCase().includes(q) ||
        (s.teacher    || '').toLowerCase().includes(q) ||
        (s.room       || '').toLowerCase().includes(q) ||
        (s.day        || '').toLowerCase().includes(q) ||
        (s.time       || '').toLowerCase().includes(q)
      );
    });
}

/* ── Dept dropdown ─────────────────────────────────────────── */
function populateDepts() {
  const depts = [...new Set(getData().map(e => e.department))].sort();
  document.getElementById('deptSel').innerHTML =
    '<option value="">All Departments</option>' +
    depts.map(d => '<option value="' + d + '">' + d + '</option>').join('');
}

/* ── Sidebar list ──────────────────────────────────────────── */
function renderList() {
  const items = filtered();
  document.getElementById('listCount').textContent =
    items.length + ' result' + (items.length !== 1 ? 's' : '');
  document.getElementById('listWrap').innerHTML = items.map(({ e, i }) =>
    '<div class="list-item' + (i === focusIdx ? ' active' : '') + '" onclick="clickItem(' + i + ')">' +
      '<span>' + getName(e) + '</span>' +
      '<span class="li-sub">' + e.department + ' \u00a0\u00b7\u00a0 ' + e.schedule.length + ' slot' + (e.schedule.length !== 1 ? 's' : '') + '</span>' +
    '</div>'
  ).join('');
}

/* ── Build one timetable grid ──────────────────────────────── */
function buildGrid(entry, idx) {
  const schedule   = entry.schedule;
  const activeDays = [...new Set(schedule.map(s => s.day))];
  const maxDayIdx  = Math.max(DAYS.indexOf('Fr'), ...activeDays.map(d => DAYS.indexOf(d)));
  const days       = DAYS.slice(0, maxDayIdx + 1);

  const byDay = {};
  days.forEach(d => byDay[d] = []);
  schedule.forEach(s => { if (byDay[s.day]) byDay[s.day].push(s); });

  let hd1 = '<th class="col-day" rowspan="2"></th>';
  for (let s = 1; s <= TOTAL; s++) hd1 += '<th class="col-slot">' + s + '</th>';
  let hd2 = '';
  for (let s = 0; s < TOTAL; s++) hd2 += '<th class="col-time">' + SLOT_TIMES[s] + '</th>';

  let body = '';
  for (const day of days) {
    const slots = byDay[day];
    let cells = '';
    let p = 1;
    while (p <= TOTAL) {
      const slot = slots.find(s => s.slot === p);
      if (slot) {
        const span = slot.endSlot - slot.slot + 1;
        const pal  = palette(slot.courseCode || 'X');
        const mid  = mode === 'class' ? (slot.teacher || '') : (slot.section || '');
        cells +=
          '<td class="occupied" colspan="' + span + '" style="background:' + pal.bg + '">' +
            '<div class="blk" style="border-left-color:' + pal.border + ';background:' + pal.bg + '">' +
              '<span class="b-code" style="color:' + pal.text + '">' + (slot.courseCode || '') + '</span>' +
              '<span class="b-mid">' + mid + '</span>' +
              '<span class="b-room">' + (slot.room || '') + '</span>' +
            '</div>' +
          '</td>';
        p += span;
      } else {
        cells += '<td class="empty"></td>';
        p++;
      }
    }
    body += '<tr><td class="col-day">' + day + '</td>' + cells + '</tr>';
  }

  const periods = schedule.reduce((a, s) => a + (s.endSlot - s.slot + 1), 0);
  const courses = [...new Set(schedule.map(s => s.courseCode).filter(Boolean))];

  return (
    '<div id="tt-' + idx + '" class="tt-block">' +
      '<div class="tt-header">' +
        '<div>' +
          '<h2>' + getName(entry) + '</h2>' +
          '<p>Dept: <strong>' + entry.department + '</strong></p>' +
        '</div>' +
        '<button class="focus-btn" onclick="focusOne(' + idx + ')">🔍 Focus</button>' +
      '</div>' +
      '<div class="grid-scroller">' +
        '<table class="grid-table">' +
          '<thead><tr>' + hd1 + '</tr><tr>' + hd2 + '</tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="stats-strip">' +
        '<div class="stat-box"><strong>' + activeDays.length + '</strong>Days</div>' +
        '<div class="stat-box"><strong>' + schedule.length + '</strong>Entries</div>' +
        '<div class="stat-box"><strong>' + periods + '</strong>Periods</div>' +
        '<div class="stat-box"><strong>' + courses.length + '</strong>' +
          'Course' + (courses.length !== 1 ? 's' : '') + ': ' + (courses.join(', ') || '—') +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

/* ── Render ALL filtered timetables ────────────────────────── */
function renderAll() {
  focusIdx = null;
  renderList();
  const items = filtered();
  const label = mode === 'class' ? 'class timetables' : 'faculty timetables';
  const q     = document.getElementById('sideSearch').value.trim();

  document.getElementById('modeLabel').textContent =
    'Showing ' + items.length + ' ' + label + (filterDept ? ' · ' + filterDept : '');

  const grids = items.length === 0
    ? '<div class="placeholder"><p>No results match your search.</p></div>'
    : items.map(({ e, i }, pos) =>
        (pos > 0 ? '<hr class="tt-divider">' : '') + buildGrid(e, i)
      ).join('');

  const searchBar =
    '<div class="main-search-bar">' +
      '<input type="text" id="mainSearch"' +
        ' placeholder="🔍 Search name, course, teacher, room…"' +
        ' value="' + q.replace(/"/g, '&quot;') + '"' +
        ' oninput="onMainSearch(this.value)"/>' +
      '<span class="ms-count">' + items.length + ' shown</span>' +
    '</div>';

  document.getElementById('mainPanel').innerHTML = searchBar + grids;
}

/* ── Focus one entry ───────────────────────────────────────── */
function focusOne(idx) {
  focusIdx = idx;
  renderList();
  const entry = getData()[idx];
  document.getElementById('modeLabel').textContent = getName(entry) + ' · ' + entry.department;
  document.getElementById('mainPanel').innerHTML =
    '<button class="back-btn" onclick="goBack()">← Back to all</button>' +
    buildGrid(entry, idx);
  closeSidebar();
}

/* ── Sidebar click ─────────────────────────────────────────── */
function clickItem(idx) {
  closeSidebar();
  const el = document.getElementById('tt-' + idx);
  if (el) {
    focusIdx = idx;
    renderList();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    focusOne(idx);
  }
}

function goBack() { renderAll(); }

/* ── Mode switch ───────────────────────────────────────────── */
function switchMode(m) {
  mode       = m;
  filterDept = '';
  document.getElementById('deptSel').value    = '';
  document.getElementById('sideSearch').value = '';
  document.getElementById('btnClass').classList.toggle('on',   m === 'class');
  document.getElementById('btnFaculty').classList.toggle('on', m === 'faculty');
  populateDepts();
  renderAll();
}

/* ── Filter events ─────────────────────────────────────────── */
function onDeptChange() {
  filterDept = document.getElementById('deptSel').value;
  renderAll();
}

function onSideSearch() {
  // Sync to main search if it exists, then re-render
  const val = document.getElementById('sideSearch').value;
  const ms  = document.getElementById('mainSearch');
  if (ms) ms.value = val;
  renderAll();
}

function onMainSearch(val) {
  document.getElementById('sideSearch').value = val;
  renderAll();
  // Restore cursor position after re-render
  const inp = document.getElementById('mainSearch');
  if (inp) { inp.focus(); inp.setSelectionRange(val.length, val.length); }
}

/* ── Mobile sidebar helpers ────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

/* ── Init ──────────────────────────────────────────────────── */
populateDepts();
renderAll();
</script>
</body>
</html>`;

const outFile = path.join(__dirname, "index.html");
fs.writeFileSync(outFile, html, "utf-8");
console.log("✓ Generated: " + outFile);
console.log("  Faculty : " + facultyData.length + " entries");
console.log("  Classes : " + classData.length  + " entries");
console.log("\nOpen index.html in your browser.");
