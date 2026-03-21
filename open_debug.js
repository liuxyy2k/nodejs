import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,       // 显示浏览器
    devtools: true,        // 自动打开 DevTools
    args: [
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();

  // 🔥 关键：页面加载前注入（绕过反调试）
  await page.evaluateOnNewDocument(() => {
    const noop = () => {};

    // 禁止刷新
    window.location.reload = noop;
    window.location.assign = noop;
    window.location.replace = noop;

    // 禁止关闭
    window.close = noop;

    // 干掉 debugger
    setInterval(() => {
      Function.prototype.constructor = () => {};
    }, 1000);

    // 防 DevTools 检测
    Object.defineProperty(window, 'outerWidth', {
      get: () => window.innerWidth
    });
  });

  // 👉 打开目标页面
  await page.goto('https://huavod.com/vodshow/1.html', {
    waitUntil: 'domcontentloaded'
  });

})();