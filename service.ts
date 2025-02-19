const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const axios = require("axios");
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');

const utils = require('./utils.ts');

// Operation Types for loading content
const LOAD = "load"; // simply load html content
const GOTO_LOAD = "goto_load"; // load a page with puppeteer.
const LOAD_REPLAGE = "load_rep"; // After geeting the html, replace image url with base

// Custom types
const PARSE = "link_parse"; // if url is not fixed, parse links from html
const DIALOG = "save_dialog"; // After dialog is shown, save the dialog content
const ELEMENT_PARSE = "element_parse"; // parse elements from html

async function fetchArrayBuffer(url){
  return new Promise(async (resolve, reject) => {
    let filename = null;

    const headResponse = await axios.head(url);
    // Obtain filename from Content-Disposition
    const contentDisposition = headResponse.headers['content-disposition'];
    if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
            filename = match[1];
        }
    }
    axios({
        method: "get",
        url: url,
        responseType: 'arraybuffer'})
    .then((response) => {
        resolve({filename, data: response.data});
    }).catch((err) =>{
        reject(err);
    });
  });
}

function fetchContent(url) {
  return new Promise((resolve, reject) => {
    axios({
      method: "get",
      url: url
    })
    .then((response) => {
        resolve(response.data);
    }).catch((err) =>{
        reject(err);
    });
  });
}

async function fetchContentWithGoto(url, page=null) {
  let close_broser = false;
  if(page == null){
    const browser = await puppeteer.launch();
    const page = await browser.newPage();  
    close_broser = true;
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 300000 });
    const html = await page.content();
    return html;

  } catch (error) {
    console.error(error.message);
  } finally {
    if(close_broser)
      await browser.close();
  }
}

async function extractLinks(url) {
  const html = await fetchContent(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const links = Array.from(document.querySelectorAll('a'));

  return links.map(link => ({
    text: link.textContent?.trim(),
    href: link.href
  }));
}

async function extractLinksWithLoading(url, page=null) {
  let browser = null;
  if(page == null){
    browser = await puppeteer.launch();
    page = await browser.newPage();  
  } 
  try{
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 300000});
    // await page.waitForSelector('.class_name');
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(link => ({
        text: link.textContent?.trim(),
        href: link.href
      }));
    });

    return links;
  } catch (error) {
    console.error(error.message);
    return [];
  } finally {
    if(browser != null)
      await browser.close();
  }
}

async function initializePage(browser){
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
  await page.setJavaScriptEnabled(true);
  return page;
}

