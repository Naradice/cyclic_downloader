const https = require('https');
const http = require('http');

const axios = require("axios");
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');

async function fetchPDF(url){
  return new Promise((resolve, reject) => {
    axios({
        method: "get",
        url: url,
        responseType: 'arraybuffer'})
    .then((response) => {
        resolve(response.data);
    }).catch((err) =>{
        reject(err);
    });
  });
}

function fetchHTML(url) {
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

async function fetchHTMLWithGoto(url) {

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle0' });
    const html = await page.content();
    return html;

  } catch (error) {
    console.error(error.message);
  } finally {
    await browser.close();
  }
}

async function extractLinks(url) {
  const html = await fetchHTML(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const links = Array.from(document.querySelectorAll('a'));

  return links.map(link => ({
    text: link.textContent?.trim(),
    href: link.href
  }));
}

async function extractLinksWithLoading(url) {

  const browser = await puppeteer.launch(
    // {
    //   headless: false, // ヘッドレスをオフにして確認
    //   args: ['--no-sandbox', '--disable-setuid-sandbox']
    // }
  );
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(true);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0});
    // await page.waitForSelector('.class_name');
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(link => ({
        text: link.textContent?.trim(),
        href: link.href
      }));
    });

    // test code
    // const fs = require('fs');
    // const html = await page.content();
    // fs.writeFile("./test.html", html, (err) => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
  

    return links;
  } catch (error) {
    console.error(error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = {
  fetchPDF, fetchHTML, fetchHTMLWithGoto, extractLinks, extractLinksWithLoading
}