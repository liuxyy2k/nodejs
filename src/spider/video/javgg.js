/**
 * 🌸JavGG 蜘蛛插件（修复版）
 *
 * 修复要点（相对旧版）：
 *  1. 站点已弃用 playmate.to —— 详情页播放器换成三种新壳（earnvid / f4jav / vidara），
 *     旧逻辑永远匹配不到 playmate id 导致 /play 返回空地址（= 播放不了）。
 *  2. 线路特征：
 *       earnvid*  → 页面 packer 加密，解包后取 links.hls4 / hls2，分片为「PNG 头 + 真 TS」需剥壳
 *       f4jav*    → /api/play/<uuid>?ab=0&n=1 取签名直链，拉流必须带 Origin/Referer，链接约 5 分钟过期
 *       vidara*   → POST /api/stream 取 m3u8，token 绑定请求方 IP，播放器直连必 403
 *     ⇒ 三条线路统一走本插件中转，中转层实时换签名 / 剥壳 / 补头，播放器只管拉本地地址。
 *  3. 首页翻页改为 /jav/page/N；分类 tag 归档整站 500，自动降级为站内搜索，
 *     genre / trending / random 仍按原路径。
 *  4. 列表卡片字段变化（图片多为 data-src，部分卡片无 .titlecontent），已做多级兜底 + 去重 + 过滤广告位。
 *  5. 不再硬编码本地代理（旧的 127.0.0.1:7897 在服务器上必然全站失败），改为 ext.proxy 可选。
 */

import axios from 'axios';
import { load } from 'cheerio';

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const HOSTS = ['https://javgg.co', 'https://javgg.net', 'https://javgg.club'];

const ROUTE = 'spider/javgg/3';

const CLASSES = [
    { type_name: '最新', type_id: 'new-post' },
    { type_name: '今日热门', type_id: 'trending://today' },
    { type_name: '本周热门', type_id: 'trending://weekly' },
    { type_name: '本月热门', type_id: 'trending://monthly' },
    { type_name: '无码', type_id: 'search://uncensored' },
    { type_name: '有码', type_id: 'search://censored' },
    { type_name: '英字', type_id: 'search://english subtitle' },
    { type_name: '中字', type_id: 'search://chinese subtitle' },
    { type_name: '素人', type_id: 'search://amateur' },
    { type_name: '随机', type_id: 'random' },
    { type_name: '中出', type_id: 'genre/creampie' },
    { type_name: '巨乳', type_id: 'genre/big-tits' },
    { type_name: '人妻', type_id: 'genre/married-woman' },
    { type_name: '美少女', type_id: 'genre/beautiful-girl' },
    { type_name: '熟女', type_id: 'genre/mature-woman' },
    { type_name: '4K', type_id: 'genre/4k' },
    { type_name: '高清', type_id: 'genre/high-definition' },
    { type_name: '单体作品', type_id: 'genre/solowork' },
    { type_name: '苗条', type_id: 'genre/slender' },
    { type_name: '痴女', type_id: 'genre/slut' },
];

const cfg = {
    base: '',
    cookie: '',
    proxy: '',
    streamProxy: false,
    proxyBase: '',
    timeout: 15000,
    probeDetail: true,
};

let host = HOSTS[0];

/* ------------------------------------------------------------------ 基础工具 */

function applyExt(ext) {
    if (!ext || typeof ext !== 'object') return;
    for (const k of Object.keys(cfg)) {
        const v = ext[k];
        if (v === undefined || v === null || v === '') continue;
        if (k === 'timeout') cfg.timeout = Math.max(5000, parseInt(v, 10) || cfg.timeout);
        else if (k === 'streamProxy') cfg.streamProxy = v === true || v === 'true' || v === 1;
        else if (k === 'probeDetail') cfg.probeDetail = !(v === false || v === 'false' || v === 0);
        else cfg[k] = String(v);
    }
    if (cfg.base) host = cfg.base.replace(/\/+$/, '');
}

function timeoutOf(v) {
    const n = parseInt(v, 10);
    return n > 2000 ? n : cfg.timeout;
}

function cleanText(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
}

function fixUrl(url, base) {
    if (!url) return '';
    const u = String(url).trim();
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return (base || host) + u;
    if (/^https?:\/\//i.test(u)) return u;
    try {
        return new URL(u, (base || host) + '/').href;
    } catch {
        return u;
    }
}

function buildHeaders(referer) {
    const h = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
    };
    if (referer) h.Referer = referer;
    if (cfg.cookie) h.Cookie = cfg.cookie;
    return h;
}

async function httpGet(url, opt = {}) {
    const resp = await axios.get(url, {
        headers: { ...buildHeaders(opt.referer), ...(opt.headers || {}) },
        timeout: opt.timeout || cfg.timeout,
        responseType: opt.responseType || 'text',
        maxRedirects: 5,
        validateStatus: () => true,
        transformResponse: opt.responseType === 'text' ? [(d) => d] : undefined,
    });
    return resp;
}