async function checkSpecificSource(browser, source, lastCheckDates, checksum_path, save_dir, subfolder=null, page=null){
  const customAttrs = source["custom"];
  let subfolder_path = null;
  if(subfolder){
      subfolder_path = subfolder;
  }else{
      subfolder_path = source["subfolder"];
  }

  if(customAttrs == null){
      const url = source["url"];
      const tgtItem = utils.updateSourceItem(source, url, subfolder_path);
      const link = {text: "", href: url};
      if (page == null){
          page = await initializePage(browser);
          await page.goto(url, { waitUntil: 'networkidle0', timeout: 300000 });
      }
      await saveToFile(tgtItem, link, lastCheckDates, page, checksum_path, save_dir);
      return lastCheckDates;
  }else{
      
      for(const customAttr of customAttrs){
          const customType = customAttr["type"];
          const url = source["url"];
          const tgts = customAttr["targets"];

          if(customType == PARSE) {
              let operation_page = null;
              if(page == null){
                  operation_page = await initializePage(browser);
              }else{
                  operation_page = page;
              }
              extractLinksWithLoading(url, operation_page).then(async (links) => {
                  let handledUrl = [];
                  // handle targets subsequently with the same operation_page instance
                  for(const tgt of tgts){
                      const value = tgt["value"];
                      const tgtLinks = utils.filterLinks(links, value);
                      if(tgtLinks.length == 0){
                          console.log(`no link found: ${value}`);
                      }else if (tgtLinks.length > 0) {
                          await Promise.all(tgtLinks.map(async link => {
                              if(!handledUrl.includes(link.href)){
                                  let tgtItem = utils.updateSourceItem(tgt, link.href, subfolder_path);
                                  // to avoid severe load, add await here.
                                  const customAttr = tgtItem["custom"];
                                  if(customAttr){
                                      tgtItem["url"] = link.href;
                                      // do not provide page instance as the current page instance may be used
                                      await checkSpecificSource(browser, tgtItem, lastCheckDates, checksum_path, save_dir, subfolder_path);
                                  }else{
                                      await saveToFile(tgtItem, link, lastCheckDates, operation_page, checksum_path, save_dir);
                                      handledUrl.push(link.href);
                                  }
                              }
                          }));
                          return lastCheckDates;
                      }
                  };
              });
          }else if(customType == DIALOG){
              await Promise.all(tgts.map(async tgt => {
                  let operation_page = null;
                  if(page == null){
                      operation_page = await initializePage(browser);
                      await operation_page.goto(url, { waitUntil: 'networkidle0', timeout: 300000 });
                  }else{
                      operation_page = page;
                  }
                  const tgtItem = utils.updateSourceItem(tgt, url, subfolder_path);
                  const filename = tgtItem["filename"];
                  const clickElement = tgtItem["dialog"];
                  const modalElement = tgtItem["element"];
                  const txtElements = tgtItem["value"];
                  const save_path = path.join(save_dir, subfolder_path, filename);

                  await utils.saveDialogFromPage(save_path, clickElement, modalElement, txtElements, operation_page);
                  return lastCheckDates;
              }));
          }else if(customType == ELEMENT_PARSE){
              await Promise.all(tgts.map(async tgt => {
                  let operation_page = null;
                  if(page == null){
                      operation_page = await initializePage(browser);
                      await operation_page.goto(url, { waitUntil: 'networkidle0', timeout: 300000 });
                  }else{
                      operation_page = page;
                  }
                  const selector = tgt["selector"];
                  const customAttr = tgt["custom"];
                  const unique_by = tgt["unique"];
                  let needUpdate = true;
                  if(typeof unique_by == "object"){
                      const uniqueKeyFile = utils.check_update_by(unique_by, save_dir, {text: "", href: url}, checksum_path, operation_page);
                      // if uniqueKeyFile is null, no need to update
                      if(uniqueKeyFile == null){
                          needUpdate = false;
                          console.log(`[${new Date().toLocaleString()}]: no need to update for ${url}`);
                      }
                  }

                  if(needUpdate){
                      let values = await utils.extractElementsFromPage(operation_page, selector);
                      if (values.length == 0) {
                          // check iframe
                          values = [];
                          const frames = await operation_page.frames();
                          for (const frame of frames) {
                              const frameValues = await utils.extractElementsFromPage(frame, selector);
                              if (frameValues.length > 0) {
                                  values.push(...frameValues);
                              }
                          }
                      }
                      // As we need to process items in sequence, use for loop instead of map
                      for(const value of values){
                          tgt["url"] = value;
                          const tgtItem = utils.updateSourceItem(tgt, value, subfolder_path);
                          if(customAttr){
                              await operation_page.goto(value, { waitUntil: 'networkidle0', timeout: 300000 });
                              await checkSpecificSource(browser, tgtItem, lastCheckDates, checksum_path, save_dir, subfolder_path, operation_page);
                          }else{
                              const link = {text: "", href: value};
                              tgtItem["subfolder"] = subfolder_path;
                              await saveToFile(tgtItem, link, lastCheckDates, operation_page, checksum_path, save_dir);
                          }
                      };
                      return lastCheckDates;
                  }else{
                      console.log(`[${new Date().toLocaleString()}]: no need to update for ${url}`);
                  }
              }));

          }else{
              console.log(`unsupported custom type: ${customType}`);
              return lastCheckDates;
          }
      }
  }
}


