const fs = require('fs');
const puppeteer = require('puppeteer');
const service = require("./service.js");
const utils = require("./utils.js");

const URLS_FILE = './source.json';
const SAVE_DIR = 'L:/data/finance';
const CHECKSUM_DIR = `${SAVE_DIR}/checksums`;
const LAST_CHECK_FILE = `${SAVE_DIR}/last_check_dates.json`;

if (!fs.existsSync(CHECKSUM_DIR)) fs.mkdirSync(CHECKSUM_DIR, { recursive: true });

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
            console.error(`Error processing source ${source.name}:`, error);
        }
    }
    console.log("updating last check dates");
    fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify(lastCheckDates, null, 2), 'utf-8');
    await browser.close();
    return;
}

module.exports = { checkAllUrls };
