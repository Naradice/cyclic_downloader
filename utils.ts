const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer');

const { parse } = require('url');

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

async function savePDFWithGoto(path, pageUrl, checksumFile=null, fileSize="A4") {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

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

module.exports = {
    loadFile, loadJsonFile, filterLinks, saveFile, saveHTMLasPDF, savePDFWithGoto, extructBracedText,
    replaceDateStr, getLastPathSegment, uniqyeKeyFilePath, handleChecksum
}