async function saveToFile(item, link, lastCheckDates, page, checksum_path, save_dir, uniqueKeyFile=null){
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

      if(subfolder){
          save_dir = path.join(save_dir, subfolder);
          if (!fs.existsSync(save_dir)) {
              fs.mkdirSync(save_dir, { recursive: true });
          }
      }
      save_dir = path.join(save_dir, filename);

      let checksum_required = false;
      if(uniqueKeyFile == null){
          if(unique_by == "checksum"){
              uniqueKeyFile = utils.uniqyeKeyFilePath(link, checksum_path);
              checksum_required = true;
          }else{
              uniqueKeyFile = utils.check_update_by(unique_by, save_dir, link, checksum_path);
          }
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

      // if uniqueKeyFile is null by check_update_by, no need to update
      if(uniqueKeyFile){
          if(type == LOAD){
              if(ext == "pdf"){
                  fetchArrayBuffer(url).then(({filename, data}) => {
                      if(data){
                        if(filename){
                           let dir = path.dirname(save_dir);
                           save_dir = path.join(dir, filename);
                        }
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
                                utils.update_unique_file(unique_by, uniqueKeyFile, link);
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
                const save_ext = path.extname(save_dir);
                if(ext_ext == "pdf"){
                  fetchContent(url).then(data => {
                      if(data){
                          if(checksum_required){
                              if(!utils.handleChecksum(checksum_path, data)){
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
                                      utils.update_unique_file(unique_by, uniqueKeyFile, link);
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
                    savePage(save_dir, page).then((result) => {
                        if(result){
                            lastCheckDates[url] = today;
                            console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                            resolve(true);
                        }
                        resolve(false);
                      });    
                }
              }else{
                  fetchArrayBuffer(url).then(({filename, data}) => {
                        if(data){
                            if(filename){
                                let dir = path.dirname(save_dir);
                                save_dir = path.join(dir, filename);
                            }
                            if(checksum_required){
                                if(!utils.handleChecksum(checksum_path, data)){
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
                                    utils.update_unique_file(unique_by, uniqueKeyFile, link);
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
              }
          }else if(type == GOTO_LOAD){
              if(checksum_required) {
                  utils.savePDFWithGoto(save_dir, url, uniqueKeyFile, page).then((result) => {
                      if(result){
                          lastCheckDates[url] = today;
                          console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                          resolve(true);
                      }
                      resolve(false);
                  });
              }else{
                  utils.savePDFWithGoto(save_dir, url, null, page).then((result) => {
                      if(result){
                          utils.update_unique_file(unique_by, uniqueKeyFile, link);
                          lastCheckDates[url] = today;        
                          console.log(`[${new Date().toLocaleString()}]: saved ${save_dir} for ${url}`);
                          resolve(true);
                      }
                      resolve(false);
                  });
              }
          }else if(type == LOAD_REPLAGE){
              fetchContent(url).then(html => {
                  if (html){
                      if(checksum_required){
                          if(!utils.handleChecksum(checksum_path, html)){
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
                                  utils.update_unique_file(unique_by, uniqueKeyFile, link);
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

async function savePage(outputDir, page) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Obtain url of resources
    const resources = await page.evaluate(() => {
        const urls = [];
        document.querySelectorAll("img, link[rel='stylesheet'], script[src]").forEach((el) => {
            if (el.tagName === "IMG" && el.src) urls.push(el.src);
            if (el.tagName === "LINK" && el.href) urls.push(el.href);
            if (el.tagName === "SCRIPT" && el.src) urls.push(el.src);
        });
        return urls;
    });

    let html = await page.content();

    // save the resources
    for (let resourceUrl of resources) {
        try {
            const urlObj = new URL(resourceUrl);
            
            const resourceFilename = path.basename(urlObj.pathname);
            const pathName = urlObj.pathname;
            const localPath = path.join(outputDir, resourceFilename);

            // download the resource
            const response = await fetchArrayBuffer(resourceUrl);
            if(response){
                fs.writeFileSync(localPath, response.data);

                // replace the resource url with the local path
                html = html.replace(new RegExp(resourceUrl, "g"), resourceFilename);
                html = html.replace(new RegExp(pathName, "g"), resourceFilename);
            }
        } catch (err) {
            console.error(`Failed to download ${resourceUrl}:`, err.message);
        }
    }

    fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf-8");
    console.log("Page saved successfully.");
}

module.exports = {
  fetchArrayBuffer, fetchContent, fetchContentWithGoto, extractLinks, extractLinksWithLoading, checkSpecificSource,
  saveToFile
}