import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import https from 'https';

/**
 * 91蝌蚪窝 - https://91kdw.cc
 * 防采集 cron.php 会话 + Base64 标题解密
 */

const site = 'https://91kdw.cc';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEBUG = true;
const SKIP_CATS = new Set(['欧美色情', '日本BT', '国产BT']);

const jar = new CookieJar();

const http = wrapper(
    axios.create({
        jar,
        timeout: 30_000,
        validateStatus: () => true,
        headers: {
            'User-Agent': UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
    }),
);

let categories = [];

function log(msg) {
    if (DEBUG) console.log(`[91kdw] ${msg}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${site}/`,
    };
}

function unescapeHtml(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function decodeB64(encoded) {
    if (!encoded) return '';
    const clean = encoded.trim();
    try {
        const raw = Buffer.from(clean, 'base64');
        for (const enc of ['utf-8', 'gbk', 'gb18030']) {
            try {
                let decoded = raw.toString(enc);
                try {
                    decoded = decodeURIComponent(decoded);
                } catch {
                    /* keep */
                }
                return decoded;
            } catch {
                /* try next */
            }
        }
    } catch {
        /* ignore */
    }
    return clean;
}

function extractEncryptedTitle(rawText) {
    if (!rawText) return '';
    const m = rawText.match(/d\s*\(\s*['"]([A-Za-z0-9+/=]{8,})['"]\s*\)/i);
    if (!m) return '';
    const decoded = decodeB64(m[1]);
    if (decoded && !decoded.includes('<') && !/script/i.test(decoded) && decoded.length < 50) {
        return decoded.trim();
    }
    return '';
}

async function fetchText(url, referer, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) await sleep(1000 + Math.random() * 1000);
            const resp = await http.get(url, {
                headers: getHeaders(referer),
                responseType: 'text',
            });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200) return text;
            if ([403, 429, 503].includes(resp.status)) {
                log(`被拦截 [${resp.status}]，重试 ${attempt + 1}: ${url}`);
                continue;
            }
            log(`失败 [${resp.status}]: ${url}`);
            return '';
        } catch (e) {
            log(`异常 [${e.message}]，重试 ${attempt + 1}: ${url}`);
        }
    }
    return '';
}

async function bypassShield(html) {
    let text = html;
    const cronMatch = text?.match(/<img\s+src="(\/cron\.php\?id=\d+)"/);
    if (cronMatch) {
        const cronUrl = site + cronMatch[1];
        log(`检测到防采集保护，初始化会话: ${cronUrl}`);
        await fetchText(cronUrl);
        await sleep(3000);
        text = await fetchText(site);
    }
    return text || '';
}

function loadCategories(text) {
    if (!text) return [];
    const cats = [];
    const seenTid = new Set();
    const seenName = new Set();

    for (const m of text.matchAll(/href="(\/list\/(\d+)-1\.html)"[^>]*>([\s\S]*?)<\/a>/g)) {
        const [, , tid, content] = m;
        if (seenTid.has(tid)) continue;

        let name = extractEncryptedTitle(content);
        if (!name) {
            let clean = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            clean = clean.replace(/<[^>]+>/g, '').trim();
            name = unescapeHtml(clean).trim();
        }
        if (!name || name.length > 30 || name.includes('<') || /script/i.test(name)) continue;
        if (seenName.has(name) || SKIP_CATS.has(name)) continue;

        seenTid.add(tid);
        seenName.add(name);
        cats.push({ type_id: tid, type_name: name });
    }
    log(`分类: ${cats.length} 个`);
    return cats;
}

function parseList(html) {
    const items = [];
    if (!html) return items;
    const seen = new Set();
    const cards = html.split(/<div class="thumbnail group">/);

    for (let i = 1; i < cards.length; i++) {
        const card = cards[i];
        const linkM = card.match(/\/video\/(\d+)\.html/);
        if (!linkM) continue;
        const vid = linkM[1];
        if (seen.has(vid)) continue;
        seen.add(vid);

        const imgM = card.match(/<img[^>]+(?:src|data-src)="([^"]+)"/);
        const pic = imgM ? imgM[1] : '';

        let title = '未知标题';
        const dM = card.match(/d\s*\(\s*['"]([A-Za-z0-9+/=]{10,})['"]\s*\)/);
        if (dM) {
            const decoded = decodeB64(dM[1]);
            if (decoded && !decoded.includes('<') && decoded.length < 100) {
                title = decoded.trim();
            }
        }

        items.push({
            vod_id: vid,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: '',
        });
    }
    log(`解析列表: ${items.length} 个视频`);
    return items;
}

async function getList(tid, page) {
    const url = `${site}/list/${tid}-${page}.html`;
    const html = await fetchText(url, `${site}/list/${tid}-1.html`);
    return html ? parseList(html) : [];
}

function parseDetail(html, vid) {
    let title = '';
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) {
        const dM = h1[1].match(/d\s*\(\s*['"]([A-Za-z0-9+/=]{10,})['"]\s*\)/);
        if (dM) title = decodeB64(dM[1]);
    }
    if (!title) {
        const tM = html.match(/<title>([^<]+)<\/title>/);
        if (tM) title = tM[1].trim();
    }

    let cover = '';
    const og = html.match(/property="og:image"[^>]*content="([^"]+)"/);
    if (og) cover = og[1];

    const playUrls = [];
    const seen = new Set();
    const add = (label, u) => {
        if (!u || seen.has(u)) return;
        seen.add(u);
        playUrls.push(`${label}$${u}`);
    };

    for (const m of html.matchAll(/playFilteredHLS\s*\([^)]*['"](https?:\/\/[^"']+\.php[^"']*)['"]/g)) {
        add('播放', m[1]);
    }
    for (const m of html.matchAll(/<iframe[^>]+(?:src|data-src)="([^"]*play\.php[^"]*)"/g)) {
        add('播放', m[1]);
    }
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|flv|ts)(?:\?[^\s"'<>]*)?/g)) {
        add('直链', m[0]);
    }
    if (!playUrls.length) {
        for (const m of html.matchAll(/['"](https?:\/\/[^"']*play\.php[^"']*)['"]/g)) {
            add('备用', m[1]);
        }
    }

    if (!playUrls.length) {
        log(`无播放链接: ${vid}`);
        return null;
    }

    // 单线路，多地址用 # 分隔（修正原 Python from/url 数量不一致问题）
    return {
        vod_id: vid,
        vod_name: title || vid,
        vod_pic: cover,
        vod_play_from: '91kdw',
        vod_play_url: playUrls.join('#'),
    };
}

async function fetchDetail(vid) {
    let html = await fetchText(`${site}/video/${vid}.html`, site);
    if (!html) {
        for (const alt of [`/torrent/${vid}.html`, `/v/${vid}.html`, `/movie/${vid}.html`]) {
            html = await fetchText(`${site}${alt}`, site);
            if (html) break;
        }
    }
    if (!html) return null;
    return parseDetail(html, vid);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    let text = await fetchText(site);
    text = await bypassShield(text);
    if (text) categories = loadCategories(text);
    return {};
}

async function home(_inReq, _outResp) {
    try {
        let text = await fetchText(site);
        text = await bypassShield(text);
        if (text) categories = loadCategories(text);
        const cats = categories || [];
        const items = cats.length ? await getList(cats[0].type_id, 1) : [];
        return { class: cats, filters: {}, list: items };
    } catch (e) {
        log(`home: ${e.message}`);
        return { class: [], filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || '');
        const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;
        const items = await getList(tid, page);

        let totalPage = page + 1;
        if (page === 1) {
            const html = await fetchText(`${site}/list/${tid}-1.html`);
            if (html) {
                const pages = [...html.matchAll(/\/list\/\d+-(\d+)\.html/g)].map((m) => parseInt(m[1], 10));
                if (pages.length) totalPage = Math.max(...pages);
            }
        }
        return { list: items, page, pagecount: totalPage };
    } catch (e) {
        log(`category: ${e.message}`);
        return { list: [], page: 1, pagecount: 1 };
    }
}

async function detail(inReq, _outResp) {
    try {
        const vid = String(inReq.body.id || '');
        if (vid.startsWith('magnet:')) {
            return {
                list: [
                    {
                        vod_id: vid,
                        vod_name: '磁力资源',
                        vod_play_from: '磁力',
                        vod_play_url: `磁力$${vid}`,
                    },
                ],
            };
        }
        const d = await fetchDetail(vid);
        return { list: d ? [d] : [] };
    } catch (e) {
        log(`detail: ${e.message}`);
        return { list: [] };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    return {
        parse: 0,
        url: id,
        header: { Referer: site, 'User-Agent': UA },
    };
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        let url = `${site}/search.php?content=${encodeURIComponent(key)}&type=1&page=${page}`;
        let html = await fetchText(url, site);
        let items = html ? parseList(html) : [];
        if (!items.length) {
            url = `${site}/search.php?content=${encodeURIComponent(key)}&type=2&page=${page}`;
            html = await fetchText(url, site);
            items = html ? parseList(html) : [];
        }
        return { list: items, page, pagecount: page + 1 };
    } catch (e) {
        log(`search: ${e.message}`);
        return { list: [], page: 1, pagecount: 1 };
    }
}

async function proxyHandler(inReq, outResp) {
    const url = inReq.query.url || '';
    if (!url || !/^https?:\/\//i.test(url)) {
        return outResp.code(500).type('text/plain').send('error: invalid url');
    }
    try {
        const r = await http.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: `${site}/`,
            },
            responseType: 'arraybuffer',
            timeout: 15_000,
        });
        if (r.status !== 200) {
            return outResp.code(r.status).type('text/plain').send('proxy error');
        }
        const ct = r.headers['content-type'] || 'application/octet-stream';
        return outResp.type(ct).send(Buffer.from(r.data));
    } catch (e) {
        log(`localProxy error: ${e.message}`);
        return outResp.code(500).type('text/plain').send(String(e.message || e));
    }
}

export default {
    meta: {
        key: 'kdw91',
        name: '🔥91蝌蚪窝',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/proxy', proxyHandler);
    },
};
