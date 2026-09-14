/**
 * ============================================================
 * CUI Lahore  –  CLASS Timetable Scraper
 * ============================================================
 * Scrapes the "Classes" timetable (Kind=class) for every
 * department and class section, producing cui_class_timetables.json
 *
 * Page structure is identical to the faculty scraper:
 *   • Class list  →  `const all = [...]` in the inline <script>
 *   • Grid        →  table.grid  (same layout as faculty view)
 *   • .blk inside td.slot  →  span.code + span.mid2 + span.room
 *     (on the class sheet, span.mid2 shows the TEACHER name)
 *
 * Usage:
 *   node scraper_classes.js
 * ============================================================
 */

"use strict";

const puppeteer = require("puppeteer");
const fs        = require("fs");
const path      = require("path");

// ── Configuration ──────────────────────────────────────────────────────────────

const BASE_URL = "https://sfs.cuilahore.edu.pk/schedule/Public/Timetable?Kind=class";

/**
 * Department codes for the class timetable view.
 * Note: Physics uses "PHY" (uppercase) here, and IRCBM has no class view.
 */
const DEPARTMENTS = [
  "CS", "CE", "ChE", "Chemistry", "ECO", "EE",
  "HUM", "HUM-Media", "Math", "MS",
  "Pharmacy", "PHY", "Stat",
];

const OUTPUT_FILE = path.join(__dirname, "cui_class_timetables.json");

const NAV_TIMEOUT   = 30_000;
const POST_NAV_WAIT = 500;

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(dept, who) {
  let url = `${BASE_URL}&Dept=${encodeURIComponent(dept)}`;
  if (who) url += `&Who=${encodeURIComponent(who)}`;
  return url;
}

// ── Step 1: Extract class list from inline JS ──────────────────────────────────
/**
 * Same technique as the faculty scraper: the page embeds
 *   const all = ["SP26-BCS-A","FA25-BSE-C",...];
 * in a <script> block. We regex it out and JSON.parse it.
 */
async function getClassList(page, dept) {
  const url = buildUrl(dept);
  console.log(`  → Loading dept page: ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await sleep(POST_NAV_WAIT);

  const html = await page.content();
  const match = html.match(/const\s+all\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.warn(`  [WARN] No class list found for dept "${dept}"`);
    return [];
  }

  let classList = [];
  try {
    classList = JSON.parse(match[1]);
  } catch (e) {
    console.warn(`  [WARN] Failed to parse class list for dept "${dept}": ${e.message}`);
    return [];
  }

  console.log(`     ✓ ${classList.length} class section(s) found`);
  return classList;
}

// ── Step 2: Scrape timetable grid for one class section ───────────────────────
/**
 * Navigates to a specific class section page and extracts every scheduled slot.
 *
 * Grid structure (same as faculty view):
 *   table.grid > tbody > tr.dayend  (one row per day)
 *     td.daycol          → day abbreviation (Mo/Tu/We/Th/Fr/Sa)
 *     td.slot            → empty slot  OR  slot with colspan spanning N periods
 *       div.blk
 *         span.code      → course code  (e.g. "CS101")
 *         span.mid2      → teacher name (on class sheets, mid2 = teacher)
 *         span.room      → room         (e.g. "A-201")
 *
 * colspan is tracked so slot numbers stay accurate across multi-period blocks.
 */
async function scrapeClassSchedule(page, dept, className) {
  const url = buildUrl(dept, className);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  await sleep(POST_NAV_WAIT);

  const schedule = await page.evaluate(() => {
    const table = document.querySelector("table.grid");
    if (!table) return [];

    // ── Read time labels from the two thead rows ─────────────────────────────
    // Row 1: th.pnum  → slot numbers "1"–"24"
    // Row 2: th.ptime → "HH:MM–HH:MM" labels (two <div>s per cell)
    const ptimeCells = Array.from(table.querySelectorAll("thead tr:nth-child(2) th.ptime"));
    const slotTimes  = ptimeCells.map((th) => {
      const divs = th.querySelectorAll("div");
      return divs.length >= 2
        ? `${divs[0].textContent.trim()}–${divs[1].textContent.trim()}`
        : th.textContent.trim();
    });

    const entries = [];

    // ── Walk every day row ───────────────────────────────────────────────────
    const dayRows = Array.from(table.querySelectorAll("tbody tr"));

    for (const row of dayRows) {
      const dayCell = row.querySelector("td.daycol");
      if (!dayCell) continue;
      const day = dayCell.textContent.trim(); // Mo | Tu | We | Th | Fr | Sa

      const slotCells  = Array.from(row.querySelectorAll("td.slot"));
      let currentPeriod = 1; // 1-based, matches header numbers

      for (const cell of slotCells) {
        const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

        const blk = cell.querySelector("div.blk");
        if (blk) {
          const codeEl    = blk.querySelector("span.code");
          const teacherEl = blk.querySelector("span.mid2"); // teacher on class sheets
          const roomEl    = blk.querySelector("span.room");

          const courseCode = codeEl    ? codeEl.textContent.trim()    : "";
          const teacher    = teacherEl ? teacherEl.textContent.trim()  : "";
          const room       = roomEl    ? roomEl.textContent.trim()     : "";

          const periodIdx = currentPeriod - 1;
          const timeLabel = slotTimes[periodIdx] || `Period ${currentPeriod}`;
          const endPeriod = currentPeriod + colspan - 1;

          entries.push({
            day,
            slot:       currentPeriod,
            endSlot:    endPeriod,
            time:       timeLabel,
            courseCode,
            teacher,      // ← key difference from faculty scraper
            room,
          });
        }

        currentPeriod += colspan;
      }
    }

    return entries;
  });

  return schedule;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log(" CUI Lahore Class Timetable Scraper");
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

    // Block heavy resources not needed for scraping
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    for (const dept of DEPARTMENTS) {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`Department: ${dept}`);
      console.log("─".repeat(50));

      let classList = [];
      try {
        classList = await getClassList(page, dept);
      } catch (err) {
        console.error(`  [ERROR] Could not load class list for "${dept}": ${err.message}`);
        continue;
      }

      if (!classList.length) {
        console.warn(`  [WARN] No classes found for dept "${dept}". Skipping.`);
        continue;
      }

      for (const className of classList) {
        console.log(`  Scraping: ${className}`);
        try {
          const schedule = await scrapeClassSchedule(page, dept, className);

          masterData.push({
            department: dept,
            className,
            schedule,
          });

          console.log(`     ✓ ${schedule.length} class slot(s) captured`);
        } catch (err) {
          console.error(`  [ERROR] Failed for "${className}" (${dept}): ${err.message}`);
        }
      }
    }
  } finally {
    await browser.close();
    console.log("\nBrowser closed.");
  }

  console.log(`\nTotal class entries scraped: ${masterData.length}`);
  console.log(`Writing output to: ${OUTPUT_FILE}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterData, null, 2), "utf-8");
  console.log("Done! ✓");
}

main().catch((err) => {
  console.error("\n[FATAL] Scraper crashed:", err);
  process.exit(1);
});
