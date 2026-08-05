import axios from 'axios';
import https from 'https';
import { URL } from 'url';

/**
 * 2048核基地 - 域名自动获取 + m3u8 广告清洗（无 AES）
 * 屏蔽图片/小说分类
 */

const PORT = process.env.DEV_HTTP_PORT || 9988;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEBUG = true;

const PUBLISH_PAGES = [
    'https://www.luanlunba.cc',
    'https://s7t8u9v0.luanlunba13.cc',
    'https://s7t8u9v0.luanlunba14.cc',
];

const FALLBACK_CATS = [
    { type_id: '1', type_name: '劲爆推荐' },
    { type_id: '2', type_name: '精品爆料' },
    { type_id: '58', type_name: '网曝黑料' },
    { type_id: '3', type_name: '特色仓库' },
    { type_id: '69', type_name: '精品资源' },
    { type_id: '78', type_name: '热播片库' },
];

const EMPTY_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64',
);

let hosts = ['https://s7t8u9v0.luanlunba15.cc'];
let host = hosts[0];
let categories = [];
const cookieStore = new Map();


const http = axios.create({
    timeout: 20_000,
    validateStatus: () => true,
    headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
});

function log(msg) {
    if (DEBUG) console.log(`[luanlunba] ${msg}`);
}

function getHeaders(referer) {
    const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: referer || `${host}/`,
    };
    if (cookieStore.size) {
        headers.Cookie = [...cookieStore.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    return headers;
}

function setCookiesFromSetCookie(setCookie) {
    if (!setCookie) return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const raw of list) {
        const part = String(raw).split(';')[0];
        const eq = part.indexOf('=');
        if (eq > 0) cookieStore.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
}

function setCookiesFromDocumentCookie(cookieStr) {
    for (const part of String(cookieStr).split(';')) {
        const p = part.trim();
        if (!p || /^(path|max-age|expires|domain|secure|httponly)/i.test(p)) continue;
        const eq = p.indexOf('=');
        if (eq > 0) cookieStore.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
    }
}

function absUrl(u) {
    if (!u) return '';
    if (u.startsWith('http')) return u;
    try {
        return new URL(u, host.endsWith('/') ? host : `${host}/`).href;
    } catch {
        return u.startsWith('/') ? `${host.replace(/\/$/, '')}${u}` : `${host}/${u}`;
    }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, referer, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) await sleep(500 + Math.random() * 1000);
            const resp = await http.get(url, { headers: getHeaders(referer), responseType: 'text' });
            setCookiesFromSetCookie(resp.headers['set-cookie']);
            if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            log(`请求失败 [${resp.status}] ${url}`);
            return '';
        } catch (e) {
            log(`请求异常 ${e.message}，重试 ${attempt + 1}`);
        }
    }
    return '';
}

function getProxyBase(inReq) {
    const prefix = inReq?.server?.prefix || `/spider/luanlunba/3`;
    return `http://127.0.0.1:${PORT}${prefix}/proxy`;
}

function proxyM3u8Url(url, referer, inReq) {
    const base = getProxyBase(inReq);
    return `${base}?do=m3u8&url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || host)}`;
}

// ─── 域名自动更新 ─────────────────────────────────────────────────────────────

