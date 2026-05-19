import express from 'express';
import { gotScraping } from 'got-scraping';
import { load } from 'cheerio';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { promisify } from 'util';
import mysql from 'mysql2/promise';
import { execFile } from 'child_process';
const execFileAsync = promisify(execFile);
chromium.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = 3001;
//代理
const PROXY_URL = 'http://127.0.0.1:7897';
const OMIM_BASE = 'https://www.omim.org';

// ── 数据库连接池 ──────────────────────────────────────────────
const db = mysql.createPool({
    host: '192.168.0.44',
    port: 3991,    
    user: 'root',
    password: `*8ZiGKj@^9_0z1H63Y`,
    database: 'knowledge_test',
    waitForConnections: true,
    connectionLimit: 10,
});

// ── 从数据库读取待爬取的 MIM 号 ───────────────────────────────
async function getPendingMimNumbers() {
    const [rows] = await db.query(
        `SELECT OMIM_Number FROM mim2gene WHERE type != 'moved/removed'`
    );
    return rows.map(r => r.OMIM_Number);
}

// ── 入库 ──────────────────────────────────────────────────────
async function saveOmimEntry(data) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // 基因疾病关系表
        if (data.phenotypeMap?.length) {
            for (const item of data.phenotypeMap) {
                await conn.query(
                    `INSERT INTO gene_omim_phenotype
                        (omim_number, gene_locus_mim_number, symbol, phenotype_mim_number, Inheritance, pheno_map_key, phenotype, description, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [data.mimNumber, item.geneMim ? item.geneMim : data.mimNumber, item.gene ? item.gene : data.symbol, item.phenotypeMim, item.inheritance, item.mappingKey, item.phenotype, data.description || '']
                );
            } 
        }

        //疾病描述表
        if (data.description) {
            await db.query(
                'DELETE FROM gene_omim_description WHERE omim = ?',
                [data.mimNumber]
            );
            await conn.query(
                `INSERT INTO gene_omim_description
                    (omim, text_content, description, create_time, update_time)
                VALUES (?, ?, ?, NOW(), NOW())`,
                [data.mimNumber, '', data.description]
            );
        }

        // 疾病表型表
        if (data.clinicalSynopsis?.length) {
            await conn.query(
                'DELETE FROM omim_phenotype_hpo WHERE phenotype_mim_number = ?',
                [data.mimNumber]
            );
            for (const item of data.clinicalSynopsis) {
                await conn.query(
                    `INSERT INTO omim_phenotype_hpo (phenotype_mim_number, hpo_id, create_time)
                        VALUES (?, ?, NOW())`,
                    [data.mimNumber, item]
                );
            }
        }
        await conn.commit();
        console.log(`[入库] ${data.mimNumber} 完成`);
    } catch (err) {
        await conn.rollback();
        // 标记失败
        await db.query(
            'UPDATE mim2gene SET status = ? WHERE OMIM_Number = ?',
            ['failed', data.mimNumber]
        );
        throw err;
    } finally {
        conn.release();
    }
}

// ── CF Cookie 缓存（沿用原逻辑，25 分钟） ──────────────────────
const cfCookieCache = new Map();

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
        expireAt: Date.now() + 1000 * 60 * 25,
    });
}

// ── 通用：用缓存 Cookie 直接 GET ────────────────────────────────
async function fetchWithCookie(url, cookieStr, referer) {
    const host = new URL(url).host;
    const response = await gotScraping({
        url,
        proxyUrl: PROXY_URL,
        http2: true,
        headers: {
            Cookie: cookieStr,
            Referer: referer || `https://${host}/`,
            'Accept-Language': 'en-US,en;q=0.9',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: { request: 30000 },
        https: { rejectUnauthorized: false },
    });
    return response.body;
}

