const fs = require('fs');
const puppeteer = require('puppeteer');
const service = require("./service.js");
const utils = require("./utils.js");

const URLS_FILE = './source.json';
const SAVE_DIR = 'L:/data/finance';
const CHECKSUM_DIR = `${SAVE_DIR}/checksums`;
const LAST_CHECK_FILE = `${SAVE_DIR}/last_check_dates.json`;
const ISSUES_DIR = `${SAVE_DIR}/issues`;

if (!fs.existsSync(CHECKSUM_DIR)) fs.mkdirSync(CHECKSUM_DIR, { recursive: true });
if (!fs.existsSync(ISSUES_DIR)) fs.mkdirSync(ISSUES_DIR, { recursive: true });

function saveIssue(url, error) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const host = (() => { try { return new URL(url).hostname; } catch { return 'unknown'; } })();
    const filename = `${timestamp}_${host}.txt`;
    const content = [
        `Time:  ${now.toLocaleString()}`,
        `URL:   ${url}`,
        `Error: ${error.message || error}`,
        '',
        error.stack || '',
        error.config ? `\nRequest config:\n${JSON.stringify(error.config, null, 2)}` : '',
    ].join('\n');
    fs.writeFileSync(`${ISSUES_DIR}/${filename}`, content, 'utf-8');
    console.error(`Issue saved: ${filename}`);
}

function loadLastCheckDates() {
    if (fs.existsSync(LAST_CHECK_FILE)) {
        return JSON.parse(fs.readFileSync(LAST_CHECK_FILE, 'utf-8'));
    }
    return {};
}


async function checkAllUrls() {
    const browser = await puppeteer.launch();
    const sourceList = utils.loadJsonFile(URLS_FILE);
    let lastCheckDates = loadLastCheckDates();

    for( const source of sourceList){
        try {
            await service.checkSpecificSource(browser, source, lastCheckDates, CHECKSUM_DIR, SAVE_DIR);
        } catch (error) {
            const url = source.url || source.name || JSON.stringify(source);
            console.error(`Error processing source ${url}:`, error.message || error);
            saveIssue(url, error);
        }
    }
    console.log("updating last check dates");
    fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify(lastCheckDates, null, 2), 'utf-8');
    await browser.close();
    return;
}

module.exports = { checkAllUrls };
