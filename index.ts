const path = require("path");
const fs = require('fs');
const service = require("./service.ts");
const utils = require("./utils.ts");

const URLS_FILE = './source.json';
const SAVE_DIR = 'L:/data/finance';
const CHECKSUM_DIR = `${SAVE_DIR}/checksums`;
const LAST_CHECK_FILE = `${SAVE_DIR}/last_check_dates.json`;

// Operation Types for loading content
const LOAD = "load"; // simply load html content
const GOTO_LOAD = "goto_load"; // load a page with puppeteer.
const LOAD_REPLAGE = "load_rep"; // After geeting the html, replace image url with base
// Custom types
const PARSE = "link_parse"; // if url is not fixed, parse links from html

if (!fs.existsSync(CHECKSUM_DIR)) fs.mkdirSync(CHECKSUM_DIR, { recursive: true });

function loadLastCheckDates() {
    if (fs.existsSync(LAST_CHECK_FILE)) {
        return JSON.parse(fs.readFileSync(LAST_CHECK_FILE, 'utf-8'));
    }
    return {};
}

/**
 * return if the link ontains updates.
 * @param unique_by str
 * @param save_dir str
 * @param link {str: text, str: url}
 * @returns string
 */
function check_update_by_link(unique_by, save_dir, link){
    if(unique_by == "segment") {
        if (fs.existsSync(save_dir)) {
            // console.log(`The same file already exists: ${link.href}`);
            return null;
        }
        return save_dir;
    }else if(unique_by == "text") {
        const key_file = utils.uniqyeKeyFilePath(link, CHECKSUM_DIR);
        if (fs.existsSync(key_file)) {
            const newValue = link.text;
            const oldValue = utils.loadFile(key_file);
            if(newValue == oldValue){
                return null;
            }else{
                return key_file;
            }
        }
        return key_file;
    }else if(unique_by == "checksum"){
        const key_file = utils.uniqyeKeyFilePath(link, CHECKSUM_DIR);
        return key_file;
    }
    console.log(`undefined unique method may be specified: ${unique_by}`);
    return null;
}

function update_unique_file(unique_by, uniqueKeyFile, url){
    if(unique_by == "text") {
        utils.saveFile(uniqueKeyFile, url.text);
    }
}

async function toPDF(item, link, lastCheckDates){
    return new Promise((resolve, reject) => {
        const type = item["type"];
        const ext = item["ext"];
        const filename = item["filename"];
        const subfolder = item["subfolder"];
        const unique_by = item["unique"];
        const intervalDays = parseInt(item["interval"]) || 1;
        const url = link.href;

        console.log(`[${new Date().toLocaleString()}]: ${url}`);

        const today = new Date().toISOString().split('T')[0];
        const lastCheckDate = lastCheckDates[url] || null;

        let save_dir = SAVE_DIR;
        if(subfolder){
            save_dir = path.join(save_dir, subfolder);
            if (!fs.existsSync(save_dir)) {
                fs.mkdirSync(save_dir, { recursive: true });
            }
        }
        save_dir = path.join(save_dir, filename);

        let checksum_required = false;
        let uniqueKeyFile = null;
        if(unique_by == "checksum"){
            uniqueKeyFile = utils.uniqyeKeyFilePath(link, CHECKSUM_DIR);
            checksum_required = true;
        }else{
            uniqueKeyFile = check_update_by_link(unique_by, save_dir, link);
        }
        if (lastCheckDate) {
            const lastCheck = new Date(lastCheckDate);
            const nextScheduledCheck = new Date(lastCheck);
            nextScheduledCheck.setDate(lastCheck.getDate() + intervalDays);

            if (new Date() < nextScheduledCheck) {
                console.log(`⏳ Next check date: ${nextScheduledCheck.toISOString().split('T')[0]} (${url})`);
                resolve(false);
            }
        }

        // if uniqueKeyFile is null by check_update_by_link, no need to update
        if(uniqueKeyFile){
            if(type == LOAD){
                if(ext == "pdf"){
                    service.fetchPDF(url).then(data =>{
                        if(data){
                            if(checksum_required){
                                if(!utils.handleChecksum(data)){
                                    let result = utils.saveFile(save_dir, data);
                                    if(result){
                                        lastCheckDates[url] = today;
                                        console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                        resolve(true);
                                    }
                                    resolve(false);
                                }
                            }else{
                                let result = utils.saveFile(save_dir, data);
                                if(result){
                                    update_unique_file(unique_by, uniqueKeyFile, link);
                                    lastCheckDates[url] = today;
                                    console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                    resolve(true);
                                }
                                resolve(false);
                            }
                        }else{
                            console.log(`failed to get content: ${url}`);
                            resolve(false);
                        }
                    });
                }else if(ext == "html"){
                    service.fetchHTML(url).then(data => {
                        if(data){
                            if(checksum_required){
                                if(!utils.handleChecksum(data)){
                                    utils.saveHTMLasPDF(save_dir, data).then((result) => {
                                        if(result){
                                            lastCheckDates[url] = today;
                                            console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                            resolve(true);
                                        }
                                        resolve(false);
                                    });
                                }else{
                                    resolve(false);
                                }
                            }else{
                                utils.saveHTMLasPDF(save_dir, data).then((result) => {
                                    if(result){
                                        update_unique_file(unique_by, uniqueKeyFile, link);
                                        lastCheckDates[url] = today;
                                        console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                        resolve(true);
                                    }
                                    resolve(false);
                                });
                            }
                        }else{
                            console.log(`failed to get content: ${url}`);
                            resolve(false);
                        }
                    });
                }else{
                    console.log(`unsupported extension specified: ${ext} for ${url}`);
                    resolve(false);
                }
            }else if(type == GOTO_LOAD){
                if(checksum_required) {
                    utils.savePDFWithGoto(save_dir, url, uniqueKeyFile).then((result) => {
                        if(result){
                            lastCheckDates[url] = today;
                            console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                            resolve(true);
                        }
                        resolve(false);
                    });
                }else{
                    utils.savePDFWithGoto(save_dir, url).then((result) => {
                        if(result){
                            update_unique_file(unique_by, uniqueKeyFile, link);
                            lastCheckDates[url] = today;        
                            console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                            resolve(true);
                        }
                        resolve(false);
                    });
                }
            }else if(type == LOAD_REPLAGE){
                service.fetchHTML(url).then(html => {
                    if (html){
                        if(checksum_required){
                            if(!utils.handleChecksum(html)){
                                utils.saveHTMLasPDF(save_dir, html, url).then((result) => {
                                    if(result){
                                        lastCheckDates[url] = today;
                                        console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                        resolve(true);
                                    }
                                    resolve(false);
                                });
                            }else{
                                resolve(false);
                            }
                        }else{
                            utils.saveHTMLasPDF(save_dir, html, url).then((result) => {
                                if(result){
                                    update_unique_file(unique_by, uniqueKeyFile, link);
                                    lastCheckDates[url] = today;        
                                    console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                                    resolve(true);
                                }else{
                                    resolve(false);
                                }
                            });
                        }
                    }else{
                        console.log(`failed to get content: ${url}`);
                        resolve(false);
                    }
                });
            }else{
                console.log(`undefined loading type: ${type} for ${url}`);
                resolve(false);
            }
        }else{
            console.log(`[${new Date().toLocaleString()}]: no need to update for ${url}`);
            resolve(false);
        }
    });
}

