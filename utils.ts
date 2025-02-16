const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const { parse } = require('url');

const service = require('./service.ts');

function filterLinks(links, regexPattern) {
    //ex: const regex = /w_.*\.pdf/;
    const regex = new RegExp(regexPattern); 
    return links.filter(link => regex.test(link.href));
}

function saveFile(path, data) {
    fs.writeFile(path, data, (err) => {
        if (err) {
            console.error(err);
            return false
        }
        return true;
    });
}

async function savePDFWithGoto(path, pageUrl, checksumFile=null, page=null, fileSize="A4") {

    let browser = null;
    if(page == null){
        browser = await puppeteer.launch();
        page = await browser.newPage();
    }

    try{
        // loading images
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 0 })

        if(checksumFile != null){
            const html = await page.content();
            if(handleChecksum(checksumFile, html))
                return false;
        }

        await page.pdf({
            path: path,
            format: fileSize,
            printBackground: false,
            displayHeaderFooter: false,
        });
        return true;
    }catch(err){
        console.log(err);
        return false;
    }finally{
        if(browser != null)
            await browser.close();
    }
}

async function saveHTMLasPDF(path, html, pageUrl=null, fileSize="A4")  {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    try{
        if(pageUrl != null) {
            const baseURL = new URL('.', pageUrl).href;
            await page.setContent(html, { waitUntil: 'load', base: baseURL});
            await page.evaluate((baseURL) => {
                document.querySelectorAll('img').forEach(img => {
                    console.log(img);
                if (!img.src.startsWith('http')) {
                    let newUrl = new URL(img.getAttribute('src'), baseURL).href;
                    console.log(img.getAttribute('src'));
                    console.log(newUrl);
                    img.src = newUrl;
                }else{
                    console.log(`start with http: ${img.src}`);
                }
                });
            }, baseURL);
        }else{
            await page.setContent(html, { waitUntil: 'load'});
        }
        // Wait until all contents are loaded
        await page.evaluateHandle(() => {
            return Promise.all(
            Array.from(document.images).map(img => 
                img.complete ? Promise.resolve() : new Promise(resolve => img.onload = resolve)
            )
            );
        });

        await page.evaluate(() => {
            const style = document.createElement('style');
            style.innerHTML = `
            @media print {
                img { max-width: 100% !important; height: auto !important; }
                body { width: 100%; margin: 0; padding: 0; }
            }
            `;
            document.head.appendChild(style);
        });

        await page.pdf({
            path: path,
            format: fileSize,
            printBackground: false,
            displayHeaderFooter: false,
        });
        return true;
    }catch(err){
        console.log(err);
        return false;
    }finally{
        await browser.close();
    }
}

async function saveDialogFromPage(filename, clickElement, modalElement, txtElements, page) {
    return new Promise(async (resolve, reject) => {
        try{
            await page.waitForSelector(clickElement, { visible: true });
            await page.click(clickElement);

            // wait for modal dialog
            await page.waitForSelector(modalElement, { visible: true });

            // get text content
            const textContent = await page.evaluate((modalElement, txtElements) => {
                const modal = document.querySelector(modalElement);
                if (!modal) return null;

                let textArray = [];
                txtElements.split(',').forEach(txtElement => {
                    if(!txtElement) return;
                    if(txtElement.startsWith(' ')) txtElement = txtElement.slice(1);
                    if(txtElement.endsWith(' ')) txtElement = txtElement.slice(0, -1);
                    
                    if(txtElement == "p"){
                        let pTexts = Array.from(modal.querySelectorAll('p')).map(p => p.textContent.trim());
                        textArray.push(...pTexts);
                        return;
                    }else{
                        let texts = modal.querySelector(txtElement)?.textContent.trim() || '';
                        if(texts)
                            textArray.push(texts);
                    }
                });

                return textArray.join('\n');
            }, modalElement, txtElements);

            if(textContent){
                fs.writeFileSync(filename, textContent, 'utf-8');
                resolve(true);
            }else{
                console.log(`no text content found: ${filename}`);
                resolve(false);
            }
        }catch(err){
            console.log(err);
            reject(err);
        }
    });
}

async function extractElementsFromPage(page, selector) {
    try{
      const elements = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector)).map(element => {
            if(element.tagName == "A"){
                return element.href;
            }else if (element.tagName == "IMG" || element.tagName == "VIDEO" || element.tagName == "AUDIO"){
                return element.src;
            }else if(element.tagName == "DIV"){
                return element.textContent;
            }else if(element.tagName == "SPAN"){
                return element.textContent;
            }else if(element.tagName == "INPUT"){
                return element.value;
            }else if(element.tagName == "SELECT"){
                return element.options[element.selectedIndex].text;
            }else if(element.tagName == "TEXTAREA"){
                return element.value;
            }else if(element.tagName == "TABLE"){
                return element.outerHTML;
            }else if (element.tagName == "UL" || element.tagName == "OL"){
                return Array.from(element.children).join("\n");
            }else if(element.tagName == "LI"){
                return element.textContent;
            }
        }, selector);
      }, selector);    
  
      return elements;
    } catch (error) {
      console.error(error.message);
      return [];
    }
}

function loadFile(path, asString=true) {
    try {
        const bufferData = fs.readFileSync(path, "utf-8").trim();
        if(asString)    {
            const data = bufferData.toString()
            return data;
        }
        return bufferData;
    } catch (err) {
        console.log(err);
        return null;
    }
}