async function updateHost() {
    for (const pub of PUBLISH_PAGES) {
        try {
            const r1 = await http.get(`${pub}/`, { headers: getHeaders(), responseType: 'text' });
            setCookiesFromSetCookie(r1.headers['set-cookie']);
            const html1 = typeof r1.data === 'string' ? r1.data : '';
            const cookieMatch = html1.match(/document\.cookie\s*=\s*"([^"]+)"/);
            if (cookieMatch) {
                setCookiesFromDocumentCookie(cookieMatch[1]);
                log(`发布页 ${pub} Cookie已设置`);
            }

            const ajaxHeaders = getHeaders(`${pub}/`);
            ajaxHeaders['X-Requested-With'] = 'XMLHttpRequest';
            const r2 = await http.get(`${pub}/xuexi/data.php`, {
                headers: ajaxHeaders,
                responseType: 'text',
            });
            setCookiesFromSetCookie(r2.headers['set-cookie']);

            let urls = [];
            try {
                const data = typeof r2.data === 'object' ? r2.data : JSON.parse(r2.data);
                urls = data?.urls || [];
                log(`发布页 ${pub} 返回 ${urls.length} 个域名`);
            } catch {
                const text = typeof r2.data === 'string' ? r2.data : String(r2.data || '');
                urls = [...text.matchAll(/(https?:\/\/[a-z0-9]+\.luanlunba\d*\.\w+)/gi)].map((m) => m[1]);
                log(`发布页 ${pub} JSON失败，从HTML提取到 ${urls.length} 个域名`);
            }

            for (let url of urls) {
                url = String(url).replace(/\/$/, '');
                if (!url.startsWith('http')) continue;
                try {
                    const test = await http.get(`${url}/`, {
                        headers: getHeaders(),
                        responseType: 'text',
                        timeout: 8_000,
                    });
                    const body = typeof test.data === 'string' ? test.data : '';
                    if (test.status === 200 && body.length > 1000) {
                        if (/vodtype|arttype|voddetail/.test(body)) {
                            log(`验证可用域名: ${url}`);
                            host = url;
                            hosts = [url, ...hosts.filter((h) => h !== url)];
                            return true;
                        }
                    }
                } catch {
                    /* continue */
                }
            }
        } catch (e) {
            log(`发布页 ${pub} 获取失败: ${e.message}`);
        }
    }

    for (const h of hosts) {
        try {
            const test = await http.get(`${h}/`, {
                headers: getHeaders(),
                responseType: 'text',
                timeout: 8_000,
            });
            const body = typeof test.data === 'string' ? test.data : '';
            if (test.status === 200 && body.length > 1000) {
                host = h;
                log(`使用备用域名: ${h}`);
                return true;
            }
        } catch {
            /* continue */
        }
    }

    log('所有域名获取方式均失败');
    return false;
}

// ─── 分类 / 列表解析 ──────────────────────────────────────────────────────────

function dedupCats(cats) {
    const seen = new Set();
    const out = [];
    for (const c of cats) {
        if (seen.has(c.type_id)) continue;
        seen.add(c.type_id);
        out.push(c);
    }
    return out;
}

function parseCategories(html) {
    const cats = [];
    const menuMatch = html.match(/<div[^>]+class="menu\s+clearfix"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    const menuText = menuMatch ? menuMatch[1] : html;
    const links = [...menuText.matchAll(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];

    const ignore = new Set(['首页', '搜索', '全部', '更多', '排行', '留言', '帮助', '返回首页', '发布页', '传送门']);

    for (const [, href, text] of links) {
        const m = href.match(/\/(vodtype|arttype)\/(\d+)\.html/);
        if (!m) continue;
        const [, typePrefix, tid] = m;
        if (typePrefix === 'arttype') continue; // 屏蔽图片/小说
        const name = text.replace(/<[^>]+>/g, '').trim();
        if (!name || name.length > 15 || ignore.has(name)) continue;
        cats.push({ type_id: tid, type_name: name, type: 'vod' });
    }
    return dedupCats(cats);
}

function parseVideoList(html) {
    const items = [];
    const dlPattern =
        /<dl>\s*<dt[^>]*>[\s\S]*?<a[^>]*href="\/voddetail\/(\d+)\.html"[^>]*>[\s\S]*?<img[^>]*data-original="([^"]*)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/dt>\s*<dd>\s*<a[^>]*href="\/voddetail\/\d+\.html"[^>]*>([\s\S]*?)<\/a>\s*<\/dd>\s*<\/dl>/g;

    for (const m of html.matchAll(dlPattern)) {
        const [, vid, imgRaw, titleBlock] = m;
        const img = absUrl(imgRaw);
        const title = titleBlock.replace(/<[^>]+>/g, '').trim();
        items.push({
            vod_id: vid,
            vod_name: title || '未知标题',
            vod_pic: img,
            vod_remarks: '',
        });
    }
    return items;
}

function extractM3u8(html) {
    const urls = [];
    if (!html) return urls;

    const playerMatch = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\});/);
    if (playerMatch) {
        try {
            const data = JSON.parse(playerMatch[1]);
            const raw = data?.url || '';
            if (raw) {
                const decoded = decodeURIComponent(raw);
                if (decoded.startsWith('http')) urls.push(decoded);
            }
        } catch {
            /* ignore */
        }
    }

    for (const m of html.matchAll(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/g)) {
        urls.push(m[1]);
    }

    if (!urls.length) {
        for (const scr of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
            for (const m of scr[1].matchAll(/["']url["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/g)) {
                urls.push(m[1]);
            }
        }
    }

    const seen = new Set();
    const clean = [];
    for (const u of urls) {
        if (u.startsWith('http') && !seen.has(u)) {
            seen.add(u);
            clean.push(u);
        }
    }
    return clean;
}

