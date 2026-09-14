/**
 * ============================================================
 * CUI Lahore Faculty Timetable Scraper  –  v2 (fixed)
 * ============================================================
 * Strategy (based on actual page inspection):
 *
 *  1.  For every department, GET the department page and extract
 *      the faculty list from the inline JS array  `const all = [...]`
 *      embedded in the page <script>.  There is NO <select> dropdown
 *      for faculty – the site uses a custom type-ahead input instead.
 *
 *  2.  For every faculty member, GET:
 *        BASE_URL + &Dept=<dept> + &Who=<encoded-name>
 *      The page is fully server-rendered so no JS execution is needed.
 *
 *  3.  Parse the timetable from:
 *        table.grid  →  tbody  →  one <tr> per day
 *        • td.daycol  = day label  (Mo / Tu / We / Th / Fr / Sa)
 *        • td.slot    = one or more time-slots  (uses colspan for blocks)
 *        • div.blk inside a td.slot = a scheduled class
 *            span.code  = course code
 *            span.mid2  = section / class label
 *            span.room  = room
 *        Slots are tracked cumulatively by their colspan so the correct
 *        period number is always recorded even when spans overlap.
 *
 * Output: cui_timetables.json in the same directory as this script.
 * ============================================================
 */

"use strict";

const puppeteer = require("puppeteer");
const fs        = require("fs");
const path      = require("path");

// ── Configuration ──────────────────────────────────────────────────────────────

const BASE_URL = "https://sfs.cuilahore.edu.pk/schedule/Public/Timetable?Kind=teacher";

const DEPARTMENTS = [
  "CS", "CE", "ChE", "Chemistry", "ECO", "EE",
  "HUM", "HUM-Media", "IRCBM", "Math", "MS",
  "Pharmacy", "Phy", "Stat",
];

const OUTPUT_FILE = path.join(__dirname, "cui_timetables.json");

/** Timeout for page.goto() */
const NAV_TIMEOUT   = 30_000;
/** Extra pause after navigation to let any remaining painting settle */
const POST_NAV_WAIT = 500;

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build URL for a dept, optionally with a specific faculty member. */
function buildUrl(dept, who) {
  let url = `${BASE_URL}&Dept=${encodeURIComponent(dept)}`;
  if (who) url += `&Who=${encodeURIComponent(who)}`;
  return url;
}

// ── Step 1: Extract faculty list from the inline JS in the page ────────────────
/**
 * The page embeds the complete faculty list as:
 *   const all = ["Name 1","Name 2",...];
 * This regex pulls that array out of the raw HTML text.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} dept
 * @returns {Promise<string[]>}
 */