function loadJsonFile(path) {
    try {
        var data = loadFile(path, true);
        if(data != null) {
            return JSON.parse(data);
        }else{
            return null;
        }
    } catch(err) {
        console.log(err);
        return null;
    }
}

function extructBracedText(str) {
    if(!str) return [];
    const matches = str.match(/\{([^{}]+)\}/g);
    return matches ? matches.map(m => m.slice(1, -1)) : [];
}

function replaceDateStr(text){
    text = replaceYYYYMMDD(text);
    text = replaceYYMMDD(text);
    text = replaceYYYYMM(text);
    text = replaceYYMM(text);
    return text;
}

function replaceYYMM(text) {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2, 4);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const todayStr = `${yy}${mm}`;

    return text.replace("{YYMM}", todayStr);
}

function replaceYYYYMM(text) {
    const today = new Date();
    const yy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const todayStr = `${yy}${mm}`;

    return text.replace("{YYYYMM}", todayStr);
}

function replaceYYYYMMDD(text) {
    const today = new Date();
    const yy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yy}${mm}${dd}`;

    return text.replace("{YYYYMMDD}", todayStr);
}

function replaceYYMMDD(text) {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(2, 4);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yy}${mm}${dd}`;

    return text.replace("{YYMMDD}", todayStr);
}

function getLastPathSegment(urlString) {
    const pathname = parse(urlString).pathname;
    return path.basename(pathname);
}

function getHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function uniqyeKeyFilePath(link, base_dir="./"){
    let url = new URL(link.href);
    try{
        let key = url.host.replace(/\./g, "_") + url.pathname.replace(/\//g, "_").replace(/\..*/g, ".txt")
        return path.join(base_dir, key);
    }catch(err){
        console.log(`error on cache key generation: ${url}`);
        return null;
    }
}

/**
 * if checksum is the same, return true;
 * @param checksumFile filepath of previous checksum result
 * @param html html content data
 * @param updateFile if true (default), update checksum result file
 * @returns bool
 */
function handleChecksum(checksumFile, html, updateFile=true){
    let oldHash = null;
    if (fs.existsSync(checksumFile)) {
        oldHash = fs.readFileSync(checksumFile, 'utf-8').trim();
    }else{
        return false;
    }

    const newHash = getHash(html);
    if(newHash == oldHash){
        return true;
    }else{
        if(updateFile){
            fs.writeFileSync(checksumFile, newHash, 'utf-8');
        }
        return false;
    }
}

/**
 * return keyfile if the link contains updates.
 * @param unique_by str
 * @param save_dir str
 * @param link {str: text, str: url}
 * @returns string
 */
function check_update_by(unique_by, save_dir, link, checksum_path, page=null){
    if(unique_by == "segment") {
        if (fs.existsSync(save_dir)) {
            // console.log(`The same file already exists: ${link.href}`);
            return null;
        }
        return save_dir;
    }else if(unique_by == "text") {
        const key_file = uniqyeKeyFilePath(link, checksum_path);
        if (fs.existsSync(key_file)) {
            const newValue = link.text;
            const oldValue = loadFile(key_file);
            if(newValue == oldValue){
                return null;
            }else{
                return key_file;
            }
        }
        return key_file;
    }else if(unique_by == "checksum"){
        const key_file = uniqyeKeyFilePath(link, checksum_path);
        return key_file;
    }else if(typeof unique_by == "object"){
        const type = unique_by["type"];
        if(type == "selector"){
            if(page == null){
                console.log("page is required for selector type of unique_by");
                return null;
            }
            const selector = unique_by["selector"];
            const key_file = uniqyeKeyFilePath(link, checksum_path);
            if (fs.existsSync(key_file)) {
                const newValues = extractElementsFromPage(page, selector);
                if(newValues && newValues.length > 0){
                    const newValue = newValues[0];
                    const oldValue = loadFile(key_file);
                    if(newValue == oldValue){
                        return null;
                    }else{
                        return key_file;
                    }
                }else{
                    return key_file;
                }
            }
            return key_file;
        }
    }
    console.log(`undefined unique method may be specified: ${unique_by}`);
    return null;
  }
  
  function update_unique_file(unique_by, uniqueKeyFile, url){
    if(unique_by == "text") {
        saveFile(uniqueKeyFile, url.text);
    }
  }
  
  function updateSourceItem(item, linkURL, subfolder){
    let updatedItem = { ...item };
    updatedItem["subfolder"] = subfolder;
    let filename = updatedItem["filename"];
    const placeholders = extructBracedText(filename);
    if(placeholders.length > 0){
        placeholders.forEach(ph => {
            if(ph.includes("YY")){
                filename = replaceDateStr(filename);
            }else if(ph == "filename"){
                const segment = getLastPathSegment(linkURL);
                if(segment != ""){
                    filename = filename.replace("{filename}", segment);
                }else{
                    console.log(`no segment found: ${linkURL}`);
                }
            }else if(ph == "basefilename"){
                const segment = getLastPathSegment(linkURL);
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

module.exports = {
    loadFile, loadJsonFile, filterLinks, saveFile, saveHTMLasPDF, savePDFWithGoto, extructBracedText,
    extractElementsFromPage, updateSourceItem, check_update_by, update_unique_file, getHash,
    replaceDateStr, getLastPathSegment, uniqyeKeyFilePath, handleChecksum, saveDialogFromPage
}