import express from 'express';
import { gotScraping } from 'got-scraping';
import { Curl } from 'node-libcurl';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
chromium.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = 3001;
const AUTH_KEY = 'mira123';
const PROXY_URL = 'http://127.0.0.1:7897';

async function curlFetch(url, proxy, referer) {
    const args = [
        '-sSL',
        '--proxy', proxy,
        '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
        '-H', `Referer: ${referer || ''}`,
        '--insecure',
        '--max-time', '30',
        url
    ];
    const { stdout } = await execFileAsync('curl', args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
}

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
		const body = await curlFetch(url, PROXY_URL, referer);
		// ✅ 加这个检测，返回拦截页也触发降级
		if (body.includes('Just a moment') || body.includes('just a moment')) {
			throw new Error('curl 返回 CF 拦截页');
		}
		res.send(body);
    } catch (error) {
		console.warn('[curl失败] 降级 Playwright CF模式:', error.message);
		try {
			const html = await playwrightCfFetch(url, referer);
			return res.send(html);
		} catch (err) {
			console.error('Playwright CF 也失败:', err.message);
			res.status(500).send(`代理转发失败: ${err.message}`);
		}
    }
});

// ✅ 抽出公共函数，/cf 和场景B 都用这个
async function playwrightCfFetch(url, referer) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu',
        ],
    });
    try {
        const context = await browser.newContext({
            proxy: { server: PROXY_URL },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            extraHTTPHeaders: {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                ...(referer ? { Referer: referer } : {}),
            },
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (params) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(params);
            Object.defineProperty(navigator, 'connection', {
                get: () => ({ rtt: 100, downlink: 10, effectiveType: '4g' }),
            });
            Object.defineProperty(screen, 'width', { get: () => 1920 });
            Object.defineProperty(screen, 'height', { get: () => 1080 });
        });
        await page.route('**/*.{png,jpg,jpeg,gif,webp,mp4,woff,woff2}', route => route.abort());
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForFunction(
            () => document.title !== 'Just a moment...' && document.title !== '请稍候…',
            { timeout: 20000, polling: 1000 }
        );
        return await page.content();
    } finally {
        await browser.close();
    }
}

async function flareFetch(url) {
    const host = new URL(url).host;
    
    // 先查缓存
    const cached = getCachedCookie(host);
    if (cached) {
        console.log('[Flare缓存] 直接用 curl');
        const body = await curlFetch(url, PROXY_URL, '');
        if (!isCfChallenge(body)) return body;
        // cookie 失效就清掉重新走 FlareSolverr
        cfCookieCache.delete(host);
    }

    // 没缓存才开 FlareSolverr
    console.log('[FlareSolverr] 获取 cookie...');
    const response = await fetch('http://127.0.0.1:8191/v1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 })
    });
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(data.message);

    // 存 cookie 缓存
    const cookieStr = data.solution.cookies.map(c => `${c.name}=${c.value}`).join('; ');
    setCachedCookie(host, cookieStr);

    return data.solution.response;
}


function isCfChallenge(html) {
    return (
        html.includes('cf-browser-verification') ||
        html.includes('cf_chl_opt') ||
        html.includes('challenge-platform') ||
        html.includes('Just a moment') ||
        html.includes('jschl_vc') ||
        html.includes('Checking your browser')
    );
}

// ── CF Cookie 缓存 ──────────────────────────────────────────────
const cfCookieCache = new Map();
// { host -> { cookies: string, expireAt: number } }

function getCachedCookie(host) {
    const cache = cfCookieCache.get(host);
    if (cache && Date.now() < cache.expireAt) {
        console.log(`[CF缓存] 命中 ${host}`);
        return cache.cookies;
    }
    return null;
}

function setCachedCookie(host, cookies) {
    cfCookieCache.set(host, {
        cookies,
        expireAt: Date.now() + 1000 * 60 * 25, // 缓存 25 分钟
    });
}

// 路由二 Playwright 过 Cloudflare /cf 
app.post('/cf', async (req, res) => {
    const { url, referer, force , key } = req.body;
	if (key !== AUTH_KEY) return res.status(403).send('Unauthorized');
    if (!url) return res.status(400).send('Missing URL');

    const host = new URL(url).host;

    // 有缓存直接用 got-scraping 请求，不开浏览器
    const cached = !force && getCachedCookie(host);
    if (cached) {
        console.log(`[CF缓存请求] 目标: ${url}`);
        try {
            const response = await gotScraping({
                url,
                proxyUrl: PROXY_URL,
                http2: true,
                headers: {
                    'Cookie': cached,
                    'Referer': referer || `https://${host}/`,
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                timeout: { request: 30000 },
                https: { rejectUnauthorized: false },
            });

            // 如果返回 CF 挑战页说明 cookie 已失效，清缓存重走浏览器
            if (response.body.includes('cf_chl_opt') || response.body.includes('请稍候') || response.body.includes('Just a moment')) {
                console.log('[CF缓存] cookie 已失效，重新过盾');
                cfCookieCache.delete(host);
            } else {
                return res.json({ html: response.body, cookies: cached, fromCache: true });
            }
        } catch (err) {
            cfCookieCache.delete(host);
            console.log('[CF缓存] 请求失败，重新过盾:', err.message);
        }
    }

    // 没缓存或缓存失效，开浏览器过盾
    console.log(`[CF绕过模式] 目标: ${url}`);
    let browser;
    try {
        // 随机延迟 1~3 秒，避免频繁请求被限速
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
        });

        const context = await browser.newContext({
            proxy: { server: PROXY_URL },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
            timezoneId: 'Asia/Shanghai',
            extraHTTPHeaders: {
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                ...(referer ? { Referer: referer } : {}),
            },
        });

        const page = await context.newPage();

        await page.addInitScript(() => {
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (params) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(params);
            Object.defineProperty(navigator, 'connection', {
                get: () => ({ rtt: 100, downlink: 10, effectiveType: '4g' }),
            });
            Object.defineProperty(screen, 'width', { get: () => 1920 });
            Object.defineProperty(screen, 'height', { get: () => 1080 });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

        try {
            await page.waitForFunction(
                () => document.title !== 'Just a moment...' && document.title !== '请稍候…',
                { timeout: 20000, polling: 1000 }
            );
            console.log('[CF绕过] 挑战通过，标题:', await page.title());
        } catch {
            return res.status(403).send('CF 挑战超时未通过，请更换 IP 或代理');
        }

        const cookies = await context.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // 存入缓存
        setCachedCookie(host, cookieStr);

        return res.json({
            html: await page.content(),
            finalUrl: page.url(),
            cookies: cookieStr,
            fromCache: false,
        });

    } catch (err) {
        console.error('[CF绕过] 失败:', err.message);
        res.status(500).send(`CF绕过失败: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`多功能中转服务运行中: ${PORT}`));