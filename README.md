# cyclic_downloader

A scheduled downloader for financial market reports. It reads a list of source URLs from `source.json`, checks each one on a configurable interval, and saves new content to a local directory.

## Requirements

- Node.js
- `L:/data/finance/` directory accessible (output destination)

## Setup

```bash
npm install
```

## Usage

**Production** — starts the Bree scheduler (runs weekdays at 20:00):
```bash
node index.js
```

**Run immediately** — triggers the job on startup (for testing):
```bash
node test.js
```

## Output

Files are saved under `L:/data/finance/<subfolder>/` as defined per source in `source.json`.

State is persisted in:
- `L:/data/finance/last_check_dates.json` — tracks the last download date per URL
- `L:/data/finance/checksums/` — stores hash/text key files for deduplication

## Adding a Source

Add an entry to `source.json`. Minimal examples:

**Direct PDF download** (skip if file already exists):
```json
{
    "url": "https://example.com/report.pdf",
    "filename": "report_{YYYYMMDD}.pdf",
    "ext": "pdf",
    "interval_days": 1,
    "subfolder": "MySource",
    "unique": "segment",
    "type": "load",
    "custom": null
}
```

**JavaScript-rendered page** (save as PDF, skip if page content unchanged):
```json
{
    "url": "https://example.com/page",
    "filename": "daily_{YYYYMMDD}.pdf",
    "ext": "html",
    "interval_days": 1,
    "subfolder": "MySource",
    "unique": "checksum",
    "type": "goto_load",
    "custom": null
}
```

**Scrape links from a page** then download each match:
```json
{
    "url": "https://example.com/reports",
    "ext": "html",
    "interval_days": 1,
    "subfolder": "MySource",
    "custom": [{
        "type": "link_parse",
        "targets": [
            {
                "filename": "{filename}",
                "value": ".*\\.pdf",
                "ext": "pdf",
                "unique": "segment",
                "type": "load",
                "interval_days": 7
            }
        ]
    }]
}
```

### Key Fields

| Field | Description |
|---|---|
| `type` | `load` (direct fetch), `goto_load` (Puppeteer → PDF), `load_rep` (fetch HTML → PDF with image rewriting) |
| `unique` | `segment` (file exists check), `text` (link text hash), `checksum` (page HTML hash) |
| `interval_days` | Minimum days between downloads; `null` = download only once |
| `filename` | Supports `{YYYYMMDD}`, `{YYMMDD}`, `{YYYYMM}`, `{YYMM}`, `{filename}`, `{basefilename}` placeholders |
| `custom` | Use `link_parse` or `element_parse` to scrape sub-links/elements before downloading |
