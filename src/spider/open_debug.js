const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true
  });

  const page = await browser.newPage();

  // 👇 抓所有请求
  page.on('request', req => {
    const url = req.url();

    if (url.includes('token') || url.includes('m3u8')) {
      console.log('👉 请求:', url);
    }
  });

  page.on('response', async res => {
    const url = res.url();

    if (url.includes('m3u8')) {
      console.log('🔥 m3u8:', url);
    }

    if (url.includes('token')) {
      const text = await res.text();
      console.log('🔥 token返回:', text);
    }
  });

  await page.goto('https://upload18.org/play/index/ure-042', {
    waitUntil: 'networkidle2'
  });

})();