import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({
    headless: false,                          // 必须有头
    args: [
        '--remote-debugging-port=9222',       // 开启远程调试
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
    ],
});

const page = await browser.newPage();
await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
);

await page.goto('https://upload18.org/play/index/fnk-038', {
    waitUntil: 'networkidle2',
    timeout: 30000,
});

console.log('✅ 页面已打开');
console.log('📌 现在用你的 Chrome 访问 http://localhost:9222');
console.log('👆 点击页面链接，就能打开正常的 DevTools');

// 保持运行，不要关
await new Promise(() => {});