async function getFacultyList(page, dept) {
  const url = buildUrl(dept);
  console.log(`  → Loading dept page: ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await sleep(POST_NAV_WAIT);

  // Pull the raw HTML and let a regex find the `const all = [...]` array
  const html = await page.content();

  // Match:  const all = ["a","b",...];
  const match = html.match(/const\s+all\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.warn(`  [WARN] Could not find faculty list in page for dept "${dept}"`);
    return [];
  }

  // Safely evaluate the matched JSON array (it is valid JSON – double-quoted strings)
  let facultyList = [];
  try {
    facultyList = JSON.parse(match[1]);
  } catch (e) {
    console.warn(`  [WARN] Failed to parse faculty list for dept "${dept}": ${e.message}`);
    return [];
  }

  console.log(`     ✓ ${facultyList.length} faculty member(s) found`);
  return facultyList;
}

// ── Step 2: Scrape the timetable grid for one faculty member ───────────────────
/**
 * Navigates to a faculty member's page and extracts every scheduled class.
 *
 * Real page structure (verified by inspection):
 *
 *   <table class="grid">
 *     <thead>
 *       <tr>
 *         <th class="daycol" rowspan="2"></th>   ← corner cell
 *         <th class="pnum">1</th> ... <th class="pnum">24</th>
 *       </tr>
 *       <tr>
 *         <th class="ptime">08:30–09:00</th> ... (24 cells)
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr class="dayend">                       ← one row per day
 *         <td class="daycol">Mo</td>
 *         <td class="slot"></td>                  ← empty slot
 *         <td class="slot" colspan="6">           ← class spanning 6 slots
 *           <div class="blk tall">
 *             <span class="code">CS101</span>
 *             <span class="mid2">SP24-BCS-A</span>
 *             <span class="room">A-201</span>
 *           </div>
 *         </td>
 *         ...
 *       </tr>
 *       ... (Tu / We / Th / Fr rows)
 *     </tbody>
 *   </table>
 *
 * Because a booked block uses colspan="N", we track the running
 * period counter manually so every entry gets the right slot number.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} dept
 * @param {string} faculty
 * @returns {Promise<Array<{day:string, slot:number, endSlot:number, courseCode:string, section:string, room:string}>>}
 */
async function scrapeFacultySchedule(page, dept, faculty) {
  const url = buildUrl(dept, faculty);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await sleep(POST_NAV_WAIT);

  // page.evaluate runs in the browser context – no Node.js APIs inside
  const schedule = await page.evaluate(() => {
    const table = document.querySelector("table.grid");
    if (!table) return [];

    // ── A: Read time labels from <thead> ──────────────────────────────────
    // First header row: th.pnum cells carry slot numbers "1"–"24"
    // First header row also has a th.daycol (corner) with rowspan=2 – skip it
    const pnumCells = Array.from(table.querySelectorAll("thead tr:first-child th.pnum"));
    // slotTimes: index 0 = period 1, index 1 = period 2, …
    const slotNumbers = pnumCells.map((th) => parseInt(th.textContent.trim(), 10));

    // Second header row: th.ptime cells carry "HH:MM–HH:MM" time labels
    const ptimeCells  = Array.from(table.querySelectorAll("thead tr:nth-child(2) th.ptime"));
    const slotTimes   = ptimeCells.map((th) => {
      // Each ptime has two <div>s: start and end time
      const divs = th.querySelectorAll("div");
      return divs.length >= 2
        ? `${divs[0].textContent.trim()}–${divs[1].textContent.trim()}`
        : th.textContent.trim();
    });

    const entries = [];

    // ── B: Walk every day row in <tbody> ──────────────────────────────────
    const dayRows = Array.from(table.querySelectorAll("tbody tr"));

    for (const row of dayRows) {
      // Day abbreviation is in the first td with class "daycol"
      const dayCell = row.querySelector("td.daycol");
      if (!dayCell) continue;
      const day = dayCell.textContent.trim(); // "Mo", "Tu", "We", "Th", "Fr", "Sa"

      // ── C: Walk slot cells, tracking the running period number ──────────
      // Cells other than daycol are the slot tds
      const slotCells = Array.from(row.querySelectorAll("td.slot"));

      // currentPeriod is 1-based, matching the header numbers
      let currentPeriod = 1;

      for (const cell of slotCells) {
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

        // Only process cells that contain a booking block
        const blk = cell.querySelector("div.blk");
        if (blk) {
          // Extract the three info pieces
          const codeEl = blk.querySelector("span.code");
          const midEl  = blk.querySelector("span.mid2");
          const roomEl = blk.querySelector("span.room");

          const courseCode = codeEl ? codeEl.textContent.trim() : "";
          const section    = midEl  ? midEl.textContent.trim()  : "";
          const room       = roomEl ? roomEl.textContent.trim() : "";

          // Map current period index → time label
          const periodIdx = currentPeriod - 1; // 0-based
          const timeLabel = slotTimes[periodIdx] || `Period ${currentPeriod}`;
          const endPeriod = currentPeriod + colspan - 1;

          entries.push({
            day,
            slot:       currentPeriod,   // 1-based starting period
            endSlot:    endPeriod,        // inclusive ending period
            time:       timeLabel,        // e.g. "09:00–09:30"
            courseCode,
            section,
            room,
          });
        }

        // Advance the period counter by this cell's colspan
        currentPeriod += colspan;
      }
    }

    return entries;
  });

  return schedule;
}

// ── Main Orchestrator ──────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log(" CUI Lahore Timetable Scraper  –  v2");
  console.log("=".repeat(60));

  const masterData = [];

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(NAV_TIMEOUT);

    // Block images / fonts / stylesheets for faster loads
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ── Outer loop: departments ──────────────────────────────────────────
    for (const dept of DEPARTMENTS) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`Department: ${dept}`);
      console.log("─".repeat(50));

      let facultyList = [];
      try {
        facultyList = await getFacultyList(page, dept);
      } catch (err) {
        console.error(`  [ERROR] Could not load faculty list for "${dept}": ${err.message}`);
        continue;
      }

      if (!facultyList.length) {
        console.warn(`  [WARN] No faculty found for dept "${dept}". Skipping.`);
        continue;
      }

      // ── Inner loop: faculty members ──────────────────────────────────
      for (const faculty of facultyList) {
        console.log(`  Scraping: ${faculty}`);
        try {
          const schedule = await scrapeFacultySchedule(page, dept, faculty);

          masterData.push({
            department: dept,
            facultyName: faculty,
            schedule,
          });

          console.log(`     ✓ ${schedule.length} class slot(s) captured`);
        } catch (err) {
          console.error(`  [ERROR] Failed for "${faculty}" (${dept}): ${err.message}`);
        }
      }
    }
  } finally {
    await browser.close();
    console.log("\nBrowser closed.");
  }

  // ── Write output ────────────────────────────────────────────────────────
  console.log(`\nTotal faculty entries scraped: ${masterData.length}`);
  console.log(`Writing output to: ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterData, null, 2), "utf-8");
  console.log("Done! ✓");
}

main().catch((err) => {
  console.error("\n[FATAL] Scraper crashed:", err);
  process.exit(1);
});
