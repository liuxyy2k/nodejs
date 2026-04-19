import express from 'express';
import { gotScraping } from 'got-scraping';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());

const PORT = 3001;
const AUTH_KEY = 'mira123';
const PROXY_URL = 'http://127.0.0.1:7897';

app.post('/proxy', async (req, res) => {
    const { url, referer, key, sniff } = req.body;

    // 1. 安全校验
    if (key !== AUTH_KEY) return res.status(403).send('Unauthorized');
    if (!url) return res.status(400).send('Missing URL');

    // --- 场景 A: Playwright 嗅探模式 (当 sniff 为 true 时) ---
    if (sniff) {
        console.log(`[嗅探模式] 目标: ${url}`);
        let browser;
        try {
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext({
                proxy: { server: PROXY_URL },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            });
            const page = await context.newPage();

            let m3u8Url = null;
            // 监听请求嗅探 m3u8
            page.on('request', request => {
                const u = request.url();
                if (u.includes('.m3u8') && !u.includes('ads')) {
                    m3u8Url = u;
                }
            });

            // 拦截图片视频提速
            await page.route('**/*.{png,jpg,jpeg,gif,webp,mp4}', route => route.abort());

            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // 循环等待最多 8 秒直到抓到链接
            let timer = 0;
            while (!m3u8Url && timer < 8) {
                await page.waitForTimeout(1000);
                timer++;
            }

            if (m3u8Url) {
                return res.json({ m3u8: m3u8Url });
            } else {
                return res.status(404).send('未嗅探到 m3u8');
            }
        } catch (err) {
            return res.status(500).send(`嗅探失败: ${err.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }

    // --- 场景 B: 普通 got-scraping 抓取模式 ---
    console.log(`[普通请求] 目标: ${url}`);
    try {
        const response = await gotScraping({
            url: url,
            proxyUrl: PROXY_URL,
            http2: true,
            headers: {
                'Referer': referer || '',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            timeout: { request: 30000 },
            https: { rejectUnauthorized: false }
        });
        res.send(response.body);
    } catch (error) {
        console.error('抓取失败:', error.message);
        res.status(500).send(`代理转发失败: ${error.message}`);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`多功能中转服务运行中: ${PORT}`));