async function videoDetail(vid, html, inReq) {
    let title = '';
    let cover = '';

    let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (m) title = m[1].replace(/<[^>]+>/g, '').trim();
    if (!title) {
        m = html.match(/<title>([\s\S]*?)<\/title>/);
        if (m) title = m[1].trim();
    }

    m = html.match(/<img[^>]*data-original="([^"]*)"[^>]*>/);
    if (m) cover = m[1];
    if (!cover) {
        m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
        if (m) cover = m[1];
    }
    cover = absUrl(cover);

    let buttons = [
        ...html.matchAll(
            new RegExp(
                `<div[^>]+class="item"[^>]*>\\s*<a[^>]+href="(/vodplay/${vid}[-_]\\d+[-_]\\d+\\.html)"[^>]*>([\\s\\S]*?)</a>`,
                'g',
            ),
        ),
    ].map((x) => [x[1], x[2]]);

    if (!buttons.length) {
        buttons = [...html.matchAll(new RegExp(`href="(/vodplay/${vid}[^"]*)"[^>]*>([\\s\\S]*?)</a>`, 'g'))].map(
            (x) => [x[1], x[2]],
        );
    }
    if (!buttons.length) {
        buttons = [[`/vodplay/${vid}-1-1.html`, '立即播放']];
        log(`未匹配到播放按钮，使用默认: ${buttons[0][0]}`);
    }

    const lineMap = new Map();
    const cache = new Map();

    for (const [href, btnRaw] of buttons) {
        const btnName = btnRaw.replace(/<[^>]+>/g, '').trim() || '播放';
        const playUrl = absUrl(href);

        let m3u8List;
        if (cache.has(href)) {
            m3u8List = cache.get(href);
        } else {
            const playHtml = await fetchText(playUrl);
            m3u8List = playHtml ? extractM3u8(playHtml) : [];
            cache.set(href, m3u8List);
            log(`播放页 ${href} 提取到 ${m3u8List.length} 个地址`);
        }

        if (!lineMap.has(btnName)) lineMap.set(btnName, []);

        if (m3u8List.length) {
            m3u8List.forEach((m3u8, i) => {
                const name = i === 0 ? btnName : `${btnName}_${i + 1}`;
                lineMap.get(btnName).push([name, m3u8]);
            });
        } else {
            lineMap.get(btnName).push([btnName, playUrl]);
            log(`播放页 ${href} 未提取到 m3u8，回退到播放页 URL`);
        }
    }

    if (!lineMap.size) {
        return {
            list: [
                {
                    vod_id: vid,
                    vod_name: title,
                    vod_pic: cover,
                    vod_play_from: '错误',
                    vod_play_url: '未找到播放地址',
                },
            ],
        };
    }

    const fromLines = [];
    const urlLines = [];
    for (const [lineName, episodes] of lineMap) {
        fromLines.push(lineName);
        urlLines.push(episodes.map(([epName, epUrl]) => `${epName}$${epUrl}`).join('#'));
    }

    return {
        list: [
            {
                vod_id: vid,
                vod_name: title,
                vod_pic: cover,
                vod_play_from: fromLines.join('$$$'),
                vod_play_url: urlLines.join('$$$'),
            },
        ],
    };
}

// ─── m3u8 广告清洗 ────────────────────────────────────────────────────────────

function segmentHostKey(uri, baseUrl) {
    try {
        const full = new URL(uri, baseUrl);
        const path = full.pathname.replace(/\/[^/]*$/, '/');
        return `${full.host.toLowerCase()}|${path.toLowerCase()}`;
    } catch {
        return '|';
    }
}

function mainPathMarker(m3u8Url) {
    try {
        const p = new URL(m3u8Url).pathname;
        let m = p.match(/(\/\d{8}\/[^/]+\/\d+kb\/hls\/)/);
        if (m) return m[1].toLowerCase();
        m = p.match(/(\/\d{8}\/[^/]+\/)/);
        if (m) return m[1].toLowerCase();
    } catch {
        /* ignore */
    }
    return '';
}