async function httpPost(url, body, opt = {}) {
    return axios.post(url, body, {
        headers: {
            ...buildHeaders(opt.referer),
            'Content-Type': 'application/json',
            ...(opt.headers || {}),
        },
        timeout: opt.timeout || cfg.timeout,
        responseType: opt.responseType || 'json',
        validateStatus: () => true,
    });
}

async function getHtml(url, opt = {}) {
    const target = /^https?:\/\//i.test(url) ? url : fixUrl(url);
    const candidates = [target];
    try {
        const u = new URL(target);
        // 当前可用 host 优先，其余镜像只作兜底
        const ordered = HOSTS.slice().sort((a, b) => (a === host ? -1 : b === host ? 1 : 0));
        for (const h of ordered) {
            if (u.host === new URL(h).host) continue;
            candidates.push(h + u.pathname + u.search);
        }
    } catch { /* ignore */ }

    const budget = Math.min(opt.budget || 22000, 40000);
    const deadline = Date.now() + budget;

    for (const c of candidates) {
        if (Date.now() > deadline) break;
        const left = Math.max(4000, deadline - Date.now());
        try {
            const resp = await httpGet(c, { referer: c, timeout: Math.min(opt.timeout || cfg.timeout, left) });
            const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200 && text.length > 1200) {
                try {
                    const u = new URL(c);
                    if (/javgg\.(co|net|club)$/i.test(u.host)) {
                        host = `${u.protocol}//${u.host}`;
                    }
                } catch { /* ignore */ }
                return text;
            }
        } catch { /* 换下一个镜像 */ }
    }
    return '';
}

/* ------------------------------------------------------------------ 列表解析 */

function cardLink($, el) {
    const $e = $(el);
    let href = $e.find('.data h3 a').attr('href') || '';
    if (!href) href = $e.find('.titlecontent ~ a, .poster a').last().attr('href') || '';
    if (!href) href = $e.find('a[href*="/jav/"]').first().attr('href') || '';
    if (!href) href = $e.find('a').first().attr('href') || '';
    return fixUrl(href);
}

