const path = require("path");
const fs = require('fs');
const puppeteer = require('puppeteer');
const service = require("./service.ts");
const utils = require("./utils.ts");

const URLS_FILE = './source.json';
const SAVE_DIR = 'L:/data/finance_test';
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
        await service.checkSpecificSource(browser, source, lastCheckDates, CHECKSUM_DIR, SAVE_DIR);
    }
    console.log("updating last check dates");
    fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify(lastCheckDates, null, 2), 'utf-8');
    await browser.close();
    return;
}

checkAllUrls().then(() => { console.log("done"); });
// const sourceList = utils.loadJsonFile('./test_source_html.json');
// puppeteer.launch(
// {
//     headless: false,
//     args: ['--no-sandbox', '--disable-setuid-sandbox']
// }
// ).then(async browser => {
//     await service.checkSpecificSource(browser, sourceList, {}, CHECKSUM_DIR, SAVE_DIR);
//     await browser.close();
// });