// ── 通用：Playwright 过盾，返回 { html, cookies } ───────────────
async function bypassCF(url, referer) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--disable-blink-features=AutomationControlled', // ← 关键
            '--use-gl=swiftshader',                          // ← 不能 disable-gpu
            '--enable-webgl',
            `--proxy-server=http://127.0.0.1:7897`,
        ],
    });

    try {
        const context = await browser.newContext({
            // proxy: { server: PROXY_URL },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'en-US',           // ← 改成英文
            timezoneId: 'America/New_York',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                ...(referer ? { Referer: referer } : {}),
            },
        });

        const page = await context.newPage();

        await page.addInitScript(() => {
            // 最关键：隐藏 webdriver
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

            // 伪造插件（空插件列表是 headless 特征）
            Object.defineProperty(navigator, 'plugins', {
                get: () => ({ length: 3, 0: { name: 'Chrome PDF Plugin' }, 1: { name: 'Chrome PDF Viewer' }, 2: { name: 'Native Client' } }),
            });

            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

            // permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (params) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(params);
        });

        await page.route('**/*.{png,jpg,jpeg,gif,webp,mp4,woff,woff2}', route => route.abort());

        // ← waitUntil 改成 load，等 CF 的 JS 有机会执行
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        // ← 不等 title，直接等 OMIM 自己的内容元素出现
        try {
            await page.waitForSelector('#content, #mimContent, .entry', {
                timeout: 60000,
            });
            console.log('[CF绕过] 成功，检测到 OMIM 内容');
        } catch {
            // 截图留证，方便排查
            // await page.screenshot({ path: `./cf_fail_${Date.now()}.png`, fullPage: true });
            const title = await page.title();
            throw new Error(`CF 未通过，当前页面标题: ${title}`);
        }
        
        const cookies = await context.cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        setCachedCookie(new URL(url).host, cookieStr);
        return { html: await page.content(), cookies: cookieStr };

    } finally {
        await browser.close();
    }
}

// ── 获取有效 HTML（先查缓存，不行再过盾）──────────────────────
async function getHtml(url, force = false) {
    const host = new URL(url).host;
    const cached = !force && getCachedCookie(host);

    if (cached) {
        try {
            const html = await fetchWithCookie(url, cached);
            const isCFBlock = html.includes('cf_chl_opt') || html.includes('Just a moment');
            if (!isCFBlock) return { html, cookies: cached, fromCache: true };
            console.log('[CF缓存] cookie 失效，重新过盾');
            cfCookieCache.delete(host);
        } catch (e) {
            console.log('[CF缓存] 请求失败:', e.message);
            cfCookieCache.delete(host);
        }
    }

    const result = await bypassCF(url);
    return { ...result, fromCache: false };
}

// ════════════════════════════════════════════════════════════════
//  OMIM 解析工具函数
// ════════════════════════════════════════════════════════════════

/**
 * 解析 OMIM Entry 页面（/entry/XXXXXX）
 * 返回结构化数据：MIM号、标题、别名、基因型、临床概要、参考文献等
 */
function parseOmimEntry(html) {
    const $ = load(html);
    const result = {};

    const mainDiv = $('.col-lg-8.col-lg-pull-2.col-md-8');
    if (!mainDiv.length) {
        console.error('[解析] 页面标题:', $('title').text());
        return { error: '页面解析失败', title: $('title').text() };
    }
    // ── MIM号 + 前缀符号 ──────────────────────────────────────
    result.prefix = mainDiv.find('.text-danger strong').first().text().trim(); // #  * % +
    // 1. 抓取 OMIM 编号及前缀符号
    const numberSpan = mainDiv.find('span.h3 .mim-font');
    const mimSign = numberSpan.find('strong').text().trim(); // 例如: "#"
    // 移除符号和多余换行，只保留纯数字
    const mimNumber = numberSpan.text().replace(mimSign, '').replace(/\s+/g, '').trim();
    result.mimNumber = mimNumber;
    //── 基因 ─────────────────────────────────────────────────
    result.symbol = mainDiv.find('#approvedGeneSymbols').next('p').find('.mim-tip-hint').text().trim();

    // ── 基因疾病关系表格 ────────────────────
    result.phenotypeMap = [];
    let currentLocation = '';
    mainDiv.find('table.table.table-bordered.table-condensed.table-hover.small.mim-table-padding tbody tr').each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length === 0) return;

        let colIndex = 0;
        let location = '';

        // 1. 判断第一列是否被合并。如果含有 rowspan，说明它是新的一组 location
        const firstCol = $(cols[0]);
        if (firstCol.attr('rowspan')) {
            currentLocation = firstCol.text().trim();
            location = currentLocation;
            colIndex = 1; // 接下来的数据从索引 1 开始拿
        } else if (cols.length === 4) { 
            // 2. 如果这一行只有 4 个 td，说明 location 被上面行 rowspan 吞掉了，直接沿用缓存
            location = currentLocation;
            colIndex = 0; // 数据直接从索引 0 开始拿
        } else if (cols.length >= 5) {
            // 3. 兜底处理：如果是不带 rowspan 的普通标准 5 列或以上行
            currentLocation = firstCol.text().trim();
            location = currentLocation;
            colIndex = 1;
        } else {
            // 列数异常（比如小于 4 列），直接跳过
            return;
        }

        // 3. 严格根据相对偏移量（colIndex）提取后面的字段
        result.phenotypeMap.push({
            location:      location,
            phenotype:     $(cols[colIndex]).text().trim(),
            phenotypeMim:  $(cols[colIndex + 1]).text().trim(),
            inheritance:   $(cols[colIndex + 2]).text().trim(),
            mappingKey:    $(cols[colIndex + 3]).text().trim(),
            gene:          $(cols[colIndex + 4])?.text()?.trim() || '',
            geneMim:       $(cols[colIndex + 5])?.text()?.trim() || '',
        });
    });

    // ── Clinical Synopsis ────────────────────────────────────
    result.clinicalSynopsis = [];
    $('#mimClinicalSynopsisFold').find('a[href*="hpo.jax.org"]').each((index, element) => {
        const hpoText = $(element).text().trim(); 
        if (hpoText && !result.clinicalSynopsis.includes(hpoText)) {
            result.clinicalSynopsis.push(hpoText);
        }
    });

    // ── 各文本节（TEXT / Description / Clinical Features 等）─
    // result.sections = [];
    // mainDiv.find('h4.mimTriangleToggle').each((_, h4) => {
    //     const heading = $(h4).find('strong').last().text().trim();
    //     const foldId = $(h4).attr('href'); // 如 "#mimTextFold"
    //     if (!foldId) return;
    //     const content = $(foldId.replace('#', '#')).find('.mim-text-font').text()
    //         .replace(/\s+/g, ' ').trim().slice(0, 1000);
    //     if (heading) result.sections.push({ heading, content });
    // });

    // ── 疾病描述 ───────────────────────────────────────────────
    result.description = mainDiv.find('div#mimDescriptionFold .mim-text-font p').text().trim();

    // ── 创建/编辑时间 ─────────────────────────────────────────
    const createDate = mainDiv.find('#creationDate').next('div').find('.col-lg-6.col-md-6.col-sm-6.col-xs-6').text().trim() || ''
    result.creationDate = createDate.split(' : ')[1].trim();
    const editHis = mainDiv.find('#editHistory').next('div').find('.col-lg-6.col-md-6.col-sm-6.col-xs-6').text().trim() || ''
    result.editDate = editHis.split(' : ')[1].trim();
    return result;
}