function slugTitle(url) {
    const m = String(url || '').match(/\/jav\/([^/?#]+)/i);
    return m ? m[1].replace(/-/g, ' ').toUpperCase() : '';
}

function parseList(html, base) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const $ = load(html);
    $('article').each((_, el) => {
        const $e = $(el);
        const url = cardLink($, el);
        // 只收站内详情页，过滤 javhd 之类的广告外链
        if (!url || !/\/jav\/[^/]+/i.test(url)) return;
        if (seen.has(url)) return;
        seen.add(url);

        const img = $e.find('img').first();
        let pic = img.attr('src') || img.attr('data-src') || img.attr('data-original') || '';
        pic = fixUrl(pic, base);

        let name = cleanText($e.find('.titlecontent').text());
        if (!name) name = cleanText($e.find('.data h3 a').text());
        if (!name) name = cleanText(img.attr('alt'));
        if (!name) name = slugTitle(url);

        let remarks = cleanText($e.find('.data span').text());
        if (!remarks) remarks = cleanText($e.find('.data h3 a').text());
        if (remarks && remarks === name) remarks = '';

        out.push({ vod_id: url, vod_name: name, vod_pic: pic, vod_remarks: remarks });
    });
    if (!out.length) {
        // 兜底：极少数页面卡片不是 article
        $('div.poster').each((_, el) => {
            const $e = $(el);
            const a = $e.find('a[href*="/jav/"]').first();
            const url = fixUrl(a.attr('href'));
            if (!url || seen.has(url) || !/\/jav\/[^/]+/i.test(url)) return;
            seen.add(url);
            const img = $e.find('img').first();
            let name = cleanText($e.find('.titlecontent').text()) || cleanText(img.attr('alt')) || slugTitle(url);
            out.push({
                vod_id: url,
                vod_name: name,
                vod_pic: fixUrl(img.attr('src') || img.attr('data-src'), base),
                vod_remarks: '',
            });
        });
    }
    return out;
}

function pageCount(html) {
    let max = 1;
    const of = String(html || '').match(/Page\s*[\d,]+\s*of\s*([\d,]+)/i);
    if (of) {
        const n = parseInt(of[1].replace(/,/g, ''), 10);
        if (n > max) max = n;
    }
    const re = /\/page\/(\d+)\/?/g;
    let m;
    while ((m = re.exec(String(html || '')))) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
    }
    return max;
}

/* ------------------------------------------------------------------ 分类 / 搜索 URL */

function categoryUrl(tid, pg) {
    const n = parseInt(pg, 10) || 1;
    const id = String(tid || 'new-post');

    if (id.startsWith('trending://')) {
        const sort = id.slice('trending://'.length) || 'today';
        return n === 1
            ? `${host}/trending/?sort=${sort}`
            : `${host}/trending/page/${n}/?sort=${sort}`;
    }
    if (id.startsWith('search://')) {
        const kw = encodeURIComponent(id.slice('search://'.length));
        return n === 1 ? `${host}/?s=${kw}` : `${host}/?s=${kw}&page=${n}`;
    }
    if (id === 'random' || id === 'random/') return `${host}/random/`;
    if (id === 'new-post' || id === 'home') {
        // 首页是聚合页没有分页器；/jav/ 才是完整列表（90 条/页、6000+ 页）
        return n === 1 ? `${host}/jav/` : `${host}/jav/page/${n}/`;
    }
    if (id.startsWith('tag/')) {
        // tag 归档整站 500，降级为站内搜索
        const kw = encodeURIComponent(id.slice(4).replace(/-/g, ' '));
        return n === 1 ? `${host}/?s=${kw}` : `${host}/?s=${kw}&page=${n}`;
    }
    // genre/xxx、/绝对路径、带 query 的自定义路径
    const path = id.replace(/^\/+/, '').replace(/\/+$/, '');
    const qIdx = path.indexOf('?');
    const pure = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const qs = qIdx >= 0 ? path.slice(qIdx) : '';
    if (n === 1) return `${host}/${pure}/${qs}`;
    return `${host}/${pure}/page/${n}/${qs}`;
}

/* ------------------------------------------------------------------ 播放器识别 */

function detectPlayer(embedUrl) {
    let u;
    try {
        u = new URL(embedUrl);
    } catch {
        return null;
    }
    const h = u.hostname.toLowerCase();
    const path = u.pathname;
    // 路径花样很多：/e/<code>、/embed/<code>、/v/<code>……统一记录完整路径
    const m = path.match(/\/(e|embed|v)\/([^/?#]+)/i);
    if (!m) return null;
    const code = `/${m[1]}/${m[2]}`;

    let engine = 'auto';
    if (/earnvid/i.test(h)) engine = 'ev';
    else if (/f4jav|f4stream/i.test(h)) engine = 'f4';
    else if (/vidara|plauymito|playmate/i.test(h)) engine = 'vd';

    return { engine, code, origin: `${u.protocol}//${u.host}` };
}

function collectEmbeds(html) {
    const $ = load(html || '');
    const seen = new Set();
    const list = [];
    $('iframe').each((_, el) => {
        const src = fixUrl($(el).attr('src') || $(el).attr('data-src') || '');
        if (!src || seen.has(src)) return;
        if (!/^https?:\/\//i.test(src)) return;
        seen.add(src);
        list.push(src);
    });
    return list;
}

/* ------------------------------------------------------------------ packer 解包 */

function jsUnescape(s) {
    return String(s)
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t');
}

function unpackPacker(src) {
    const text = String(src || '');
    const head = text.indexOf('eval(function(p,a,c,k,e,d)');
    if (head < 0) return '';
    // 取最后一个参数串：('payload',a,c,'k'.split('|'),0,{})
    const tail = text.slice(head);
    const m = tail.match(
        /\('((?:\\.|[^'\\])*)',\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/s
    );
    if (!m) return '';
    const payload = jsUnescape(m[1]);
    const radix = parseInt(m[2], 10) || 62;
    const count = parseInt(m[3], 10) || 0;
    const words = jsUnescape(m[4]).split('|');

    let p = payload;
    for (let c = count - 1; c >= 0; c--) {
        if (!words[c]) continue;
        p = p.replace(new RegExp('\\b' + c.toString(radix) + '\\b', 'g'), words[c]);
    }
    return p;
}

/* ------------------------------------------------------------------ 线路解析（带缓存） */

const streamCache = new Map(); // engine|origin|code -> { master, headers, exp }

function cacheGet(key, now) {
    const it = streamCache.get(key);
    if (!it) return null;
    if (it.exp && it.exp <= now) {
        streamCache.delete(key);
        return null;
    }
    return it;
}

async function resolveEv(origin, code) {
    let html = '';
    for (const p of [code, `/embed/${code.split('/').pop()}`, `/e/${code.split('/').pop()}`]) {
        try {
            const resp = await httpGet(`${origin}${p}`, { referer: 'https://javgg.co/' });
            const t = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
            if (resp.status === 200 && t.length > 800 && !isBlocked(t)) {
                html = t;
                break;
            }
            if (resp.status === 403 || resp.status === 404) return null;
        } catch { /* 换路径 */ }
    }
    if (!html) return null;

    const unpacked = unpackPacker(html) || html;
    const urls = [];

    // 首选 hls4（站内直通），其次 hls3 / hls2
    const order = ['hls4', 'hls2', 'hls3', 'hls1'];
    for (const k of order) {
        const re = new RegExp(`${k}"\\s*:\\s*"([^"]+)"`);
        const m = unpacked.match(re);
        if (m && m[1]) urls.push(m[1]);
    }
    // 兜底：直接抓所有 m3u8
    const all = unpacked.match(/https?:\/\/[^\s"'<>\\]+?\.m3u8[^\s"'<>\\]*/g) || [];
    for (const u of all) if (!urls.includes(u)) urls.push(u);

    if (!urls.length) return null;
    let tried = 0;
    for (const raw of urls) {
        if (tried >= 3) break;
        tried += 1;
        const master = raw.startsWith('/') ? `${origin}${raw}` : raw;
        // 相对路径的走站内，绝对路径（acek-cdn）直接连
        const needOrigin = /earnvid/i.test(master) || master.startsWith(origin);
        const headers = needOrigin ? { Origin: origin, Referer: `${origin}/` } : {};
        if (await probeDeep(master, headers)) return { master, headers };
    }
    return null;
}

async function resolveF4(origin, code) {
    const embed = `${origin}${code}`;
    const resp = await httpGet(embed, { referer: 'https://javgg.co/' });
    const html = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (resp.status !== 200 || !html || isBlocked(html)) return null;

    let api = (html.match(/data-api="([^"]+)"/) || [])[1] || '';
    let vid = (html.match(/data-video-id="([^"]+)"/) || [])[1] || '';
    if (!api && vid) api = `/api/play/${vid}`;
    if (!api) return null;

    const apiUrl = api.startsWith('http') ? api : `${origin}${api}`;
    const ref = encodeURIComponent('https://javgg.co/');
    const tries = [`${apiUrl}?ab=0&n=1&r=${ref}`, `${apiUrl}?ab=0&r=${ref}`];
    for (const u of tries) {
        let r;
        try {
            r = await httpGet(u, {
                referer: embed,
                headers: { Accept: 'application/json', Origin: origin },
            });
        } catch {
            continue;
        }
        const data = typeof r.data === 'string' ? safeJson(r.data) : r.data;
        const src = data && (data.src || data.url);
        if (!src) continue;
        const master = src.startsWith('http') ? src : `${origin}${src}`;
        const headers = { Origin: origin, Referer: `${origin}/` };
        if (await probeDeep(master, headers)) {
            const ttl = Math.max(60, Math.min((parseInt(data.expires_in, 10) || 300) - 45, 900));
            return { master, headers, ttl: ttl * 1000 };
        }
    }
    return null;
}

async function resolveVd(origin, code) {
    const filecode = code.split('/').pop();
    const api = `${origin}/api/stream`;
    let resp;
    try {
        resp = await httpPost(
            api,
            {
                filecode,
                device: 'web',
                codecs: { av1: 'av01.0.09M.10', h265: 'hvc1.1.6.L123.B0' },
            },
            { referer: `${origin}${code}`, headers: { Origin: origin } }
        );
    } catch {
        return null;
    }
    const data = typeof resp.data === 'string' ? safeJson(resp.data) : resp.data;
    const src = data && data.streaming_url;
    if (!src) return null;
    const headers = { Referer: `${origin}/` };
    if (await probeDeep(src, headers)) {
        // token 绑定请求方 IP，必须每次现场重签
        return { master: src, headers, ttl: 90 * 1000 };
    }
    return null;
}

async function resolveAuto(origin, code) {
    // 播放器域名换得很勤（earnvid→streamhg 之类），所以按页面内容判定，不只看域名
    const tail = code.split('/').pop();
    const deadline = Date.now() + 14000;
    for (const pfx of [code, `/e/${tail}`, `/embed/${tail}`, `/v/${tail}`]) {
        if (Date.now() > deadline) break;
        let html = '';
        let status = 0;
        try {
            const r = await httpGet(`${origin}${pfx}`, { referer: 'https://javgg.co/' });
            status = r.status;
            html = typeof r.data === 'string' ? r.data : '';
        } catch { continue; }
        if (status === 403 || status === 401 || status === 404) return null;
        if (isBlocked(html)) return null;
        if (/data-api=["']\/api\/play\//i.test(html) || /data-video-id=["']/i.test(html)) {
            const r = await resolveF4(origin, code);
            if (r) return r;
        }
        if (/eval\(function\(p,a,c,k,e,d\)/i.test(html)) {
            const r = await resolveEv(origin, code);
            if (r) return r;
        }
        if (/\/api\/stream/i.test(html)) {
            const r = await resolveVd(origin, code);
            if (r) return r;
        }
    }
    for (const fn of [resolveVd, resolveF4, resolveEv]) {
        try {
            const r = await fn(origin, code);
            if (r) return r;
        } catch { /* 试下一种 */ }
    }
    return null;
}

function isBlocked(html) {
    const t = String(html || '');
    if (!t) return true;
    if (t.length < 4000 && /DDoS-Guard|HTTP ERROR 403|Access denied|Just a moment\.\.\.|cf-browser-verification/i.test(t)) return true;
    if (t.length < 3000 && /no longer available|has been deleted|file is expired|404 Not Found/i.test(t)) return true;
    return false;
}

function safeJson(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

async function probe(url, headers) {
    if (!url) return false;
    try {
        const r = await httpGet(url, {
            referer: headers.Referer,
            headers: { ...headers, Accept: '*/*' },
            timeout: 12000,
        });
        const t = typeof r.data === 'string' ? r.data : String(r.data || '');
        return r.status >= 200 && r.status < 400 && t.includes('#EXTM3U');
    } catch {
        return false;
    }
}

async function probeDeep(master, headers) {
    try {
        const r = await httpGet(master, {
            referer: headers.Referer,
            headers: { ...headers, Accept: '*/*' },
            timeout: 12000,
        });
        const masterText = typeof r.data === 'string' ? r.data : String(r.data || '');
        if (!masterText.includes('#EXTM3U')) return false;

        // 主列表 → 第一个子列表
        let variantUrl = '';
        let variantText = '';
        if (/^#EXTINF/im.test(masterText)) {
            variantUrl = master;
            variantText = masterText;
        } else {
            const v = masterText.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
            if (!v) return false;
            variantUrl = absUrl(v, master);
            const r2 = await httpGet(variantUrl, {
                referer: headers.Referer,
                headers: { ...headers, Accept: '*/*' },
                timeout: 12000,
            });
            variantText = typeof r2.data === 'string' ? r2.data : String(r2.data || '');
            if (!variantText.includes('#EXTM3U')) return false;
        }

        // 子列表 → 第一个分片，只取头部 1KB，够判断死活了
        const seg = variantText.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
        if (!seg) return false;
        const segUrl = absUrl(seg, variantUrl);
        const r3 = await httpGet(segUrl, {
            referer: headers.Referer,
            headers: { ...headers, Range: 'bytes=0-1023', Accept: '*/*' },
            timeout: 15000,
            responseType: 'arraybuffer',
        });
        if (r3.status >= 400) return false;
        const buf = Buffer.isBuffer(r3.data) ? r3.data : Buffer.from(r3.data || []);
        return buf.length > 0;
    } catch {
        return false;
    }
}

async function getStream(engine, origin, code) {
    const key = `${engine}|${origin}|${code}`;
    const now = Date.now();
    const hit = cacheGet(key, now);
    if (hit) return hit;

    let res = null;
    if (engine === 'ev') res = await resolveEv(origin, code);
    else if (engine === 'f4') res = await resolveF4(origin, code);
    else if (engine === 'vd') res = await resolveVd(origin, code);
    else {
        res = await resolveAuto(origin, code);
        if (res) {
            // auto 命中后记住真实引擎，避免反复试探
            const real = engineOfOrigin(origin);
            if (real) streamCache.set(`${real}|${origin}|${code}`, { ...res, exp: now + (res.ttl || 240000) });
        }
    }
    if (!res) return null;

    const item = { ...res, exp: now + (res.ttl || 240000) };
    streamCache.set(key, item);
    if (streamCache.size > 500) streamCache.clear();
    return item;
}

function engineOfOrigin(origin) {
    try {
        const h = new URL(origin).hostname.toLowerCase();
        if (/earnvid/.test(h)) return 'ev';
        if (/f4jav|f4stream/.test(h)) return 'f4';
        if (/vidara|plauymito|playmate/.test(h)) return 'vd';
    } catch { /* ignore */ }
    return '';
}

/* ------------------------------------------------------------------ 播放列表 / 分片中转 */

const listCache = new Map(); // engine|origin|code|path -> { segs, exp }

function isPlaylistUrl(u) {
    return /\.(m3u8|txt)(\?|$)/i.test(u) || /[?&]type=m3u8/i.test(u);
}

function absUrl(u, base) {
    try {
        return new URL(u, base).href;
    } catch {
        return u;
    }
}

function wrapUrl(origin, engine, eo, code, path, idx) {
    const p = encodeURIComponent(path);
    const base = `${origin}/${ROUTE}`;
    const q = `e=${engine}&h=${encodeURIComponent(eo)}&c=${encodeURIComponent(code)}&p=${p}`;
    if (idx === undefined || idx === null) return `${base}/m3u8?${q}`;
    return `${base}/seg?${q}&i=${idx}`;
}

function rewriteMaster(text, origin, engine, eo, code) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let pendingStreamInf = false;
    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('#')) {
            // 主列表里可能出现 EXT-X-MEDIA 音频轨，一并改写到中转
            if (/^#EXT-X-MEDIA/i.test(t)) {
                out.push(
                    t.replace(/URI="([^"]+)"/i, (full, uri) => {
                        const rel = relPath(uri, '');
                        return `URI="${wrapUrl(origin, engine, eo, code, rel)}"`;
                    })
                );
                continue;
            }
            out.push(t);
            if (/^#EXT-X-STREAM-INF/i.test(t)) pendingStreamInf = true;
            continue;
        }
        if (pendingStreamInf || isPlaylistUrl(t) || !/\.(ts|m4s|mp4|aac|woff2|image|jpg|png|bin)(\?|$)/i.test(t)) {
            pendingStreamInf = false;
            out.push(wrapUrl(origin, engine, eo, code, t));
        } else {
            out.push(wrapUrl(origin, engine, eo, code, t));
        }
    }
    return out.join('\n');
}

function relPath(u, base) {
    // 统一成"相对 master 的路径"，便于重新签名后复用
    const s = String(u).trim();
    if (!base) return s;
    try {
        const abs = new URL(s, base).href;
        return abs;
    } catch {
        return s;
    }
}

function rewriteVariant(text, variantUrl, origin, engine, eo, code, variantPath) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let idx = 0;
    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        if (t.startsWith('#')) {
            if (/^#EXT-X-KEY|^#EXT-X-MAP|^#EXT-X-SESSION-KEY/i.test(t)) {
                out.push(
                    t.replace(/URI="([^"]+)"/i, (full, uri) => {
                        const abs = absUrl(uri, variantUrl);
                        return `URI="${origin}/${ROUTE}/seg?e=${engine}&h=${encodeURIComponent(
                            eo
                        )}&c=${encodeURIComponent(code)}&p=${encodeURIComponent(variantPath)}&u=${encodeURIComponent(abs)}"`;
                    })
                );
                continue;
            }
            out.push(t);
            continue;
        }
        out.push(wrapUrl(origin, engine, eo, code, variantPath, idx));
        idx += 1;
    }
    return out.join('\n');
}