function updateSourceItem(item, linkURL, subfolder){
    let updatedItem = { ...item };
    updatedItem["subfolder"] = subfolder;
    let filename = updatedItem["filename"];
    const placeholders = utils.extructBracedText(filename);
    if(placeholders.length > 0){
        placeholders.forEach(ph => {
            if(ph.includes("YY")){
                filename = utils.replaceDateStr(filename);
            }else if(ph == "filename"){
                const segment = utils.getLastPathSegment(linkURL);
                if(segment != ""){
                    filename = filename.replace("{filename}", segment);
                }else{
                    console.log(`no segment found: ${linkURL}`);
                }
            }else if(ph == "basefilename"){
                const segment = utils.getLastPathSegment(linkURL);
                if(segment != ""){
                    let filename_portions = segment.split(".");
                    if(filename_portions.length == 2){
                        filename = filename.replace("{basefilename}", filename_portions[0]);
                    }else if(filename_portions.length > 2){
                        let basename = filename_portions[0];
                        for(let i = 1; i < filename_portions.length - 1; i++){
                            basename += filename_portions[i];
                        }
                        filename = filename.replace("{basefilename}", basename);
                    }else{
                        console.log(`no segment found: ${linkURL}`);
                    }
                }else{
                    console.log(`no segment found: ${linkURL}`);
                }
            }else{
                console.log(`unkown placeholder: ${ph}`);
            }
        });
    }

    updatedItem["filename"] = filename;
    return updatedItem;
}

async function checkSpecificSource(source, lastCheckDates){
    const customAttr = source["custom"];

    if(customAttr == null){
        const url = source["url"];
        const subfolder = source["subfolder"];
        let tgtItem = updateSourceItem(source, url, subfolder);
        const link = {text: "", href: url};
        await toPDF(tgtItem, link, lastCheckDates);
        return lastCheckDates;
    }else{
        const customType = customAttr["type"];
        const url = source["url"];
        const tgts = customAttr["targets"];
        const subfolder = source["subfolder"];

        if(customType == PARSE) {
            service.extractLinksWithLoading(url).then((links) => {
                let handledUrl = [];
                tgts.forEach(tgt => {
                    const value = tgt["value"];
                    const tgtLinks = utils.filterLinks(links, value);
                    if(tgtLinks.length == 0){
                        console.log(`no link found: ${value}`);
                    }else if (tgtLinks.length > 0) {
                        tgtLinks.forEach(async link => {
                            if(!handledUrl.includes(link.href)){
                                let tgtItem = updateSourceItem(tgt, link.href, subfolder);
                                // to avoid severe load, add await here.
                                await toPDF(tgtItem, link, lastCheckDates);
                                handledUrl.push(link.href);
                            }
                        });
                        return lastCheckDates;
                    }
                });
            });
        }else{
            console.log(`unsupported custom type: ${customType}`);
            return lastCheckDates;
        }
    }
}

async function checkAllUrls() {
    const sourceList = utils.loadJsonFile(URLS_FILE);
    let lastCheckDates = loadLastCheckDates();

    for( const source of sourceList){
        await checkSpecificSource(source, lastCheckDates);
    }
    console.log("updating last check dates");
    fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify(lastCheckDates, null, 2), 'utf-8');
}

// checkAllUrls().then(() => { console.log("done"); });
const sourceList = utils.loadJsonFile(URLS_FILE);
checkSpecificSource(sourceList[1],{}).then(() => { console.log("done"); });