/**
 * 解析 OMIM 搜索结果页 /search?index=entry&search=XXXX
 */
function parseOmimSearch(html) {
    const $ = load(html);
    const results = [];

    // 搜索结果列表
    $('div.search-results .result-item, tr.result, .searchResultItem').each((_, el) => {
        const mimNum = $(el).find('.mimNumber, .mim-number, td:first-child').text().trim();
        const title = $(el).find('.title, .entryTitle, td:nth-child(2)').text().trim();
        const prefix = $(el).find('.prefix').text().trim();
        const url = $(el).find('a').attr('href') || '';
        if (mimNum || title) results.push({ mimNumber: mimNum, prefix, title, url });
    });

    // 总结果数
    const total = $('span.resultCount, .total-results').text().trim();

    return { total, results };
}

// ════════════════════════════════════════════════════════════════
//  路由
// ════════════════════════════════════════════════════════════════

// ── 批量爬取入库（从数据库读任务） ───────────────────────────
app.get('/omim/crawl', async (req, res) => {
     const force = req.query.force === 'true';

    let mimNumbers;
    try {
        mimNumbers = await getPendingMimNumbers();
    } catch (err) {
        return res.status(500).json({ error: '读取数据库失败: ' + err.message });
    }

    if (!mimNumbers.length) {
        return res.json({ message: '没有待处理的任务' });
    }

    console.log(`[批量爬取] 共 ${mimNumbers.length} 条待处理`);
    res.json({ message: `开始处理 ${mimNumbers.length} 条`, mimNumbers });

    // 异步跑，不阻塞响应
    (async () => {
        for (const mim of mimNumbers) {
            const url = `${OMIM_BASE}/entry/${mim}?search=${mim}`;
            console.log(`[爬取] ${url}`);
            try {
                const { html } = await getHtml(url, force);
                const data = parseOmimEntry(html);

                if (data.error) {
                    console.error(`[解析失败] ${mim}:`, data.error);
                    await db.query(
                        'UPDATE mim2gene SET status = ? WHERE OMIM_Number = ?',
                        ['failed', data.mimNumber]
                    );
                } else {
                    await saveOmimEntry(data);
                }
            } catch (err) {
                console.error(`[失败] ${mim}:`, err.message);
            }

            // 每条间隔 5~8 秒
            await new Promise(r => setTimeout(r, 5000 + Math.random() * 3000));
        }
        console.log('[批量爬取] 全部完成');
    })();
});

/**
 * POST /omim/entry
 * body: { mimNumber: "143100", force: false }
 * 返回解析后的结构化 Entry 数据
 */