function extractSegments(text, variantUrl) {
    const segs = [];
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        segs.push(absUrl(t, variantUrl));
    }
    return segs;
}

async function fetchPlaylist(engine, eo, code, path) {
    const key = `${engine}|${eo}|${code}|${path}`;
    const now = Date.now();
    const hit = listCache.get(key);
    if (hit && hit.exp > now) return hit.data;

    const stream = await getStream(engine, eo, code);
    if (!stream) return null;

    const url = path ? absUrl(path, stream.master) : stream.master;
    const resp = await httpGet(url, {
        referer: stream.headers.Referer,
        headers: { ...stream.headers, Accept: '*/*' },
        timeout: 20000,
    });
    const text = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (resp.status >= 400 || !text.includes('#EXTM3U')) return null;

    const data = { text, url, stream };
    listCache.set(key, { data, exp: now + 90 * 1000 });
    if (listCache.size > 800) listCache.clear();
    return data;
}

/* ------------------------------------------------------------------ 剥壳（PNG 头 + TS） */

function looksLikePng(buf) {
    return buf.length > 80 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function looksLikeTs(buf) {
    if (buf.length < 376) return false;
    return buf[0] === 0x47 && buf[188] === 0x47;
}

function stripShell(buf) {
    if (!buf || !buf.length) return { buf, ok: false, shell: false };
    if (looksLikeTs(buf)) return { buf, ok: true, shell: false };
    if (!looksLikePng(buf)) {
        // 有些分片只带极短垃圾头，扫前 512 字节找同步
        const off = findSync(buf, 0);
        if (off > 0 && off < 512 && (buf.length - off) % 188 === 0) {
            return { buf: buf.subarray(off), ok: true, shell: true };
        }
        if (buf[0] === 0x47) return { buf, ok: true, shell: false };
        return { buf, ok: false, shell: false };
    }
    let start = -1;
    const iend = buf.indexOf(Buffer.from('IEND'));
    if (iend > 0) {
        start = findSync(buf, iend + 4);
    } else {
        start = findSync(buf, 0);
    }
    if (start < 0) return { buf, ok: false, shell: true };
    return { buf: buf.subarray(start), ok: true, shell: true };
}

function findSync(buf, from) {
    const limit = Math.min(buf.length - 1, from + 4096);
    for (let i = Math.max(0, from); i < limit; i++) {
        if (buf[i] !== 0x47) continue;
        if (i + 188 >= buf.length) continue;
        if (buf[i + 188] !== 0x47) continue;
        if (i + 376 < buf.length && buf[i + 376] !== 0x47) continue;
        return i;
    }
    return -1;
}

/* ------------------------------------------------------------------ 主程序接口 */

async function init(inReq) {
    applyExt(inReq && inReq.ext);
    return { class: CLASSES };
}

async function home(inReq) {
    applyExt(inReq && inReq.ext);
    const html = await getHtml(host + '/');
    return { class: CLASSES, list: parseList(html, host) };
}

async function category(inReq) {
    applyExt(inReq && inReq.ext);
    const tid = String((inReq.body && inReq.body.id) || 'new-post');
    const pg = String((inReq.body && inReq.body.page) || 1);
    const url = categoryUrl(tid, pg);
    const html = await getHtml(url);
    const list = parseList(html, host);
    return {
        list,
        page: parseInt(pg, 10) || 1,
        pagecount: html ? pageCount(html) : 1,
        limit: list.length || 40,
        total: 999999,
    };
}

async function detail(inReq) {
    applyExt(inReq && inReq.ext);
    const vodId = String((inReq.body && inReq.body.id) || '');
    const html = await getHtml(vodId);
    if (!html) return { list: [] };

    const $ = load(html);
    let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    title = cleanText(title).replace(/\s*-\s*javgg\..*$/i, '');
    let pic = $('meta[property="og:image"]').attr('content') || '';
    pic = fixUrl(pic, host);
    const content = cleanText($('meta[name="description"]').attr('content') || '');

    const embeds = collectEmbeds(html);
    const used = new Set();
    let cands = [];
    for (const src of embeds) {
        const p = detectPlayer(src);
        if (!p || used.has(src)) continue;
        used.add(src);
        cands.push({ src, p });
    }

    // 并发探活：站点经常挂一两个死线路，直接给播放器只会黑屏
    if (cands.length && cfg.probeDetail !== false) {
        const checked = await Promise.all(
            cands.map((c) =>
                Promise.race([
                    (async () => {
                        try {
                            const st = await getStream(c.p.engine, c.p.origin, c.p.code);
                            return { ...c, ok: !!st };
                        } catch {
                            return { ...c, ok: false };
                        }
                    })(),
                    new Promise((r) => setTimeout(() => r({ ...c, ok: true, timeout: true }), 6000)),
                ])
            )
        );
        const alive = checked.filter((c) => c.ok);
        // 全都探不通时保留原列表（可能只是临时网络抖动），别把线路清空
        if (alive.length) cands = alive;
    }

    const from = [];
    const urls = [];
    cands.forEach((c) => {
        from.push(`线路${from.length + 1}`);
        urls.push(`正片$${c.src}`);
    });

    if (!from.length) {
        from.push('Javgg');
        urls.push(`正片$${vodId}`);
    }

    return {
        list: [
            {
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_content: content,
                vod_play_from: from.join('$$$'),
                vod_play_url: urls.join('$$$'),
            },
        ],
    };
}

const CN_MAP = [
    [/黑丝|丝袜|黑スツ/, 'black'],
    [/巨乳|爆乳|大奶/, 'big tits'],
    [/人妻|已婚|不伦/, 'married woman'],
    [/中出|内射/, 'creampie'],
    [/美少女|少女/, 'beautiful girl'],
    [/熟女|五十路/, 'mature woman'],
    [/素人|业余/, 'amateur'],
    [/无码|无修正|破解/, 'uncensored'],
    [/有码|有修正/, 'censored'],
    [/中字|中文字幕/, 'chinese subtitle'],
    [/英字|英文字幕/, 'english subtitle'],
    [/单体/, 'solowork'],
    [/苗条|细身/, 'slender'],
    [/痴女/, 'slut'],
    [/潮吹/, 'squirting'],
    [/口交/, 'blowjob'],
    [/骑乘/, 'cowgirl'],
    [/高清/, 'high definition'],
    [/4k|４ｋ/i, '4k'],
];

function cnFallback(wd) {
    for (const [re, en] of CN_MAP) if (re.test(wd)) return en;
    return '';
}

async function search(inReq) {
    applyExt(inReq && inReq.ext);
    const wd = String((inReq.body && inReq.body.wd) || '').trim();
    const pg = parseInt((inReq.body && inReq.body.page) || 1, 10) || 1;
    if (!wd) return { list: [], page: pg };

    const fetchPage = async (kw) => {
        const k = encodeURIComponent(kw);
        const url = pg === 1 ? `${host}/?s=${k}` : `${host}/?s=${k}&page=${pg}`;
        const html = await getHtml(url);
        return { list: parseList(html, host), page: pg, total: pageCount(html) };
    };

    let res = await fetchPage(wd);
    // 站内搜索只认拉丁词，中文关键词换英文再打一次
    if (!res.list.length && /[\u4e00-\u9fa5]/.test(wd)) {
        const alt = cnFallback(wd);
        if (alt) res = await fetchPage(alt);
    }
    return res;
}

function requestOrigin(inReq) {
    const h = inReq.headers || {};
    const proto = String(h['x-forwarded-proto'] || 'http').split(',')[0].trim();
    const hostname = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
    let prefix = String(h['x-forwarded-prefix'] || '').trim();
    if (prefix && !prefix.startsWith('/')) prefix = '/' + prefix;
    if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
    const basePath = cfg.proxyBase ? cfg.proxyBase.replace(/\/+$/, '') : '';
    return `${proto}://${hostname}${basePath || prefix || ''}`;
}

async function play(inReq) {
    applyExt(inReq && inReq.ext);
    const origin = requestOrigin(inReq);
    let raw = String((inReq.body && inReq.body.id) || '').trim();
    if (raw.includes('$')) raw = raw.split('$').pop().trim();
    if (!raw) return { parse: 0, jx: 0, url: '', header: {} };

    let target = detectPlayer(raw);

    // 传的是详情页地址 → 重新抓一遍找 iframe
    if (!target && /^https?:\/\//i.test(raw) && /javgg\.(co|net|club)/i.test(raw)) {
        const html = await getHtml(raw);
        const embeds = collectEmbeds(html);
        for (const e of embeds) {
            const p = detectPlayer(e);
            if (p) {
                target = p;
                break;
            }
        }
    }
    if (!target) return { parse: 0, jx: 0, url: '', header: {} };

    const label = ['ev', 'f4', 'vd'].includes(target.engine) ? target.engine : 'auto';
    const q = `e=${label}&h=${encodeURIComponent(target.origin)}&c=${encodeURIComponent(target.code)}`;
    const url = `${origin}/${ROUTE}/m3u8?${q}&p=`;

    // 先探一次，拿不到就换下一个线路（返回可用性提示，避免播放器黑屏无反馈）
    const stream = await getStream(label, target.origin, target.code);
    if (!stream) return { parse: 0, jx: 0, url: '', header: {} };

    return { parse: 0, jx: 0, url, header: {} };
}

async function m3u8(inReq, reply) {
    const q = inReq.query || {};
    const engine = String(q.e || 'auto');
    const eo = String(q.h || '');
    const code = String(q.c || '');
    const path = String(q.p || '');
    const origin = requestOrigin(inReq);

    if (!eo || !code) {
        reply.code(400);
        return 'bad request';
    }

    let data;
    try {
        data = await fetchPlaylist(engine, eo, code, path);
    } catch {
        data = null;
    }
    if (!data) {
        reply.code(502);
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        return 'playlist failed';
    }

    const text = data.text;
    const isMaster = !/^#EXTINF/im.test(text) && /#EXT-X-STREAM-INF|#EXT-X-MEDIA/i.test(text);
    const body = isMaster
        ? rewriteMaster(text, origin, engine, eo, code)
        : rewriteVariant(text, data.url, origin, engine, eo, code, path);

    reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'no-store');
    return reply.send(body);
}

