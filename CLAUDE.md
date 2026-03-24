# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start the scheduler (runs the cron job via Bree)
node index.js

# Run the job immediately (for testing)
node test.js
```

There are no test commands or lint scripts defined in `package.json`.

## Architecture

This is a Node.js **cyclic downloader** that fetches financial market reports from multiple Japanese and US financial institutions on a schedule, saving them to `L:/data/finance/`.

### Entry Points

- **`index.js`** — Production entry point. Uses [Bree](https://github.com/breejs/bree) to schedule `jobs/daily.js` via cron (`0 20 * * 1-5` = weekdays at 20:00).
- **`test.js`** — Dev/test entry point. Same Bree setup but immediately triggers the job after start.

### Core Flow

```
index.js (Bree scheduler)
  └─> jobs/daily.js (weekday guard, calls checkAllUrls)
        └─> services/downloader.js (iterates source.json, drives puppeteer browser)
              └─> services/service.js (fetch + save logic per source type)
                    └─> services/utils.js (helpers: file I/O, checksums, date strings, link filtering)
```

### Source Configuration (`source.json`)

Each entry in `source.json` describes one URL to monitor. Key fields:

| Field | Description |
|---|---|
| `url` | Target URL |
| `subfolder` | Save directory under `L:/data/finance/` |
| `ext` | Source content type (`html`, `pdf`) |
| `filename` | Output filename (supports date placeholders) |
| `type` | Operation type (see below) |
| `unique` | Deduplication strategy (see below) |
| `interval_days` | Min days between downloads (`null` = download once) |
| `custom` | Array of nested parse configs for complex pages |

**Operation types** (`type` field):
- `load` — Direct HTTP fetch (axios)
- `goto_load` — Puppeteer navigation then save as PDF
- `load_rep` — Fetch HTML then save as PDF with base URL rewriting (for relative images)

**Custom parse types** (`custom[].type`):
- `link_parse` — Extract all `<a>` links from the page, filter by regex, then process each matched link
- `element_parse` — Extract elements by CSS selector, process each result
- `save_dialog` — Click a button to open a modal, then save the text content

**Deduplication strategies** (`unique` field):
- `segment` — Skip if the target file already exists (uses URL path segment as filename)
- `text` — Compare link text against a cached key file under `L:/data/finance/checksums/`
- `checksum` — SHA-256 hash of page HTML, cached in checksums directory
- `{type: "selector", selector: "..."}` — Compare element text matched by CSS selector

### Filename Placeholders

`{YYYYMMDD}`, `{YYMMDD}`, `{YYYYMM}`, `{YYMM}` → replaced with today's date
`{filename}` → last path segment of the source URL
`{basefilename}` → filename without extension from the source URL

### Persistence Files

- `L:/data/finance/last_check_dates.json` — Maps URL → last download date (ISO string)
- `L:/data/finance/checksums/` — Per-URL key files for dedup tracking

### Adding a New Source

Add an entry to `source.json`. For simple direct-download PDFs, use `type: "load"` and `unique: "segment"`. For JavaScript-rendered pages, use `type: "goto_load"` with `unique: "checksum"`. For pages where links must be scraped first, use `custom: [{type: "link_parse", targets: [...]}]`.