app.post('/omim/entry', async (req, res) => {
    const { mimNumber, force } = req.body;
    if (!mimNumber) return res.status(400).json({ error: 'mimNumber is required' });

    const url = `${OMIM_BASE}/entry/${mimNumber}`;
    console.log(`[OMIM Entry] 请求: ${url}`);

    try {
        const { html, cookies, fromCache } = await getHtml(url, force);
        const data = parseOmimEntry(html);
        //入库
        await saveOmimEntry(data);
        return res.json({ ...data});
    } catch (err) {
        console.error('[OMIM Entry] 失败:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /omim/entry/raw
 * body: { mimNumber: "143100", force: false }
 * 返回原始 HTML（调试用）
 */
app.post('/omim/entry/raw', async (req, res) => {
    const { mimNumber, force } = req.body;
    if (!mimNumber) return res.status(400).json({ error: 'mimNumber is required' });

    const url = `${OMIM_BASE}/entry/${mimNumber}`;
    try {
        const { html, cookies, fromCache } = await getHtml(url, force);
        res.json({ html, cookies, fromCache });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /omim/search
 * body: { query: "BRCA1", limit: 10, force: false }
 * 返回解析后的搜索结果列表
 */
app.post('/omim/search', async (req, res) => {
    const { query, limit = 10, force } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const url = `${OMIM_BASE}/search?index=entry&search=${encodeURIComponent(query)}&limit=${limit}&start=0`;
    console.log(`[OMIM Search] 查询: ${query} → ${url}`);

    try {
        const { html, cookies, fromCache } = await getHtml(url, force);
        const data = parseOmimSearch(html);
        return res.json({ ...data, _meta: { url, fromCache } });
    } catch (err) {
        console.error('[OMIM Search] 失败:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /omim/batch
 * body: { mimNumbers: ["143100","604370","176807"], force: false }
 * 批量抓取多个 Entry，逐个串行请求（避免触发限速）
 */
app.post('/omim/batch', async (req, res) => {
    const { mimNumbers, force } = req.body;
    if (!Array.isArray(mimNumbers) || mimNumbers.length === 0)
        return res.status(400).json({ error: 'mimNumbers array is required' });

    console.log(`[OMIM Batch] 共 ${mimNumbers.length} 条`);
    const results = [];

    for (const mim of mimNumbers) {
        const url = `${OMIM_BASE}/entry/${mim}`;
        try {
            const { html, fromCache } = await getHtml(url, force);
            const data = parseOmimEntry(html);
            results.push({ mimNumber: mim, ok: true, data, fromCache });
        } catch (err) {
            results.push({ mimNumber: mim, ok: false, error: err.message });
        }
        // 每条之间随机间隔 1~3 秒，降低被封风险
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    }

    res.json({ total: results.length, results });
});

/**
 * POST /omim/gene
 * body: { geneSymbol: "BRCA1", force: false }
 * 通过基因符号搜索并返回第一条匹配 Entry
 */
app.post('/omim/gene', async (req, res) => {
    const { geneSymbol, force } = req.body;
    if (!geneSymbol) return res.status(400).json({ error: 'geneSymbol is required' });

    const searchUrl = `${OMIM_BASE}/search?index=entry&search=${encodeURIComponent(geneSymbol)}&limit=5&start=0`;
    try {
        const { html } = await getHtml(searchUrl, force);
        const searchData = parseOmimSearch(html);

        if (!searchData.results.length)
            return res.json({ found: false, geneSymbol });

        // 取第一条带 * 前缀（基因条目）的结果
        const geneEntry = searchData.results.find(r => r.prefix === '*') || searchData.results[0];
        const mimNum = geneEntry.mimNumber.replace(/\D/g, '');

        const entryUrl = `${OMIM_BASE}/entry/${mimNum}`;
        const { html: entryHtml, fromCache } = await getHtml(entryUrl, force);
        const entryData = parseOmimEntry(entryHtml);

        res.json({ found: true, geneSymbol, ...entryData, _meta: { fromCache } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 保留原 /cf 通用端点（兼容其它网站） ────────────────────────
app.post('/cf', async (req, res) => {
    const { url, referer, force } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });
    try {
        const result = await getHtml(url, force);
        res.json({ ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /omim/cookie
 * 获取请求Cookie
 */
app.get('/omim/cookie', async (req, res) => {
    const url = 'https://www.omim.org/';
    const result = await bypassCF(url,url);
    res.send(result);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`OMIM 爬虫服务运行中: http://0.0.0.0:${PORT}`);
    console.log('POST /omim/entry   { mimNumber }');
    console.log('GET  /omim/crawl');
    console.log('POST /omim/search  { query }');
    console.log('POST /omim/batch   { mimNumbers[] }');
    console.log('POST /omim/gene    { geneSymbol }');
    console.log('GET  /omim/cookie');
});