async function seg(inReq, reply) {
    const q = inReq.query || {};
    const engine = String(q.e || 'auto');
    const eo = String(q.h || '');
    const code = String(q.c || '');
    const path = String(q.p || '');
    const idx = q.i;
    const direct = String(q.u || '');

    if (!eo || !code) {
        reply.code(400);
        return 'bad request';
    }

    let target = '';
    let headers = {};
    try {
        if (direct) {
            const stream = await getStream(engine, eo, code);
            if (!stream) {
                reply.code(502);
                return 'segment failed';
            }
            target = /^https?:\/\//i.test(direct) ? direct : absUrl(direct, stream.master);
            headers = stream.headers;
        } else {
            const data = await fetchPlaylist(engine, eo, code, path);
            if (!data) {
                reply.code(502);
                return 'segment failed';
            }
            const segs = extractSegments(data.text, data.url);
            const n = parseInt(idx, 10);
            if (!Number.isInteger(n) || n < 0 || n >= segs.length) {
                reply.code(404);
                return 'segment out of range';
            }
            target = segs[n];
            headers = data.stream.headers;
        }
    } catch {
        reply.code(502);
        return 'segment failed';
    }

    // 分片按整片取：剥壳后长度会变，转发 Range 会让 Content-Range 错位，播放器 seek 反而花屏
    const reqHeaders = { ...headers, Accept: '*/*' };

    let resp;
    try {
        resp = await axios.get(target, {
            headers: reqHeaders,
            responseType: 'arraybuffer',
            timeout: 25000,
            validateStatus: () => true,
            maxRedirects: 5,
        });
    } catch {
        reply.code(502);
        return 'segment failed';
    }

    let buf = Buffer.isBuffer(resp.data) ? resp.data : Buffer.from(resp.data || []);
    if (resp.status >= 400 || !buf.length) {
        reply.code(502);
        return 'segment failed';
    }

    // mp4 / init 段（EXT-X-MAP）原样透传
    const isMp4 = buf.length > 12 && buf.slice(4, 8).toString('latin1') === 'ftyp';
    if (!isMp4) {
        const shell = stripShell(buf);
        if (!shell.ok && buf[0] !== 0x47) {
            reply.code(502);
            return 'segment failed';
        }
        buf = shell.buf;
    }

    const ctype = isMp4 ? 'video/mp4' : 'video/mp2t';
    reply.code(200);
    reply.header('Content-Type', ctype);
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=60');
    reply.header('Content-Length', String(buf.length));
    return reply.send(buf);
}

export default {
    meta: {
        key: 'javgg',
        name: '🌸JavGG',
        type: 3,
    },
    api: async (fastify) => {
        fastify.post('/init', init);
        fastify.post('/home', home);
        fastify.post('/category', category);
        fastify.post('/detail', detail);
        fastify.post('/play', play);
        fastify.post('/search', search);
        fastify.get('/m3u8', m3u8);
        fastify.get('/seg', seg);
    },
};