function isAdSegment(uri, dur) {
    const u = String(uri || '').trim().toLowerCase();
    if (!u) return false;
    const adWords = [
        'ad', 'ads', 'advert', 'advertise', 'advertisement', 'sponsor',
        'pre', 'preroll', '片头', '广告', '/gg/', '_gg', 'gg_', '/adv/',
        '/ad/', '/ads/', 'banner', 'promo', 'commercial',
    ];
    if (adWords.some((w) => u.includes(w))) return true;
    const d = Number(dur);
    if (d > 0 && d <= 1.2) return true;
    return false;
}

function parseM3u8Segments(text) {
    const lines = String(text || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);

    const header = [];
    const segments = [];
    const tail = [];
    let pendingTags = [];
    let mediaSequence = 0;
    let targetDuration = 0;
    let started = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
            mediaSequence = parseInt(line.split(':')[1], 10) || 0;
            (started ? pendingTags : header).push(line);
        } else if (line.startsWith('#EXT-X-TARGETDURATION')) {
            targetDuration = parseFloat(line.split(':')[1]) || 0;
            (started ? pendingTags : header).push(line);
        } else if (line.startsWith('#EXTINF')) {
            started = true;
            let dur = targetDuration || 3;
            const dm = line.match(/#EXTINF:\s*([\d.]+)/);
            if (dm) dur = parseFloat(dm[1]) || dur;
            const tags = [...pendingTags, line];
            pendingTags = [];
            let uri = '';
            let j = i + 1;
            while (j < lines.length) {
                if (lines[j].startsWith('#')) {
                    tags.push(lines[j]);
                    j++;
                    continue;
                }
                uri = lines[j];
                break;
            }
            if (uri) {
                segments.push({ tags, uri, dur });
                i = j;
            } else {
                tail.push(...tags);
            }
        } else if (line.startsWith('#EXT-X-ENDLIST')) {
            tail.push(line);
        } else if (line.startsWith('#')) {
            (started ? pendingTags : header).push(line);
        } else {
            started = true;
            segments.push({ tags: pendingTags, uri: line, dur: targetDuration || 3 });
            pendingTags = [];
        }
        i++;
    }
    return { header, segments, tail, mediaSequence, targetDuration };
}

