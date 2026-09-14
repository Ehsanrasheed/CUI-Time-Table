# CUI Lahore Timetable Scraper & Viewer

A Puppeteer-based scraper and interactive web viewer for the [CUI Lahore SFS timetable portal](https://sfs.cuilahore.edu.pk/schedule/Public/Timetable?Kind=teacher).

## 📁 Project Structure

```
├── scraper.js               # Scrapes all faculty timetables → cui_timetables.json
├── scraper_classes.js       # Scrapes all class timetables  → cui_class_timetables.json
├── generate_html.js         # Combines both JSONs into a standalone index.html viewer
├── cui_timetables.json      # Scraped faculty data (523 entries)
├── cui_class_timetables.json# Scraped class data  (262 entries)
├── index.html               # Self-contained interactive timetable viewer
└── package.json
```

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
npx puppeteer browsers install chrome
```

### 2. Scrape the data
```bash
node scraper.js           # Faculty timetables
node scraper_classes.js   # Class timetables
```

### 3. Generate the viewer
```bash
node generate_html.js
```

### 4. Open the viewer
Just open `index.html` in any browser — no server needed.

---

## 🌐 Viewer Features

| Feature | Description |
|---|---|
| **Toggle** | Switch between 🏫 Classes and 👨‍🏫 Faculty views |
| **Department filter** | Filter by any of the 14 departments |
| **Full-text search** | Search by class name, faculty name, course code, teacher, room, or section |
| **All timetables view** | All results shown as stacked grids by default |
| **Focus mode** | Isolate a single timetable with the 🔍 Focus button |
| **Colour coding** | Each course gets a unique consistent colour across the grid |

## 🏫 Departments Covered

`CS` · `CE` · `ChE` · `Chemistry` · `ECO` · `EE` · `HUM` · `HUM-Media` · `IRCBM` · `Math` · `MS` · `Pharmacy` · `Phy` · `Stat`

## 📦 Data

- **523** faculty members scraped across 14 departments
- **262** class sections scraped across 13 departments
- Semester: **Fall 2026**

## 🛠 Tech Stack

- [Puppeteer](https://pptr.dev/) – headless Chrome scraping
- Vanilla HTML / CSS / JS – zero-dependency viewer
