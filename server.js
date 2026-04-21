app.post('/cf', async (req, res) => {
    const { url, referer, key } = req.body;
    if (key !== AUTH_KEY) return res.status(403).send('Unauthorized');
    if (!url) return res.status(400).send('Missing URL');

    console.log(`[统一浏览器模式] ${url}`);

    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        const context = await browser.newContext({
            proxy: { server: PROXY_URL },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'zh-CN',
        });

        const page = await context.newPage();

        // ✅ 隐藏自动化特征
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // ✅ 过 CF
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

        await page.waitForFunction(
            () => document.title !== 'Just a moment...' && document.title !== '请稍候…',
            { timeout: 20000 }
        );

        // ✅ 在浏览器里直接发请求（关键！！！）
        const data = await page.evaluate(async (targetUrl, ref) => {
            const res = await fetch(targetUrl, {
                headers: {
                    'Referer': ref || location.href,
                    'Accept': '*/*'
                },
                credentials: 'include'
            });

            const text = await res.text();
            return {
                status: res.status,
                body: text
            };
        }, url, referer);

        return res.json({
            ...data,
            finalUrl: page.url()
        });

    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        if (browser) await browser.close();
    }
});