function cleanM3u8(m3u8Text, m3u8Url = '', referer = '', skipSeconds = 25, inReq) {
    const text = String(m3u8Text || '').replace(/\r/g, '');

    if (text.includes('#EXT-X-STREAM-INF')) {
        const out = [];
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (!line) continue;
            if (line.startsWith('#')) {
                out.push(line);
            } else {
                const abs = new URL(line, m3u8Url).href;
                out.push(line.toLowerCase().includes('.m3u8') ? proxyM3u8Url(abs, referer, inReq) : abs);
            }
        }
        return `${out.join('\n')}\n`;
    }

    const { header, segments, tail, mediaSequence, targetDuration } = parseM3u8Segments(text);
    if (!segments.length) return text;

    const marker = mainPathMarker(m3u8Url);
    const stat = {};
    for (const seg of segments) {
        const key = segmentHostKey(seg.uri, m3u8Url);
        stat[key] = (stat[key] || 0) + Number(seg.dur || 0);
    }
    const mainKey = Object.entries(stat).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const totalDur = Object.values(stat).reduce((a, b) => a + b, 0) || 0;
    const mainDur = stat[mainKey] || 0;

    let cleaned = [];
    let removed = 0;

    segments.forEach((seg, idx) => {
        const key = segmentHostKey(seg.uri, m3u8Url);
        const isFront = idx < 12;
        let absUri = '';
        try {
            absUri = new URL(seg.uri, m3u8Url).href;
        } catch {
            absUri = seg.uri;
        }
        let isAd = isAdSegment(seg.uri, seg.dur);
        try {
            const path = new URL(absUri).pathname.toLowerCase();
            if (marker && !path.includes(marker)) isAd = true;
        } catch {
            /* ignore */
        }
        const tagsText = (seg.tags || []).join('\n').toUpperCase();
        if (isFront && tagsText.includes('METHOD=NONE') && marker) {
            try {
                if (!new URL(absUri).pathname.toLowerCase().includes(marker)) isAd = true;
            } catch {
                /* ignore */
            }
        }
        if (!isAd && isFront && totalDur > 0 && mainDur >= totalDur * 0.6) {
            if (key !== mainKey && (stat[key] || 0) <= 90) isAd = true;
        }
        if (isAd) {
            removed++;
            return;
        }
        cleaned.push({ ...seg, _idx: idx });
    });

    if (removed === 0 && segments.length > 4) {
        let acc = 0;
        let cut = 0;
        for (let idx = 0; idx < Math.min(12, segments.length); idx++) {
            const seg = segments[idx];
            const key = segmentHostKey(seg.uri, m3u8Url);
            if (key === mainKey && acc >= 3) break;
            acc += Number(seg.dur || targetDuration || 3);
            cut = idx + 1;
            if (acc >= skipSeconds) break;
        }
        if (cut > 0 && cut < segments.length) {
            const firstKey = segmentHostKey(segments[0].uri, m3u8Url);
            if (firstKey !== mainKey) {
                cleaned = segments.slice(cut).map((s, i) => ({ ...s, _idx: cut + i }));
                removed = cut;
            }
        }
    }

    if (!cleaned.length) {
        cleaned = segments.map((s, i) => ({ ...s, _idx: i }));
        removed = 0;
    }

    const newLines = [];
    let hasM3u = false;
    for (const line of header) {
        if (line.startsWith('#EXTM3U')) hasM3u = true;
        if (line.startsWith('#EXT-X-MEDIA-SEQUENCE') || line.startsWith('#EXT-X-START')) continue;
        if (line.startsWith('#EXT-X-KEY') && line.toUpperCase().includes('METHOD=NONE') && removed > 0) continue;
        newLines.push(line);
    }
    if (!hasM3u) newLines.unshift('#EXTM3U');
    const firstIdx = cleaned[0]?._idx ?? removed;
    newLines.push(`#EXT-X-MEDIA-SEQUENCE:${mediaSequence + firstIdx}`);

    for (const seg of cleaned) {
        for (let tag of seg.tags || []) {
            if (tag.startsWith('#EXT-X-KEY') || tag.startsWith('#EXT-X-MAP')) {
                tag = tag.replace(/URI="([^"]+)"/, (_, u) => `URI="${new URL(u, m3u8Url).href}"`);
            }
            newLines.push(tag);
        }
        newLines.push(new URL(seg.uri, m3u8Url).href);
    }

    if (tail.length) {
        for (const line of tail) {
            if (line.startsWith('#EXT-X-ENDLIST')) newLines.push(line);
        }
    } else if (text.includes('#EXT-X-ENDLIST')) {
        newLines.push('#EXT-X-ENDLIST');
    }

    log(`m3u8清洗: 原${segments.length}片 → 删除${removed}片广告，保留${cleaned.length}片`);
    return `${newLines.join('\n')}\n`;
}

async function getM3u8Content(url, referer) {
    try {
        const resp = await http.get(url, {
            headers: { ...getHeaders(referer), Referer: referer },
            responseType: 'text',
            timeout: 15_000,
        });
        if (resp.status === 200) return typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    } catch (e) {
        log(`下载 m3u8 失败: ${e.message}`);
    }
    return null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function init(_inReq, _outResp) {
    log('正在初始化...');
    cookieStore.clear();
    const ok = await updateHost();
    if (!ok) log('域名更新失败，使用默认域名');

    let html = await fetchText(`${host}/`);
    if (html) {
        const cats = parseCategories(html);
        if (cats.length) {
            categories = cats;
            log(`分类获取成功: ${cats.length} 个`);
            return {};
        }
    }

    html = await fetchText(`${host}/vodtype/1.html`);
    if (html) {
        const cats = parseCategories(html);
        if (cats.length) {
            categories = cats;
            log(`备用页分类获取成功: ${cats.length} 个`);
            return {};
        }
    }

    categories = FALLBACK_CATS.map((c) => ({ ...c, type: 'vod' }));
    log('使用硬编码分类（仅视频）');
    return {};
}

async function home(_inReq, _outResp) {
    try {
        if (!categories.length) await init(_inReq, _outResp);
        const classes = categories
            .filter((c) => c.type === 'vod')
            .map(({ type_id, type_name }) => ({ type_id, type_name }));
        const html = await fetchText(`${host}/`);
        const items = html ? parseVideoList(html) : [];
        return { class: classes, filters: {}, list: items.slice(0, 20) };
    } catch (e) {
        log(`home 异常: ${e.message}`);
        return { class: [], filters: {}, list: [] };
    }
}

async function category(inReq, _outResp) {
    try {
        const tid = String(inReq.body.id || '');
        const page = parseInt(inReq.body.page || inReq.body.pg || 1, 10) || 1;

        const cat = categories.find((c) => String(c.type_id) === tid);
        if (cat && cat.type !== 'vod') {
            return { list: [], page, pagecount: 1 };
        }

        const url =
            page > 1 ? `${host}/vodtype/${tid}-${page}.html` : `${host}/vodtype/${tid}.html`;
        const html = await fetchText(url);
        const items = html ? parseVideoList(html) : [];

        let totalPages = page;
        if (html) {
            const pageLinks = [...html.matchAll(new RegExp(`/vodtype/${tid}[-_](\\d+)\\.html`, 'g'))].map((x) =>
                parseInt(x[1], 10),
            );
            totalPages = pageLinks.length ? Math.max(...pageLinks) : page + 1;
        }

        return { list: items, page, pagecount: Math.max(totalPages, page) };
    } catch (e) {
        log(`category 异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1 };
    }
}

async function detail(inReq, _outResp) {
    const vid = String(inReq.body.id || '');
    try {
        const html = await fetchText(`${host}/voddetail/${vid}.html`);
        if (html) return await videoDetail(vid, html, inReq);
        return {
            list: [{ vod_id: vid, vod_name: '未知影片', vod_play_from: '错误', vod_play_url: '' }],
        };
    } catch (e) {
        log(`detail 异常: ${e.message}`);
        return {
            list: [{ vod_id: vid, vod_name: '错误', vod_play_from: '错误', vod_play_url: '' }],
        };
    }
}

async function play(inReq, _outResp) {
    const id = String(inReq.body.id || '');
    const header = { 'User-Agent': UA, Referer: host };

    if (/^https?:\/\//i.test(id) && /\.(m3u8|mp4|ts)(\?|$)/i.test(id)) {
        if (/\.m3u8/i.test(id)) {
            return { parse: 0, url: proxyM3u8Url(id, host, inReq), header };
        }
        return { parse: 0, url: id, header };
    }
    return { parse: 1, url: id, header };
}

async function search(inReq, _outResp) {
    try {
        const key = inReq.body.wd || '';
        const page = parseInt(inReq.body.pg || inReq.body.page || 1, 10) || 1;
        const url = `${host}/vodsearch/-------------.html?wd=${encodeURIComponent(key)}&page=${page}`;
        const html = await fetchText(url);
        const items = html ? parseVideoList(html) : [];
        return { list: items, page, pagecount: page + 1 };
    } catch (e) {
        log(`search 异常: ${e.message}`);
        return { list: [], page: 1, pagecount: 1 };
    }
}

async function proxyHandler(inReq, outResp) {
    const doType = inReq.query.do || '';

    // m3u8 广告清洗
    if (doType === 'm3u8') {
        try {
            const url = inReq.query.url || '';
            const referer = inReq.query.referer || host;
            if (!url) return outResp.code(404).type('text/plain').send('missing url');
            const raw = await getM3u8Content(url, referer);
            if (!raw) return outResp.code(404).type('text/plain').send('m3u8 download failed');
            const cleaned = cleanM3u8(raw, url, referer, 25, inReq);
            return outResp.type('application/vnd.apple.mpegurl').send(cleaned);
        } catch (e) {
            log(`m3u8 清洗异常: ${e.message}`);
            return outResp.code(404).type('text/plain').send('proxy error');
        }
    }

    // 图片代理：?url=http... 或直接传完整 url
    const imgUrl = inReq.query.url || '';
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) {
        return outResp.type('image/gif').send(EMPTY_GIF);
    }
    try {
        const r = await http.get(imgUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', Referer: `${host}/` },
            responseType: 'arraybuffer',
            timeout: 15_000,
        });
        const ct = r.headers['content-type'] || 'application/octet-stream';
        return outResp.type(ct).send(Buffer.from(r.data));
    } catch {
        return outResp.type('image/gif').send(EMPTY_GIF);
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
    meta: {
        key: 'luanlunba',
        name: '2048核基地',
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
